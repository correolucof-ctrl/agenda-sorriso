-- Apply only to an independent Supabase project after the exported baseline.
begin;

create table public.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.commercial_access (
  clinic_id uuid primary key references public.clinic_registrations(clinic_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  plan text check (plan in ('essencial', 'crescimento', 'profissional')),
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  check (status <> 'approved' or (plan is not null and expires_at is not null))
);

create table public.commercial_access_audit (
  id bigint generated always as identity primary key,
  clinic_id uuid not null,
  administrator_id uuid not null,
  previous_status text not null,
  status text not null,
  plan text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.platform_administrators enable row level security;
alter table public.commercial_access enable row level security;
alter table public.commercial_access_audit enable row level security;

revoke all on public.platform_administrators, public.commercial_access, public.commercial_access_audit from public, anon, authenticated;
grant select on public.commercial_access to authenticated;

create policy commercial_access_owner_read on public.commercial_access
  for select to authenticated using (public.is_clinic_owner(clinic_id));

create function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.platform_administrators a
    join auth.users u on u.id = a.user_id
    where a.user_id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create function public.has_active_commercial_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.commercial_access a
    join public.clinics c on c.id = a.clinic_id
    join auth.users u on u.id = c.owner_id
    where c.owner_id = auth.uid() and u.email_confirmed_at is not null
      and a.status = 'approved' and a.expires_at > now()
  );
$$;

create function public.list_commercial_applications()
returns table (
  clinic_id uuid, clinic_name text, responsible_name text, contact_email text,
  status text, plan text, expires_at timestamptz
) language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso administrativo obrigatório' using errcode = '42501';
  end if;

  return query
    select r.clinic_id, r.clinic_name, r.responsible_name, r.contact_email,
           coalesce(a.status, 'pending'), a.plan, a.expires_at
    from public.clinic_registrations r
    left join public.commercial_access a on a.clinic_id = r.clinic_id
    order by r.created_at desc;
end;
$$;

create function public.decide_commercial_access(
  target_clinic uuid, next_status text, selected_plan text, expiration timestamptz
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  previous_status text;
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
  if not found then
    raise exception 'Cadastro não encontrado' using errcode = 'P0002';
  end if;
  select a.status into previous_status from public.commercial_access a where a.clinic_id = target_clinic;

  insert into public.commercial_access (clinic_id, status, plan, expires_at)
  values (target_clinic, next_status, selected_plan, expiration)
  on conflict (clinic_id) do update
    set status = excluded.status, plan = excluded.plan, expires_at = excluded.expires_at, updated_at = now();

  insert into public.commercial_access_audit (clinic_id, administrator_id, previous_status, status, plan, expires_at)
  values (target_clinic, auth.uid(), coalesce(previous_status, 'pending'), next_status, selected_plan, expiration);
end;
$$;

revoke all on function public.is_platform_admin() from public, anon, authenticated;
revoke all on function public.has_active_commercial_access() from public, anon, authenticated;
revoke all on function public.list_commercial_applications() from public, anon, authenticated;
revoke all on function public.decide_commercial_access(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_active_commercial_access() to authenticated;
grant execute on function public.list_commercial_applications() to authenticated;
grant execute on function public.decide_commercial_access(uuid, text, text, timestamptz) to authenticated;

commit;
