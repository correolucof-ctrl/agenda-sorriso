create or replace function public.ensure_my_clinic()
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  clinic_id uuid;
begin
  if auth.uid() is null or public.is_platform_admin() then
    raise exception 'Conta sem acesso ao cadastro de clínicas' using errcode = '42501';
  end if;
  insert into public.clinics (owner_id)
  values (auth.uid())
  on conflict (owner_id) do nothing;
  select c.id into clinic_id from public.clinics c where c.owner_id = auth.uid();
  return clinic_id;
end;
$$;
