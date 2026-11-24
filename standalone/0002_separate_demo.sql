begin;

alter table public.clinics alter column is_demo set default false;
alter table public.clinics alter column name set default 'Minha clínica';

create or replace function public.ensure_my_clinic()
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  clinic_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autenticação obrigatória' using errcode = '42501';
  end if;
  insert into public.clinics (owner_id)
  values (auth.uid())
  on conflict (owner_id) do nothing;
  select c.id into clinic_id from public.clinics c where c.owner_id = auth.uid();
  return clinic_id;
end;
$$;

drop trigger on_auth_user_created_clinic on auth.users;
revoke execute on function public.reset_demo_data() from authenticated;

-- Keep existing demo records intact and exclude their workspaces from real operation.
create or replace function public.is_clinic_owner(_clinic uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.clinics c
    join public.commercial_access a on a.clinic_id = c.id
    join auth.users u on u.id = c.owner_id
    where c.id = _clinic and c.owner_id = auth.uid() and not c.is_demo
      and u.email_confirmed_at is not null
      and a.status = 'approved' and a.expires_at > now()
  );
$$;

create or replace function public.has_active_commercial_access()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinics c
    where c.owner_id = auth.uid() and public.is_clinic_owner(c.id)
  );
$$;

drop policy registration_owner_read on public.clinic_registrations;
drop policy registration_owner_insert on public.clinic_registrations;
drop policy registration_owner_update on public.clinic_registrations;
create policy registration_owner_access on public.clinic_registrations
  for all to authenticated
  using (exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid() and not c.is_demo))
  with check (exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid() and not c.is_demo));

drop policy commercial_access_owner_read on public.commercial_access;
create policy commercial_access_owner_read on public.commercial_access for select to authenticated
  using (exists (select 1 from public.clinics c where c.id = clinic_id and c.owner_id = auth.uid() and not c.is_demo));

drop policy "Owner updates clinic" on public.clinics;
create policy "Approved owner updates clinic" on public.clinics for update to authenticated
  using (public.is_clinic_owner(id)) with check (public.is_clinic_owner(id));
revoke insert, update, delete on public.clinics from authenticated;
grant update (name, address, phone, timezone, min_advance_minutes, max_advance_days,
  slot_step_minutes, cancel_min_hours, reminder_hours_before) on public.clinics to authenticated;

create function public.get_clinic_portal_status()
returns text language sql stable security definer set search_path = ''
as $$
  select case
    when public.has_active_commercial_access() then 'active'
    when c.is_demo then 'legacy'
    when a.status = 'approved' then 'expired'
    when a.status is not null then a.status
    when r.clinic_id is not null then 'pending'
    else 'unregistered'
  end
  from (values (auth.uid())) as account(user_id)
  left join public.clinics c on c.owner_id = account.user_id
  left join public.clinic_registrations r on r.clinic_id = c.id
  left join public.commercial_access a on a.clinic_id = c.id;
$$;
revoke all on function public.get_clinic_portal_status() from public, anon, authenticated;
grant execute on function public.get_clinic_portal_status() to authenticated;

commit;
