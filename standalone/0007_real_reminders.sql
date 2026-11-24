-- Transactional reminder claims; never resend an uncertain WhatsApp delivery.
begin;

alter table public.whatsapp_clinic_numbers add column reminder_template_name text;
alter table public.whatsapp_clinic_numbers add column reminder_template_language text not null default 'pt_BR';
alter table public.reminders drop constraint if exists reminders_status_check;
alter table public.reminders add constraint reminders_status_check
  check (status in ('pending','processing','sent','delivered','read','failed','cancelled','blocked','unresolved'));
alter table public.reminders add column attempts integer not null default 0;
alter table public.reminders add column claimed_at timestamptz;
alter table public.reminders add column wa_message_id text;
alter table public.reminders add column last_error text;
create index reminders_due_real on public.reminders(scheduled_for) where status='pending';

create function public.claim_due_reminders(p_limit integer)
returns table(id uuid,clinic_id uuid,appointment_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  -- A crashed sending attempt may have reached Meta. Quarantine it instead of resending.
  update public.reminders r set status='unresolved',last_error='Envio interrompido; verificar na Meta',claimed_at=null
  where r.status='processing' and r.claimed_at<now()-interval '10 minutes';
  return query
  with due as (
    select r.id from public.reminders r
    join public.appointments ap on ap.id=r.appointment_id and ap.clinic_id=r.clinic_id
    join public.commercial_access a on a.clinic_id=r.clinic_id
    join public.whatsapp_clinic_numbers n on n.clinic_id=r.clinic_id
    where r.status='pending' and r.scheduled_for<=now() and ap.starts_at>now()
      and ap.status in ('scheduled','confirmed') and a.status='approved' and a.expires_at>now()
      and n.status='active' and not n.sending_paused and n.reminder_template_name is not null
      and (not a.payment_required or exists (
        select 1 from public.billing_subscriptions b where b.clinic_id=r.clinic_id
          and b.status in ('active','trialing') and b.current_period_end>now()
      ))
    order by r.scheduled_for limit least(greatest(p_limit,1),20) for update of r skip locked
  )
  update public.reminders r set status='processing',claimed_at=now(),attempts=r.attempts+1
  from due where r.id=due.id returning r.id,r.clinic_id,r.appointment_id;
end;
$$;
revoke all on function public.claim_due_reminders(integer) from public,anon,authenticated;
grant execute on function public.claim_due_reminders(integer) to service_role;

create or replace function public.whatsapp_reconcile_status(_wa_id text)
returns void language plpgsql security definer set search_path = public as $$
declare best text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select status into best from public.whatsapp_status_events
    where wa_message_id=_wa_id order by public.whatsapp_status_rank(status) desc limit 1;
  if best is null then return; end if;
  update public.whatsapp_outbound_messages o set
    state=case when public.whatsapp_status_rank(best)>public.whatsapp_status_rank(o.state) then best else o.state end,
    sent_at=coalesce(o.sent_at,(select min(provider_ts) from public.whatsapp_status_events e where e.wa_message_id=_wa_id and e.status='sent')),
    delivered_at=coalesce(o.delivered_at,(select min(provider_ts) from public.whatsapp_status_events e where e.wa_message_id=_wa_id and e.status='delivered')),
    read_at=coalesce(o.read_at,(select min(provider_ts) from public.whatsapp_status_events e where e.wa_message_id=_wa_id and e.status='read')),
    failed_at=coalesce(o.failed_at,(select min(provider_ts) from public.whatsapp_status_events e where e.wa_message_id=_wa_id and e.status='failed')),
    error=coalesce((select e.errors from public.whatsapp_status_events e where e.wa_message_id=_wa_id and e.status='failed' and e.errors is not null order by e.provider_ts desc nulls last limit 1),o.error),
    updated_at=now()
  where o.wa_message_id=_wa_id;
  update public.reminders r set status=case
    when best='failed' then 'failed'
    when best='read' then 'read'
    when best='delivered' and r.status in ('sent','delivered') then 'delivered'
    else r.status end
  where r.wa_message_id=_wa_id and r.status in ('sent','delivered','read');
end;
$$;

commit;
