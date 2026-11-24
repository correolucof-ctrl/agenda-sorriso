-- Historical migration. The former administrator address is redacted in this
-- source export; standalone/0009 removes this grant mechanism entirely.
CREATE OR REPLACE FUNCTION public.is_designated_admin_email(_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(coalesce(_email, '')) = 'legacy-admin@example.invalid'
$$;

-- Admin requires the role row AND the confirmed designated e-mail, so no other account can hold it.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles r
    JOIN auth.users u ON u.id = r.user_id
    WHERE r.user_id = _user_id
      AND r.role = _role
      AND (
        _role <> 'admin'
        OR (u.email_confirmed_at IS NOT NULL AND public.is_designated_admin_email(u.email))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.grant_designated_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND public.is_designated_admin_email(NEW.email) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.grant_designated_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed_grant_admin ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_grant_admin
AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_designated_admin();

COMMENT ON TABLE public.admin_designations IS 'DEPRECATED: admin e-mail is fixed in public.is_designated_admin_email';
