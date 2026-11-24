
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CLINICS
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE,
  name text NOT NULL DEFAULT 'Clínica Sorriso (demonstração)',
  address text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  min_advance_minutes integer NOT NULL DEFAULT 120 CHECK (min_advance_minutes >= 0),
  max_advance_days integer NOT NULL DEFAULT 30 CHECK (max_advance_days BETWEEN 1 AND 180),
  slot_step_minutes integer NOT NULL DEFAULT 30 CHECK (slot_step_minutes BETWEEN 5 AND 120),
  cancel_min_hours integer NOT NULL DEFAULT 12 CHECK (cancel_min_hours >= 0),
  reminder_hours_before integer NOT NULL DEFAULT 24 CHECK (reminder_hours_before BETWEEN 1 AND 168),
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;
GRANT ALL ON public.clinics TO service_role;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads clinic" ON public.clinics FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owner updates clinic" ON public.clinics FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER clinics_updated BEFORE UPDATE ON public.clinics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_clinic_owner(_clinic uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = _clinic AND c.owner_id = auth.uid());
$$;
REVOKE EXECUTE ON FUNCTION public.is_clinic_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_owner(uuid) TO authenticated;

-- BUSINESS HOURS
CREATE TABLE public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open boolean NOT NULL DEFAULT true,
  open_time time NOT NULL DEFAULT '08:00',
  close_time time NOT NULL DEFAULT '18:00',
  break_start time,
  break_end time,
  UNIQUE (clinic_id, weekday),
  CHECK (close_time > open_time),
  CHECK ((break_start IS NULL AND break_end IS NULL) OR (break_start IS NOT NULL AND break_end IS NOT NULL AND break_end > break_start))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_hours TO authenticated;
GRANT ALL ON public.business_hours TO service_role;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages hours" ON public.business_hours FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- PROFESSIONALS
CREATE TABLE public.professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 1),
  role_title text NOT NULL DEFAULT 'Cirurgiã(o)-dentista',
  color text NOT NULL DEFAULT 'pro-1',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professionals TO authenticated;
GRANT ALL ON public.professionals TO service_role;
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages professionals" ON public.professionals FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- SERVICES
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 1),
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 10 AND 480),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages services" ON public.services FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- PATIENTS
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 1),
  phone text NOT NULL CHECK (length(trim(phone)) >= 8),
  notes text NOT NULL DEFAULT '',
  is_demo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages patients" ON public.patients FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- APPOINTMENTS
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','confirmed','cancelled','completed','no_show')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('agent','manual')),
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_positive_duration CHECK (ends_at > starts_at),
  CONSTRAINT appointment_no_overlap EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  ) WHERE (status IN ('scheduled','confirmed'))
);
CREATE INDEX appointments_clinic_start ON public.appointments (clinic_id, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;
GRANT ALL ON public.appointments TO service_role;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages appointments" ON public.appointments FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));
CREATE TRIGGER appointments_updated BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- BLOCKS
CREATE TABLE public.schedule_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id uuid REFERENCES public.professionals(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedule_blocks TO authenticated;
GRANT ALL ON public.schedule_blocks TO service_role;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages blocks" ON public.schedule_blocks FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- CONVERSATIONS
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  contact_name text NOT NULL,
  contact_phone text NOT NULL,
  channel text NOT NULL DEFAULT 'simulador',
  status text NOT NULL DEFAULT 'bot' CHECK (status IN ('bot','pending_human','human','closed')),
  last_intent text,
  is_urgent boolean NOT NULL DEFAULT false,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_message_preview text NOT NULL DEFAULT '',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_clinic_last ON public.conversations (clinic_id, last_message_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages conversations" ON public.conversations FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- MESSAGES
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('patient','agent','human','system')),
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','audio')),
  content text NOT NULL,
  audio_label text,
  intent text,
  ai_written boolean NOT NULL DEFAULT false,
  options jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_conversation ON public.messages (conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages messages" ON public.messages FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- REMINDERS
CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  message text NOT NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Clinic owner manages reminders" ON public.reminders FOR ALL TO authenticated
  USING (public.is_clinic_owner(clinic_id)) WITH CHECK (public.is_clinic_owner(clinic_id));

-- Appointment integrity: same-clinic references + no overlap with blocks
CREATE OR REPLACE FUNCTION public.validate_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = NEW.professional_id AND p.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'Profissional inválido para esta clínica' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'Paciente inválido para esta clínica' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = NEW.service_id AND s.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'Serviço inválido para esta clínica' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IN ('scheduled','confirmed') AND EXISTS (
    SELECT 1 FROM public.schedule_blocks b
    WHERE b.clinic_id = NEW.clinic_id
      AND (b.professional_id IS NULL OR b.professional_id = NEW.professional_id)
      AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
  ) AND (TG_OP = 'INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.professional_id IS DISTINCT FROM OLD.professional_id OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'Horário bloqueado na agenda' USING ERRCODE = 'P0001', HINT = 'blocked';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER appointments_validate BEFORE INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.validate_appointment();

CREATE OR REPLACE FUNCTION public.validate_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.patient_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = NEW.patient_id AND p.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'Paciente inválido para esta clínica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER conversations_validate BEFORE INSERT OR UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.validate_conversation();

CREATE OR REPLACE FUNCTION public.validate_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = NEW.conversation_id AND c.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'Conversa inválida para esta clínica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER messages_validate BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.validate_message();

CREATE OR REPLACE FUNCTION public.validate_block()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.professional_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.professionals p WHERE p.id = NEW.professional_id AND p.clinic_id = NEW.clinic_id) THEN
    RAISE EXCEPTION 'Profissional inválido para esta clínica' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER blocks_validate BEFORE INSERT OR UPDATE ON public.schedule_blocks FOR EACH ROW EXECUTE FUNCTION public.validate_block();

-- Reminder sync
CREATE OR REPLACE FUNCTION public.sync_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.clinics%ROWTYPE;
  pat_name text;
  svc_name text;
  msg text;
  due timestamptz;
BEGIN
  SELECT * INTO c FROM public.clinics WHERE id = NEW.clinic_id;
  SELECT name INTO pat_name FROM public.patients WHERE id = NEW.patient_id;
  SELECT name INTO svc_name FROM public.services WHERE id = NEW.service_id;
  msg := 'Olá, ' || split_part(pat_name, ' ', 1) || '. Lembrete da sua consulta de ' || lower(svc_name) || ' em '
    || to_char(NEW.starts_at AT TIME ZONE c.timezone, 'DD/MM') || ' às ' || to_char(NEW.starts_at AT TIME ZONE c.timezone, 'HH24:MI')
    || ' na ' || c.name || '. Responda SIM para confirmar ou REMARCAR para escolher outro horário.';
  due := GREATEST(NEW.starts_at - make_interval(hours => c.reminder_hours_before), LEAST(now(), NEW.starts_at));

  IF NEW.status IN ('cancelled','no_show') THEN
    UPDATE public.reminders SET status = 'cancelled' WHERE appointment_id = NEW.id AND status = 'pending';
    RETURN NEW;
  END IF;

  IF NEW.status IN ('scheduled','confirmed') THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.reminders (clinic_id, appointment_id, scheduled_for, message, status)
      VALUES (NEW.clinic_id, NEW.id, due, msg, 'pending')
      ON CONFLICT (appointment_id) DO NOTHING;
    ELSIF NEW.starts_at IS DISTINCT FROM OLD.starts_at OR NEW.service_id IS DISTINCT FROM OLD.service_id OR OLD.status IN ('cancelled','no_show') THEN
      INSERT INTO public.reminders (clinic_id, appointment_id, scheduled_for, message, status)
      VALUES (NEW.clinic_id, NEW.id, due, msg, 'pending')
      ON CONFLICT (appointment_id) DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for, message = EXCLUDED.message, status = 'pending', sent_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER appointments_reminder AFTER INSERT OR UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.sync_reminder();

-- Demo seed
CREATE OR REPLACE FUNCTION public.seed_demo_clinic(_owner uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cid uuid;
  tz text := 'America/Sao_Paulo';
  p1 uuid; p2 uuid; p3 uuid;
  s_aval uuid; s_limp uuid; s_rest uuid; s_orto uuid; s_clar uuid;
  pt uuid[];
  today date;
  d date;
  i int := 0;
  n int := 0;
  conv uuid;
  ap uuid;
BEGIN
  INSERT INTO public.clinics (owner_id, name, address, phone)
  VALUES (_owner, 'Clínica Sorriso (demonstração)', 'Rua Exemplo, 100 - Sala 12 - Bairro Fictício - São Paulo/SP', '(11) 4000-0000')
  RETURNING id INTO cid;

  INSERT INTO public.business_hours (clinic_id, weekday, is_open, open_time, close_time, break_start, break_end) VALUES
    (cid, 0, false, '08:00', '12:00', NULL, NULL),
    (cid, 1, true, '08:00', '18:00', '12:00', '13:00'),
    (cid, 2, true, '08:00', '18:00', '12:00', '13:00'),
    (cid, 3, true, '08:00', '18:00', '12:00', '13:00'),
    (cid, 4, true, '08:00', '18:00', '12:00', '13:00'),
    (cid, 5, true, '08:00', '17:00', '12:00', '13:00'),
    (cid, 6, true, '08:00', '12:00', NULL, NULL);

  INSERT INTO public.professionals (clinic_id, name, role_title, color) VALUES (cid, 'Dra. Helena Prado', 'Clínica geral', 'pro-1') RETURNING id INTO p1;
  INSERT INTO public.professionals (clinic_id, name, role_title, color) VALUES (cid, 'Dr. Rafael Moura', 'Ortodontia', 'pro-2') RETURNING id INTO p2;
  INSERT INTO public.professionals (clinic_id, name, role_title, color) VALUES (cid, 'Dra. Camila Azevedo', 'Dentística e estética', 'pro-3') RETURNING id INTO p3;

  INSERT INTO public.services (clinic_id, name, description, duration_minutes) VALUES (cid, 'Avaliação', 'Primeira consulta e avaliação geral', 30) RETURNING id INTO s_aval;
  INSERT INTO public.services (clinic_id, name, description, duration_minutes) VALUES (cid, 'Limpeza', 'Limpeza e profilaxia', 45) RETURNING id INTO s_limp;
  INSERT INTO public.services (clinic_id, name, description, duration_minutes) VALUES (cid, 'Restauração', 'Restauração dentária', 60) RETURNING id INTO s_rest;
  INSERT INTO public.services (clinic_id, name, description, duration_minutes) VALUES (cid, 'Manutenção de aparelho', 'Manutenção ortodôntica', 30) RETURNING id INTO s_orto;
  INSERT INTO public.services (clinic_id, name, description, duration_minutes) VALUES (cid, 'Clareamento', 'Consulta de clareamento', 60) RETURNING id INTO s_clar;

  WITH ins AS (
    INSERT INTO public.patients (clinic_id, name, phone, notes) VALUES
      (cid, 'Ana Beatriz Lima', '(11) 90000-0001', 'Paciente fictícia para demonstração'),
      (cid, 'Carlos Eduardo Souza', '(11) 90000-0002', 'Paciente fictício para demonstração'),
      (cid, 'Fernanda Ribeiro', '(11) 90000-0003', 'Paciente fictícia para demonstração'),
      (cid, 'João Pedro Martins', '(11) 90000-0004', 'Paciente fictício para demonstração'),
      (cid, 'Luciana Ferreira', '(11) 90000-0005', 'Paciente fictícia para demonstração'),
      (cid, 'Marcos Vinícius Alves', '(11) 90000-0006', 'Paciente fictício para demonstração'),
      (cid, 'Patrícia Gomes', '(11) 90000-0007', 'Paciente fictícia para demonstração'),
      (cid, 'Ricardo Nogueira', '(11) 90000-0008', 'Paciente fictício para demonstração')
    RETURNING id, phone
  )
  SELECT array_agg(id ORDER BY phone) INTO pt FROM ins;

  today := (now() AT TIME ZONE tz)::date;

  -- Appointments over the next business days (Mon-Fri)
  d := today;
  WHILE n < 5 AND i < 14 LOOP
    IF extract(isodow FROM d) BETWEEN 1 AND 5 THEN
      INSERT INTO public.appointments (clinic_id, professional_id, patient_id, service_id, starts_at, ends_at, status, source)
      VALUES
        (cid, p1, pt[1 + (n * 3) % 8], s_aval, (d + time '09:00') AT TIME ZONE tz, (d + time '09:30') AT TIME ZONE tz, CASE WHEN n = 0 THEN 'confirmed' ELSE 'scheduled' END, 'manual'),
        (cid, p2, pt[1 + (n * 3 + 1) % 8], s_orto, (d + time '10:00') AT TIME ZONE tz, (d + time '10:30') AT TIME ZONE tz, 'scheduled', 'agent'),
        (cid, p3, pt[1 + (n * 3 + 2) % 8], s_limp, (d + time '14:00') AT TIME ZONE tz, (d + time '14:45') AT TIME ZONE tz, 'confirmed', 'manual');
      IF n = 1 THEN
        INSERT INTO public.schedule_blocks (clinic_id, professional_id, starts_at, ends_at, reason)
        VALUES (cid, p2, (d + time '15:00') AT TIME ZONE tz, (d + time '18:00') AT TIME ZONE tz, 'Curso de atualização (demonstração)');
      END IF;
      n := n + 1;
    END IF;
    d := d + 1;
    i := i + 1;
  END LOOP;

  -- Past completed appointment, reminder already sent
  INSERT INTO public.appointments (clinic_id, professional_id, patient_id, service_id, starts_at, ends_at, status, source)
  VALUES (cid, p1, pt[5], s_rest, ((today - 3) + time '11:00') AT TIME ZONE tz, ((today - 3) + time '12:00') AT TIME ZONE tz, 'completed', 'manual')
  RETURNING id INTO ap;
  UPDATE public.reminders SET status = 'sent', sent_at = now() - interval '4 days' WHERE appointment_id = ap;

  -- Conversations
  INSERT INTO public.conversations (clinic_id, patient_id, contact_name, contact_phone, status, last_intent, last_message_preview, last_message_at, created_at)
  VALUES (cid, pt[2], 'Carlos Eduardo Souza', '(11) 90000-0002', 'closed', 'agendar', 'Agendamento confirmado.', now() - interval '2 hours', now() - interval '2 hours 5 minutes')
  RETURNING id INTO conv;
  INSERT INTO public.messages (clinic_id, conversation_id, sender, content, intent, created_at) VALUES
    (cid, conv, 'patient', 'Boa tarde, queria marcar manutenção do aparelho.', 'agendar', now() - interval '2 hours 5 minutes'),
    (cid, conv, 'agent', 'Olá, Carlos. Encontrei horários disponíveis para manutenção de aparelho. Escolha uma opção pelo número.', NULL, now() - interval '2 hours 4 minutes'),
    (cid, conv, 'patient', '1', NULL, now() - interval '2 hours 3 minutes'),
    (cid, conv, 'agent', 'Agendamento confirmado.', NULL, now() - interval '2 hours');

  INSERT INTO public.conversations (clinic_id, patient_id, contact_name, contact_phone, status, last_intent, is_urgent, last_message_preview, last_message_at, created_at)
  VALUES (cid, pt[7], 'Patrícia Gomes', '(11) 90000-0007', 'pending_human', 'urgencia', true, 'Conversa transferida para atendimento humano.', now() - interval '25 minutes', now() - interval '27 minutes')
  RETURNING id INTO conv;
  INSERT INTO public.messages (clinic_id, conversation_id, sender, content, intent, created_at) VALUES
    (cid, conv, 'patient', 'Estou com muita dor no dente desde ontem e o rosto começou a inchar.', 'urgencia', now() - interval '27 minutes'),
    (cid, conv, 'agent', 'Entendo, Patrícia. Não consigo avaliar sintomas por aqui. Se a dor estiver muito forte, houver inchaço que aumenta, febre ou dificuldade para respirar ou engolir, procure agora um pronto atendimento ou serviço de urgência. Vou transferir sua conversa para a nossa equipe, que vai falar com você em seguida.', NULL, now() - interval '26 minutes'),
    (cid, conv, 'system', 'Conversa transferida para atendimento humano (urgência).', NULL, now() - interval '25 minutes');

  INSERT INTO public.conversations (clinic_id, patient_id, contact_name, contact_phone, status, last_intent, last_message_preview, last_message_at, created_at)
  VALUES (cid, pt[4], 'João Pedro Martins', '(11) 90000-0004', 'bot', 'duvida', 'Nosso endereço é Rua Exemplo, 100...', now() - interval '50 minutes', now() - interval '52 minutes')
  RETURNING id INTO conv;
  INSERT INTO public.messages (clinic_id, conversation_id, sender, content, intent, created_at) VALUES
    (cid, conv, 'patient', 'Qual o endereço da clínica?', 'duvida', now() - interval '52 minutes'),
    (cid, conv, 'agent', 'Nosso endereço é Rua Exemplo, 100 - Sala 12 - Bairro Fictício - São Paulo/SP. Posso ajudar com mais alguma coisa?', NULL, now() - interval '50 minutes');

  RETURN cid;
END; $$;
REVOKE EXECUTE ON FUNCTION public.seed_demo_clinic(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user_clinic()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE owner_id = NEW.id) THEN
    PERFORM public.seed_demo_clinic(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created_clinic AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_clinic();

CREATE OR REPLACE FUNCTION public.ensure_my_clinic()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT id INTO cid FROM public.clinics WHERE owner_id = auth.uid();
  IF cid IS NULL THEN cid := public.seed_demo_clinic(auth.uid()); END IF;
  RETURN cid;
END; $$;
REVOKE EXECUTE ON FUNCTION public.ensure_my_clinic() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_clinic() TO authenticated;

CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  DELETE FROM public.clinics WHERE owner_id = auth.uid();
  RETURN public.seed_demo_clinic(auth.uid());
END; $$;
REVOKE EXECUTE ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO authenticated;
