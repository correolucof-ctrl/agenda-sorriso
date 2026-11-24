
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Internal list of e-mails that become admin on confirmation. No client access.
CREATE TABLE public.admin_designations (
  email text PRIMARY KEY CHECK (email = lower(email) AND position('@' in email) > 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_designations TO service_role;
ALTER TABLE public.admin_designations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.grant_designated_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND NEW.email IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.admin_designations d WHERE d.email = lower(NEW.email)) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.grant_designated_admin() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_confirmed_grant_admin
AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_designated_admin();

-- Singleton WhatsApp settings
CREATE TABLE public.whatsapp_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  target_clinic_id uuid REFERENCES public.clinics(id) ON DELETE SET NULL,
  sending_paused boolean NOT NULL DEFAULT false,
  paused_reason text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read whatsapp settings" ON public.whatsapp_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update whatsapp settings" ON public.whatsapp_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.whatsapp_settings (id) VALUES (true);

-- Allowlist of test numbers (starts empty)
CREATE TABLE public.whatsapp_allowed_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_digits text NOT NULL UNIQUE CHECK (phone_digits ~ '^[1-9][0-9]{9,14}$'),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 60),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_allowed_numbers TO authenticated;
GRANT ALL ON public.whatsapp_allowed_numbers TO service_role;
ALTER TABLE public.whatsapp_allowed_numbers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage allowed numbers" ON public.whatsapp_allowed_numbers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Durable inbox (only deliveries that passed the allowlist gate)
CREATE TABLE public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id text NOT NULL UNIQUE,
  event text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_webhook_events_due_idx ON public.whatsapp_webhook_events (next_attempt_at) WHERE processed_at IS NULL;
GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read whatsapp inbox" ON public.whatsapp_webhook_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Inbound messages from authorized numbers and their processing state
CREATE TABLE public.whatsapp_inbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text NOT NULL UNIQUE,
  from_digits text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','audio','other')),
  body text,
  media_id text,
  mime_type text,
  transcription text,
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','ready','agent_running','replied','done','needs_review','blocked')),
  error text,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  provider_timestamp timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.whatsapp_inbound_messages TO authenticated;
GRANT ALL ON public.whatsapp_inbound_messages TO service_role;
ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read inbound whatsapp" ON public.whatsapp_inbound_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Outbound replies (only to authorized numbers)
CREATE TABLE public.whatsapp_outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inbound_wa_message_id text NOT NULL,
  seq integer NOT NULL,
  clinic_id uuid REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  recipient_digits text NOT NULL,
  body text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','accepted','sent','delivered','read','failed','unresolved','blocked')),
  wa_message_id text UNIQUE,
  error jsonb,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inbound_wa_message_id, seq)
);
GRANT SELECT ON public.whatsapp_outbound_messages TO authenticated;
GRANT ALL ON public.whatsapp_outbound_messages TO service_role;
ALTER TABLE public.whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read outbound whatsapp" ON public.whatsapp_outbound_messages FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Delivery status callbacks (kept even when they arrive before the outbound id is saved)
CREATE TABLE public.whatsapp_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id text NOT NULL,
  status text NOT NULL,
  provider_ts timestamptz,
  errors jsonb,
  recipient_digits text NOT NULL,
  delivery_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, wa_message_id, status)
);
CREATE INDEX whatsapp_status_events_msg_idx ON public.whatsapp_status_events (wa_message_id);
GRANT SELECT ON public.whatsapp_status_events TO authenticated;
GRANT ALL ON public.whatsapp_status_events TO service_role;
ALTER TABLE public.whatsapp_status_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read whatsapp statuses" ON public.whatsapp_status_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.whatsapp_status_rank(_s text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _s WHEN 'accepted' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE -1 END
$$;

-- Order-independent, replay-safe reconciliation of stored status callbacks.
CREATE OR REPLACE FUNCTION public.whatsapp_reconcile_status(_wa_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE best text;
BEGIN
  SELECT status INTO best FROM public.whatsapp_status_events
   WHERE wa_message_id = _wa_id ORDER BY public.whatsapp_status_rank(status) DESC LIMIT 1;
  IF best IS NULL THEN RETURN; END IF;
  UPDATE public.whatsapp_outbound_messages o SET
    state = CASE WHEN public.whatsapp_status_rank(best) > public.whatsapp_status_rank(o.state) THEN best ELSE o.state END,
    sent_at = COALESCE(o.sent_at, (SELECT min(provider_ts) FROM public.whatsapp_status_events e WHERE e.wa_message_id = _wa_id AND e.status = 'sent')),
    delivered_at = COALESCE(o.delivered_at, (SELECT min(provider_ts) FROM public.whatsapp_status_events e WHERE e.wa_message_id = _wa_id AND e.status = 'delivered')),
    read_at = COALESCE(o.read_at, (SELECT min(provider_ts) FROM public.whatsapp_status_events e WHERE e.wa_message_id = _wa_id AND e.status = 'read')),
    failed_at = COALESCE(o.failed_at, (SELECT min(provider_ts) FROM public.whatsapp_status_events e WHERE e.wa_message_id = _wa_id AND e.status = 'failed')),
    error = COALESCE((SELECT e.errors FROM public.whatsapp_status_events e WHERE e.wa_message_id = _wa_id AND e.status = 'failed' AND e.errors IS NOT NULL ORDER BY e.provider_ts DESC NULLS LAST LIMIT 1), o.error),
    updated_at = now()
  WHERE o.wa_message_id = _wa_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.whatsapp_reconcile_status(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.whatsapp_reconcile_status(text) TO service_role;
