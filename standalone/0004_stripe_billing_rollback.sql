-- Operational rollback: restore manual approvals while retaining billing history.
-- Run only if the billing deployment fails; do not drop financial records.
begin;
update public.commercial_access set payment_required = false where payment_required;

create or replace function public.is_clinic_owner(_clinic uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clinics c
    join public.commercial_access a on a.clinic_id = c.id
    join auth.users u on u.id = c.owner_id
    where c.id = _clinic and c.owner_id = auth.uid() and not c.is_demo
      and u.email_confirmed_at is not null and a.status = 'approved' and a.expires_at > now()
  );
$$;

create or replace function public.get_clinic_portal_status()
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

create or replace function public.decide_commercial_access(
  target_clinic uuid, next_status text, selected_plan text, expiration timestamptz
)
returns void language plpgsql security definer set search_path = ''
as $$
declare previous_status text;
begin
  if not public.is_platform_admin() then raise exception 'Acesso administrativo obrigatório' using errcode = '42501'; end if;
  if next_status is null or next_status not in ('approved','rejected','suspended') then
    raise exception 'Decisão inválida' using errcode = '22023';
  end if;
  if next_status = 'approved' and (expiration is null or expiration <= now() or selected_plan is null) then
    raise exception 'Informe um plano e um vencimento futuro' using errcode = '22023';
  end if;
  perform 1 from public.clinic_registrations r where r.clinic_id = target_clinic for update;
  if not found then raise exception 'Cadastro não encontrado' using errcode = 'P0002'; end if;
  select a.status into previous_status from public.commercial_access a where a.clinic_id = target_clinic;
  insert into public.commercial_access(clinic_id,status,plan,expires_at,payment_required)
  values(target_clinic,next_status,selected_plan,expiration,false)
  on conflict(clinic_id) do update set status=excluded.status,plan=excluded.plan,
    expires_at=excluded.expires_at,payment_required=false,updated_at=now();
  insert into public.commercial_access_audit(clinic_id,administrator_id,previous_status,status,plan,expires_at)
  values(target_clinic,auth.uid(),coalesce(previous_status,'pending'),next_status,selected_plan,expiration);
end;
$$;
commit;
