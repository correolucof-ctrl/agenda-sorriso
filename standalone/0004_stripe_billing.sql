-- Apply after 0003_admin_only.sql. Existing approvals remain manual; new approvals require payment.
begin;

create table public.billing_subscriptions (
  clinic_id uuid primary key references public.clinic_registrations(clinic_id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
alter table public.billing_subscriptions enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_subscriptions, public.billing_events from public, anon, authenticated;
grant select on public.billing_subscriptions to authenticated;
grant all on public.billing_subscriptions, public.billing_events to service_role;
create policy billing_owner_read on public.billing_subscriptions for select to authenticated
  using (exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid() and not c.is_demo));

alter table public.commercial_access add column payment_required boolean not null default false;

-- The owner's access requires confirmed email, administrator approval and, for new
-- paid subscriptions, a current payment. Suspension always wins over Stripe events.
create or replace function public.is_clinic_owner(_clinic uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinics c
    join public.commercial_access a on a.clinic_id = c.id
    join auth.users u on u.id = c.owner_id
    left join public.billing_subscriptions b on b.clinic_id = c.id
    where c.id = _clinic and c.owner_id = auth.uid() and not c.is_demo
      and u.email_confirmed_at is not null and a.status = 'approved'
      and a.expires_at > now()
      and (not a.payment_required or (b.status in ('active', 'trialing') and b.current_period_end > now()))
  );
$$;

create or replace function public.get_clinic_portal_status()
returns text language sql stable security definer set search_path = ''
as $$
  select case
    when public.has_active_commercial_access() then 'active'
    when c.is_demo then 'legacy'
    when a.status = 'approved' and a.expires_at <= now() then 'expired'
    when a.status = 'approved' and a.payment_required then 'awaiting_payment'
    when a.status is not null then a.status
    when r.clinic_id is not null then 'pending'
    else 'unregistered'
  end
  from (values (auth.uid())) as account(user_id)
  left join public.clinics c on c.owner_id = account.user_id
  left join public.clinic_registrations r on r.clinic_id = c.id
  left join public.commercial_access a on a.clinic_id = c.id;
$$;

create or replace function public.decide_commercial_access(
  target_clinic uuid, next_status text, selected_plan text, expiration timestamptz
)
returns void language plpgsql security definer set search_path = ''
as $$
declare previous_status text;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso administrativo obrigatório' using errcode = '42501';
  end if;
  if next_status is null or next_status not in ('approved', 'rejected', 'suspended') then
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;
  if next_status = 'approved' and (expiration is null or expiration <= now() or selected_plan is null) then
    raise exception 'Informe um plano e um vencimento futuro' using errcode = '22023';
  end if;
  perform 1 from public.clinic_registrations r where r.clinic_id = target_clinic for update;
  if not found then raise exception 'Cadastro não encontrado' using errcode = 'P0002'; end if;
  select a.status into previous_status from public.commercial_access a where a.clinic_id = target_clinic;
  insert into public.commercial_access (clinic_id, status, plan, expires_at, payment_required)
  values (target_clinic, next_status, selected_plan, expiration, true)
  on conflict (clinic_id) do update set status = excluded.status, plan = excluded.plan,
    expires_at = excluded.expires_at, payment_required = true, updated_at = now();
  insert into public.commercial_access_audit (clinic_id, administrator_id, previous_status, status, plan, expires_at)
  values (target_clinic, auth.uid(), coalesce(previous_status, 'pending'), next_status, selected_plan, expiration);
end;
$$;

-- The webhook uses a single transaction to reject duplicates and update the
-- subscription snapshot. A stale webhook cannot reinstate a suspended clinic.
create function public.apply_stripe_subscription_event(
  p_event_id text, p_event_type text, p_clinic_id uuid, p_customer_id text,
  p_subscription_id text, p_price_id text, p_status text,
  p_period_end timestamptz, p_cancel_at_period_end boolean
)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  insert into public.billing_events(stripe_event_id, event_type) values (p_event_id, p_event_type)
  on conflict do nothing;
  if not found then return false; end if;
  perform 1 from public.commercial_access where clinic_id = p_clinic_id for update;
  if not found then raise exception 'Clínica não aprovada' using errcode = 'P0002'; end if;
  insert into public.billing_subscriptions(clinic_id, stripe_customer_id, stripe_subscription_id,
    stripe_price_id, status, current_period_end, cancel_at_period_end)
  values (p_clinic_id, p_customer_id, p_subscription_id, p_price_id,
    p_status, p_period_end, p_cancel_at_period_end)
  on conflict (clinic_id) do update set stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id, stripe_price_id = excluded.stripe_price_id,
    status = excluded.status, current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now();
  update public.commercial_access set expires_at = greatest(expires_at, coalesce(p_period_end, expires_at)), updated_at = now()
    where clinic_id = p_clinic_id and status = 'approved';
  return true;
end;
$$;
revoke all on function public.apply_stripe_subscription_event(text,text,uuid,text,text,text,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription_event(text,text,uuid,text,text,text,text,timestamptz,boolean) to service_role;

commit;
