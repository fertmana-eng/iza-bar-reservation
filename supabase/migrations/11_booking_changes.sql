-- ===================================================================
-- Personal booking link, step 2 (docs/plan-booking-link.md): customers
-- change date, time and guests from their link, until 1 hour before arrival.
-- Same rules as new bookings: a same-day change made 16:00-20:00 waits for
-- approval; otherwise it is confirmed at once if a place fits. While a change
-- waits, the booking's previous details are kept in `prev` and their table
-- stays held, so declining the change restores them.
-- Part A only adds things (applied via the connector).
-- Part B replaces existing functions (run by the owner): 11b_booking_changes_replace.sql
-- ===================================================================

-- ---------- Part A ----------
alter table public.reservations add column prev jsonb;              -- confirmed details kept while a change waits
alter table public.reservations add column changed_at timestamptz;  -- last change made by the customer

-- Is this table held on this date (by a booking, a request, or the original of a waiting change)?
create function public.table_taken(p_table int, p_date date, p_exclude bigint)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from reservations r
    where r.status in ('confirmed', 'pending') and r.id is distinct from p_exclude
      and ((r.assigned_table_id = p_table and r.reservation_date = p_date)
        or (r.status = 'pending' and r.prev is not null
            and (r.prev->>'assigned_table_id')::int = p_table and (r.prev->>'reservation_date')::date = p_date)));
$$;

-- Guests already placed at the bar on this date (including originals of waiting changes)
create function public.bar_used(p_bar int, p_date date, p_exclude bigint)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select (coalesce(sum(r.guests) filter (where r.assigned_table_id = p_bar and r.reservation_date = p_date), 0)
        + coalesce(sum((r.prev->>'guests')::int) filter (where r.status = 'pending' and r.prev is not null
            and (r.prev->>'assigned_table_id')::int = p_bar and (r.prev->>'reservation_date')::date = p_date), 0))::int
  from reservations r
  where r.status in ('confirmed', 'pending') and r.id is distinct from p_exclude;
$$;

-- The place a group would get: the tightest free table, else the bar if it has room
create function public.find_place(p_date date, p_guests int, p_exclude bigint)
returns table(table_id int, kind text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select x.table_id, x.kind from (
    (select vt.id as table_id, vt.kind, 1 as pri from venue_tables vt
     where vt.kind = 'table' and vt.active and p_guests between vt.min_guests and vt.max_guests
       and not table_taken(vt.id, p_date, p_exclude)
     order by (vt.max_guests - vt.min_guests), vt.max_guests
     limit 1)
    union all
    (select vt.id, vt.kind, 2 from venue_tables vt
     where vt.kind = 'bar_pool' and vt.active and p_guests between vt.min_guests and vt.max_guests
       and bar_used(vt.id, p_date, p_exclude) + p_guests <= vt.pool_capacity
     limit 1)
  ) x
  order by x.pri
  limit 1;
$$;

revoke execute on function public.table_taken(int, date, bigint), public.bar_used(int, date, bigint),
  public.find_place(date, int, bigint) from public, anon, authenticated;

-- A customer changes date, time or guests through their link
create function public.change_booking(p_token uuid, p_date date, p_time time, p_guests int)
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
  -- keep the current place if it still fits; otherwise find another
  select vt.id, vt.kind into v_table, v_kind from venue_tables vt
  where vt.id = v.assigned_table_id and vt.active and p_guests between vt.min_guests and vt.max_guests
    and ((vt.kind = 'table' and not table_taken(vt.id, p_date, v.id))
      or (vt.kind = 'bar_pool' and bar_used(vt.id, p_date, v.id) + p_guests <= vt.pool_capacity));
  if v_table is null then
    select f.table_id, f.kind into v_table, v_kind from find_place(p_date, p_guests, v.id) f;
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

-- The manager answers a waiting request or change (logged in only)
create function public.decide_request(p_id bigint, p_approve boolean)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v reservations%rowtype;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into v from reservations where id = p_id for update;
  if not found then return 'not_found'; end if;
  if v.status <> 'pending' then return v.status; end if;
  if p_approve then
    update reservations set status = 'confirmed', prev = null where id = v.id;
    return 'confirmed';
  end if;
  if v.prev is not null then           -- a declined change: back to the confirmed original
    update reservations set
      reservation_date = (v.prev->>'reservation_date')::date, arrival_time = (v.prev->>'arrival_time')::time,
      guests = (v.prev->>'guests')::int, assigned_table_id = (v.prev->>'assigned_table_id')::int,
      assigned_kind = v.prev->>'assigned_kind', status = 'confirmed', prev = null
    where id = v.id;
    return 'reverted';
  end if;
  update reservations set status = 'declined' where id = v.id;
  return 'declined';
end;
$$;

grant execute on function public.change_booking(uuid, date, time, int) to anon, authenticated;
revoke execute on function public.decide_request(bigint, boolean) from public, anon;
grant execute on function public.decide_request(bigint, boolean) to authenticated;
