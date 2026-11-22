-- ===================================================================
-- Personal booking link, step 4: Android notifications when the bar
-- approves or declines a request or a change (docs/plan-booking-link.md).
-- Only adds things (applied via the connector, 22 Nov 2026).
-- The notification keys live in app_secrets, readable only by the server
-- function (service role). Their values are NOT in this repository (it is
-- public): they were inserted directly into the database.
-- ===================================================================

create table public.push_subscriptions (
  id             bigserial primary key,
  reservation_id bigint not null references public.reservations(id) on delete cascade,
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  created_at     timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
revoke all on sequence public.push_subscriptions_id_seq from anon, authenticated;

create table public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;

-- The customer's phone asks to be notified about its booking (through the private link)
create function public.save_push_subscription(p_token uuid, p_endpoint text, p_p256dh text, p_auth text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_id bigint;
begin
  if p_endpoint is null or p_endpoint !~ '^https://' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 20 and 200 or coalesce(length(p_auth), 0) not between 8 and 100 then
    return 'invalid';
  end if;
  select id into v_id from reservations
  where p_token is not null and access_token = p_token and status in ('confirmed', 'pending');
  if v_id is null then return 'not_found'; end if;
  if (select count(*) from push_subscriptions where reservation_id = v_id and endpoint <> p_endpoint) >= 5 then
    return 'too_many';
  end if;
  insert into push_subscriptions (reservation_id, endpoint, p256dh, auth)
  values (v_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set reservation_id = excluded.reservation_id, p256dh = excluded.p256dh, auth = excluded.auth;
  return 'saved';
end;
$$;
grant execute on function public.save_push_subscription(uuid, text, text, text) to anon, authenticated;
