-- Table or bar chosen by the customer, and protection against double bookings
-- (owner, 23 Nov 2026). Run by the owner in the SQL Editor (it replaces functions).
--
-- * The customer chooses "שולחן" (table) or "בר" (bar). find_place takes the
--   choice; with no choice (manager bookings, older callers) it works as before:
--   the tightest free table, otherwise the bar.
-- * Table chosen, no table left, but the bar has room: the answer is 'bar_available'
--   (nothing is booked), so the page can offer the bar.
-- * One booking per phone number per evening ('duplicate'); the number is compared
--   by its digits, with +972 read as 0. Manager bookings are not limited.
-- * At most 3 bookings an hour from the same connection ('too_many'). Only a
--   fingerprint (md5) of the connection's address is kept, never the address itself;
--   if the address can't be read, this limit is skipped.
-- * book_reservation and get_booking also return the seating area ('table' / 'bar'),
--   shown on the booking card. A customer's change keeps the area they booked.
-- * The unused p_email parameter is removed from book_reservation (emails were dropped).

alter table public.reservations add column if not exists client_key text;

-- ---------------------------------------------------------------- helpers

create or replace function public.phone_digits(p text) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case when d like '972%' then '0' || substr(d, 4) else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x;
$$;

-- fingerprint of the caller's connection address, or null if it can't be read
create or replace function public.client_key() returns text
language sql stable
set search_path = public, pg_temp
as $$
  select md5(ip) from (
    select nullif(btrim(coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1))), '') as ip
    from (select nullif(current_setting('request.headers', true), '')::json as h) hh
  ) x where ip is not null;
$$;

drop function if exists public.find_place(date, integer, bigint);
create function public.find_place(p_date date, p_guests int, p_exclude bigint, p_seating text default null)
returns table(table_id int, kind text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.table_id, x.kind from (
    (select vt.id as table_id, vt.kind, 1 as pri from venue_tables vt
     where coalesce(p_seating, 'table') = 'table'
       and vt.kind = 'table' and vt.active and p_guests between vt.min_guests and vt.max_guests
       and not table_taken(vt.id, p_date, p_exclude)
     order by (vt.max_guests - vt.min_guests), vt.max_guests
     limit 1)
    union all
    (select vt.id, vt.kind, 2 from venue_tables vt
     where coalesce(p_seating, 'bar') = 'bar'
       and vt.kind = 'bar_pool' and vt.active and p_guests between vt.min_guests and vt.max_guests
       and bar_used(vt.id, p_date, p_exclude) + p_guests <= vt.pool_capacity
     limit 1)
  ) x
  order by x.pri
  limit 1;
$$;

revoke all on function public.phone_digits(text) from public, anon, authenticated;
revoke all on function public.client_key() from public, anon, authenticated;
revoke all on function public.find_place(date, integer, bigint, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- search

-- 'yes': there is room as chosen; 'bar': table chosen, none left, the bar has room; 'no'
drop function if exists public.check_availability(date, integer);
create function public.check_availability(p_date date, p_guests int, p_seating text default null)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (select 1 from find_place(p_date, p_guests, null, p_seating)) then 'yes'
    when p_seating = 'table' and exists (select 1 from find_place(p_date, p_guests, null, 'bar')) then 'bar'
    else 'no' end;
$$;
grant execute on function public.check_availability(date, integer, text) to anon, authenticated;

-- ---------------------------------------------------------------- booking

drop function if exists public.book_reservation(date, time, text, text, integer, text, text);
create function public.book_reservation(
  p_date date, p_time time, p_name text, p_phone text, p_guests int, p_note text, p_seating text default null
) returns table(result text, reservation_id bigint, booking_token uuid, seating text)
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
declare
  v_cutoff        time;
  v_approval_from time;
  v_arrival_start time;
  v_arrival_end   time;
  v_status        text := 'confirmed';
  v_table         int;
  v_kind          text;
  v_new_id        bigint;
  v_token         uuid;
  v_client        text := client_key();
begin
  p_name  := btrim(p_name);
  p_phone := btrim(p_phone);
  p_note  := nullif(btrim(p_note), '');
  if p_date is null or p_time is null or p_guests is null
     or p_guests not between 1 and 10
     or p_date < current_date or p_date > current_date + 30
     or coalesce(length(p_name), 0) not between 1 and 80
     or coalesce(p_phone, '') !~ '^[0-9+() -]{7,20}$'
     or length(p_note) > 300
     or (p_seating is not null and p_seating not in ('table', 'bar')) then
    return query select 'invalid'::text, null::bigint, null::uuid, null::text;
    return;
  end if;

  select value::time into v_cutoff        from settings where key = 'booking_cutoff';
  select value::time into v_approval_from from settings where key = 'approval_from';
  select value::time into v_arrival_start from settings where key = 'arrival_start';
  select value::time into v_arrival_end   from settings where key = 'arrival_end';

  if p_time < v_arrival_start or p_time > v_arrival_end then
    return query select 'invalid_time'::text, null::bigint, null::uuid, null::text;
    return;
  end if;

  if p_date = current_date then
    if localtime >= v_cutoff then
      return query select 'closed'::text, null::bigint, null::uuid, null::text;
      return;
    end if;
    if p_time < localtime + interval '25 minutes' then
      return query select 'invalid_time'::text, null::bigint, null::uuid, null::text;
      return;
    end if;
    if localtime >= v_approval_from then
      v_status := 'pending';
    end if;
  end if;

  perform 1 from venue_tables for update;

  -- one booking per phone number per evening
  if exists (select 1 from reservations r
             where r.reservation_date = p_date and r.status in ('confirmed', 'pending')
               and phone_digits(r.phone) = phone_digits(p_phone)) then
    return query select 'duplicate'::text, null::bigint, null::uuid, null::text;
    return;
  end if;
  -- at most 3 bookings an hour from the same connection
  if v_client is not null and (select count(*) from reservations r
       where r.client_key = v_client and r.created_at > now() - interval '1 hour') >= 3 then
    return query select 'too_many'::text, null::bigint, null::uuid, null::text;
    return;
  end if;

  select f.table_id, f.kind into v_table, v_kind from find_place(p_date, p_guests, null, p_seating) f;
  if v_table is null then
    if p_seating = 'table' and exists (select 1 from find_place(p_date, p_guests, null, 'bar')) then
      return query select 'bar_available'::text, null::bigint, null::uuid, null::text;
    else
      return query select 'full'::text, null::bigint, null::uuid, null::text;
    end if;
    return;
  end if;

  insert into reservations (reservation_date, arrival_time, customer_name, phone, guests, note,
                            assigned_table_id, assigned_kind, status, client_key)
  values (p_date, p_time, p_name, p_phone, p_guests, p_note, v_table, v_kind, v_status, v_client)
  returning id, access_token into v_new_id, v_token;
  return query select v_status, v_new_id, v_token, case when v_kind = 'bar_pool' then 'bar' else 'table' end;
end;
$$;
grant execute on function public.book_reservation(date, time, text, text, integer, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- the personal page

drop function if exists public.get_booking(uuid);
create function public.get_booking(p_token uuid)
returns table(id bigint, status text, reservation_date date, arrival_time time, customer_name text, guests int,
              note text, cancelled_by text, can_change boolean, can_cancel boolean,
              prev_date date, prev_time time, prev_guests int, seating text)
language sql stable security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
  select r.id, r.status, r.reservation_date, r.arrival_time, r.customer_name, r.guests, r.note, r.cancelled_by,
         r.status in ('confirmed', 'pending') and (r.reservation_date + r.arrival_time) - interval '1 hour' > localtimestamp,
         r.status in ('confirmed', 'pending') and r.reservation_date >= current_date,
         (r.prev->>'reservation_date')::date, (r.prev->>'arrival_time')::time, (r.prev->>'guests')::int,
         case when r.assigned_kind = 'bar_pool' then 'bar' else 'table' end
  from reservations r
  where p_token is not null and r.access_token = p_token;
$$;
grant execute on function public.get_booking(uuid) to anon, authenticated;

-- a change keeps the area the customer booked (table or bar)
create or replace function public.change_booking(p_token uuid, p_date date, p_time time, p_guests int)
returns text
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
declare
  v reservations%rowtype;
  v_cutoff time; v_approval_from time; v_start time; v_end time;
  v_status text := 'confirmed';
  v_table int; v_kind text;
begin
  select * into v from reservations where p_token is not null and access_token = p_token for update;
  if not found then return 'not_found'; end if;
  if v.status not in ('confirmed', 'pending')
     or (v.reservation_date + v.arrival_time) - interval '1 hour' <= localtimestamp then
    return 'locked';
  end if;
  if p_date is null or p_time is null or p_guests is null or p_guests not between 1 and 10
     or p_date < current_date or p_date > current_date + 30 then
    return 'invalid';
  end if;
  if p_date = v.reservation_date and p_time = v.arrival_time and p_guests = v.guests then
    return 'unchanged';
  end if;

  select value::time into v_cutoff        from settings where key = 'booking_cutoff';
  select value::time into v_approval_from from settings where key = 'approval_from';
  select value::time into v_start         from settings where key = 'arrival_start';
  select value::time into v_end           from settings where key = 'arrival_end';
  if p_time < v_start or p_time > v_end then return 'invalid_time'; end if;
  if p_date = current_date then
    if localtime >= v_cutoff then return 'closed'; end if;
    if p_time < localtime + interval '25 minutes' then return 'invalid_time'; end if;
    if localtime >= v_approval_from then v_status := 'pending'; end if;
  end if;

  perform 1 from venue_tables for update;
  -- moving to another evening: still one booking per phone number per evening
  if p_date <> v.reservation_date and exists (select 1 from reservations r
       where r.id <> v.id and r.reservation_date = p_date and r.status in ('confirmed', 'pending')
         and phone_digits(r.phone) = phone_digits(v.phone)) then
    return 'duplicate';
  end if;
  select vt.id, vt.kind into v_table, v_kind from venue_tables vt
  where vt.id = v.assigned_table_id and vt.active and p_guests between vt.min_guests and vt.max_guests
    and ((vt.kind = 'table' and not table_taken(vt.id, p_date, v.id))
      or (vt.kind = 'bar_pool' and bar_used(vt.id, p_date, v.id) + p_guests <= vt.pool_capacity));
  if v_table is null then
    select f.table_id, f.kind into v_table, v_kind
    from find_place(p_date, p_guests, v.id, case when v.assigned_kind = 'bar_pool' then 'bar' else 'table' end) f;
  end if;
  if v_table is null then return 'full'; end if;

  update reservations set
    prev = case when v_status = 'pending'
                then coalesce(v.prev, case when v.status = 'confirmed' then jsonb_build_object(
                       'reservation_date', v.reservation_date, 'arrival_time', v.arrival_time, 'guests', v.guests,
                       'assigned_table_id', v.assigned_table_id, 'assigned_kind', v.assigned_kind) end)
           end,
    reservation_date = p_date, arrival_time = p_time, guests = p_guests,
    assigned_table_id = v_table, assigned_kind = v_kind, status = v_status, changed_at = now()
  where id = v.id;
  return v_status;
end;
$$;
