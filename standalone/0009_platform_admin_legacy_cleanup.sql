-- Retire the old Lovable test-mode administrator grant. Platform administrators
-- are the only administrators in the independent Agenda Sorriso deployment.
begin;

drop trigger if exists on_auth_user_confirmed_grant_admin on auth.users;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case
    when _role = 'admin' then exists (
      select 1 from public.platform_administrators a
      join auth.users u on u.id = a.user_id
      where a.user_id = _user_id and u.email_confirmed_at is not null
    )
    else exists (
      select 1 from public.user_roles r
      where r.user_id = _user_id and r.role = _role
    )
  end;
$$;
revoke all on function public.has_role(uuid,public.app_role) from public,anon,authenticated;
grant execute on function public.has_role(uuid,public.app_role) to authenticated,service_role;

comment on function public.has_role(uuid,public.app_role)
  is 'Admin is granted only through platform_administrators with confirmed email.';

commit;
