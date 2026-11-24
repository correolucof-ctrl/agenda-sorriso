-- Monthly included quota and durable, idempotent consumption.
begin;

create table public.credit_wallets (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  included_remaining integer not null check (included_remaining>=0),
  extra_remaining integer not null default 0 check (extra_remaining>=0),
  updated_at timestamptz not null default now()
);
create table public.credit_movements (
  id bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  reference text not null,
  reason text not null,
  units integer not null,
  included_delta integer not null,
  extra_delta integer not null,
  created_at timestamptz not null default now(),
  unique(clinic_id,reference)
);
alter table public.credit_wallets enable row level security;
alter table public.credit_movements enable row level security;
revoke all on public.credit_wallets,public.credit_movements from public,anon,authenticated;
grant all on public.credit_wallets,public.credit_movements to service_role;
grant select on public.credit_wallets to authenticated;
create policy credit_wallet_owner_read on public.credit_wallets for select to authenticated
  using (exists (select 1 from public.clinics c where c.id=clinic_id and c.owner_id=auth.uid() and not c.is_demo));

create function public.refresh_clinic_credits(p_clinic_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare quota integer; w public.credit_wallets%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select case a.plan when 'essencial' then 300 when 'crescimento' then 800
    when 'profissional' then 2000 else 0 end into quota
  from public.commercial_access a join public.billing_subscriptions b on b.clinic_id=a.clinic_id
  where a.clinic_id=p_clinic_id and a.status='approved' and a.expires_at>now()
    and b.status in ('active','trialing') and b.current_period_end>now();
  if quota is null or quota=0 then raise exception 'Assinatura inativa' using errcode='42501'; end if;
  select * into w from public.credit_wallets where clinic_id=p_clinic_id for update;
  if not found then
    insert into public.credit_wallets(clinic_id,period_start,period_end,included_remaining)
      values(p_clinic_id,now(),now()+interval '1 month',quota) on conflict(clinic_id) do nothing;
  elsif w.period_end<=now() then
    update public.credit_wallets set period_start=now(),period_end=now()+interval '1 month',
      included_remaining=quota,updated_at=now() where clinic_id=p_clinic_id;
  end if;
end;
$$;
revoke all on function public.refresh_clinic_credits(uuid) from public,anon,authenticated;
grant execute on function public.refresh_clinic_credits(uuid) to service_role;

create function public.consume_clinic_credits(p_clinic_id uuid,p_reference text,p_reason text,p_units integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare w public.credit_wallets%rowtype; use_included integer; use_extra integer;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_units<1 or p_units>1000 or length(p_reference)<3 or length(p_reference)>200 then
    raise exception 'Consumo inválido' using errcode='22023';
  end if;
  perform public.refresh_clinic_credits(p_clinic_id);
  select * into w from public.credit_wallets where clinic_id=p_clinic_id for update;
  if exists(select 1 from public.credit_movements where clinic_id=p_clinic_id and reference=p_reference) then return true; end if;
  if w.included_remaining+w.extra_remaining<p_units then return false; end if;
  use_included:=least(w.included_remaining,p_units);
  use_extra:=p_units-use_included;
  update public.credit_wallets set included_remaining=included_remaining-use_included,
    extra_remaining=extra_remaining-use_extra,updated_at=now() where clinic_id=p_clinic_id;
  insert into public.credit_movements(clinic_id,reference,reason,units,included_delta,extra_delta)
    values(p_clinic_id,p_reference,p_reason,p_units,-use_included,-use_extra);
  return true;
end;
$$;
revoke all on function public.consume_clinic_credits(uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.consume_clinic_credits(uuid,text,text,integer) to service_role;

create function public.grant_extra_credits(p_clinic_id uuid,p_reference text,p_units integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_units not in (100,500,1000) or length(p_reference)<3 or length(p_reference)>200 then
    raise exception 'Pacote inválido' using errcode='22023';
  end if;
  perform public.refresh_clinic_credits(p_clinic_id);
  perform 1 from public.credit_wallets where clinic_id=p_clinic_id for update;
  if exists(select 1 from public.credit_movements where clinic_id=p_clinic_id and reference=p_reference) then return false; end if;
  update public.credit_wallets set extra_remaining=extra_remaining+p_units,updated_at=now()
    where clinic_id=p_clinic_id;
  insert into public.credit_movements(clinic_id,reference,reason,units,included_delta,extra_delta)
    values(p_clinic_id,p_reference,'pacote_stripe',p_units,0,p_units);
  return true;
end;
$$;
revoke all on function public.grant_extra_credits(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.grant_extra_credits(uuid,text,integer) to service_role;

commit;
