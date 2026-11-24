CREATE TABLE public.clinic_registrations (
 clinic_id uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
 clinic_name text NOT NULL CHECK (char_length(trim(clinic_name)) BETWEEN 3 AND 120),
 responsible_name text NOT NULL CHECK (char_length(trim(responsible_name)) BETWEEN 3 AND 120),
 contact_email text NOT NULL CHECK (char_length(contact_email) BETWEEN 5 AND 254),
 contact_phone text NOT NULL CHECK (contact_phone ~ '^\+[1-9][0-9]{9,14}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.clinic_registrations TO authenticated;
GRANT ALL ON public.clinic_registrations TO service_role;
ALTER TABLE public.clinic_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY registration_owner_read ON public.clinic_registrations FOR SELECT TO authenticated USING (public.is_clinic_owner(clinic_id));
CREATE POLICY registration_owner_insert ON public.clinic_registrations FOR INSERT TO authenticated WITH CHECK (public.is_clinic_owner(clinic_id));
CREATE POLICY registration_owner_update ON public.clinic_registrations FOR UPDATE TO authenticated USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));