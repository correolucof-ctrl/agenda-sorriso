-- Per-clinic Google Calendar connection and idempotent outbound sync queue.
begin;

create table public.google_calendar_oauth_states (
  state_hash text primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.google_calendar_connections (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  calendar_id text not null default 'primary',
  google_email text,
  refresh_token_ciphertext text not null,
  enabled boolean not null default true,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.google_calendar_sync_queue (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','processing','done','failed')),
  version bigint not null default 1,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  synced_version bigint not null default 0,
  updated_at timestamptz not null default now()
);
create index google_calendar_sync_due on public.google_calendar_sync_queue(next_attempt_at)
  where state in ('pending','processing');

alter table public.google_calendar_oauth_states enable row level security;
alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_sync_queue enable row level security;
revoke all on public.google_calendar_oauth_states, public.google_calendar_connections,
  public.google_calendar_sync_queue from public, anon, authenticated;
grant all on public.google_calendar_oauth_states, public.google_calendar_connections,
  public.google_calendar_sync_queue to service_role;

create function public.enqueue_google_calendar_sync()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at or new.status is distinct from old.status
    or new.professional_id is distinct from old.professional_id
    or new.service_id is distinct from old.service_id then
    insert into public.google_calendar_sync_queue(appointment_id,clinic_id)
    values(new.id,new.clinic_id)
    on conflict(appointment_id) do update set state='pending',version=public.google_calendar_sync_queue.version+1,
      next_attempt_at=now(),claimed_at=null,last_error=null,updated_at=now();
  end if;
  return new;
end;
$$;
create trigger appointments_google_sync after insert or update on public.appointments
  for each row execute function public.enqueue_google_calendar_sync();

create function public.claim_google_calendar_sync(p_limit integer)
returns table(appointment_id uuid,clinic_id uuid,version bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  return query
  with due as (
    select q.appointment_id from public.google_calendar_sync_queue q
    join public.google_calendar_connections c on c.clinic_id=q.clinic_id and c.enabled
    join public.commercial_access a on a.clinic_id=q.clinic_id
    where ((q.state='pending' and q.next_attempt_at<=now())
      or (q.state='processing' and q.claimed_at<now()-interval '10 minutes'))
      and a.status='approved' and a.expires_at>now()
      and (not a.payment_required or exists (
        select 1 from public.billing_subscriptions b where b.clinic_id=q.clinic_id
          and b.status in ('active','trialing') and b.current_period_end>now()
      ))
    order by q.next_attempt_at limit least(greatest(p_limit,1),20) for update of q skip locked
  )
  update public.google_calendar_sync_queue q set state='processing',claimed_at=now(),
    attempts=q.attempts+1,updated_at=now()
  from due where q.appointment_id=due.appointment_id
  returning q.appointment_id,q.clinic_id,q.version;
end;
$$;
revoke all on function public.claim_google_calendar_sync(integer) from public,anon,authenticated;
grant execute on function public.claim_google_calendar_sync(integer) to service_role;

create function public.finish_google_calendar_sync(p_appointment_id uuid,p_version bigint,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_error is null then
    update public.google_calendar_sync_queue set state='done',synced_version=p_version,
      last_error=null,claimed_at=null,updated_at=now()
    where appointment_id=p_appointment_id and version=p_version and state='processing';
  else
    update public.google_calendar_sync_queue set state=case when attempts>=8 then 'failed' else 'pending' end,
      next_attempt_at=now()+make_interval(mins=>least(60, power(2,least(attempts,6))::integer)),
      last_error=left(p_error,500),claimed_at=null,updated_at=now()
    where appointment_id=p_appointment_id and version=p_version and state='processing';
  end if;
end;
$$;
revoke all on function public.finish_google_calendar_sync(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.finish_google_calendar_sync(uuid,bigint,text) to service_role;

commit;
