-- ===================================================================
-- Automatic reminder about 2 hours before a booking (owner, 22 Nov 2026), as a
-- phone notification to customers who turned notifications on. Every 10 minutes
-- the database's scheduler (pg_cron) calls the edge function send-reminders
-- (pg_net), which sends each due booking one reminder.
-- The scheduler proves itself with a secret the database generates itself
-- (app_secrets 'cron_secret'): its value is never in this public repository.
-- Only adds things (applied via the connector).
-- ===================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

alter table public.reservations add column reminder_sent_at timestamptz;

insert into public.app_secrets (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Tonight's confirmed bookings due for a reminder: arriving between 30 minutes and
-- 2 hours from now, booked at least 3 hours ahead, not reminded yet, with a phone
-- that asked for notifications. Only the server (service role) may call it.
create function public.due_reminders()
returns table(id bigint, reservation_date date, arrival_time time, guests int, access_token uuid)
language sql stable security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
  select r.id, r.reservation_date, r.arrival_time, r.guests, r.access_token
  from reservations r
  where r.status = 'confirmed' and r.reminder_sent_at is null and r.arrived_at is null
    and r.reservation_date = current_date
    and (r.reservation_date + r.arrival_time) between localtimestamp + interval '30 minutes' and localtimestamp + interval '2 hours'
    and r.created_at <= ((r.reservation_date + r.arrival_time) at time zone 'Asia/Jerusalem') - interval '3 hours'
    and exists (select 1 from push_subscriptions s where s.reservation_id = r.id);
$$;
revoke execute on function public.due_reminders() from public, anon, authenticated;

select cron.schedule('booking-reminders', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://brpovhypzsgwsnuenpfj.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000);
$job$);
