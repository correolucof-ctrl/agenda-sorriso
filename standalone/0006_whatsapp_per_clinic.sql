-- One official WhatsApp Cloud API phone per clinic. Credentials are encrypted in the server.
begin;

create table public.whatsapp_clinic_numbers (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  phone_number_id text not null unique,
  display_phone text not null,
  access_token_ciphertext text not null,
  status text not null default 'pending' check (status in ('pending','active','paused')),
  sending_paused boolean not null default true,
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_clinic_phone_numeric check (phone_number_id ~ '^[0-9]+$')
);
alter table public.whatsapp_clinic_numbers enable row level security;
revoke all on public.whatsapp_clinic_numbers from public,anon,authenticated;
grant all on public.whatsapp_clinic_numbers to service_role;

alter table public.whatsapp_inbound_messages add column phone_number_id text;
alter table public.whatsapp_outbound_messages add column phone_number_id text;
create index whatsapp_outbound_phone_number on public.whatsapp_outbound_messages(phone_number_id) where phone_number_id is not null;

commit;
