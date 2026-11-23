-- A customer's change can also switch between table and bar (owner, 23 Nov 2026).
-- Run by the owner in the SQL Editor (it replaces change_booking).
--
-- change_booking gets p_seating ('table' / 'bar'; empty = keep the area booked).
-- Same rules as a new booking: the bar takes groups of 1-4; table chosen, none left,
-- the bar has room -> 'bar_available' (nothing changed, the page offers the bar).
-- Everything else is as in 15_seating_and_limits.sql.

drop function if exists public.change_booking(uuid, date, time, integer);
create function public.change_booking(p_token uuid, p_date date, p_time time, p_guests int, p_seating text default null)
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
  v_area text;      -- the area booked now: 'table' / 'bar'
begin
  select * into v from reservations where p_token is not null and access_token = p_token for update;
  if not found then return 'not_found'; end if;
  if v.status not in ('confirmed', 'pending')
     or (v.reservation_date + v.arrival_time) - interval '1 hour' <= localtimestamp then
    return 'locked';
  end if;
  if p_date is null or p_time is null or p_guests is null or p_guests not between 1 and 10
     or p_date < current_date or p_date > current_date + 30
     or (p_seating is not null and p_seating not in ('table', 'bar')) then
    return 'invalid';
  end if;
  v_area := case when v.assigned_kind = 'bar_pool' then 'bar' else 'table' end;
  p_seating := coalesce(p_seating, v_area);
  if p_date = v.reservation_date and p_time = v.arrival_time and p_guests = v.guests and p_seating = v_area then
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
  -- staying in the same area: keep the same table (or the bar) if it still fits
  if p_seating = v_area then
    select vt.id, vt.kind into v_table, v_kind from venue_tables vt
    where vt.id = v.assigned_table_id and vt.active and p_guests between vt.min_guests and vt.max_guests
      and ((vt.kind = 'table' and not table_taken(vt.id, p_date, v.id))
        or (vt.kind = 'bar_pool' and bar_used(vt.id, p_date, v.id) + p_guests <= vt.pool_capacity));
  end if;
  if v_table is null then
    select f.table_id, f.kind into v_table, v_kind from find_place(p_date, p_guests, v.id, p_seating) f;
  end if;
  if v_table is null then
    if p_seating = 'table' and exists (select 1 from find_place(p_date, p_guests, v.id, 'bar')) then
      return 'bar_available';
    end if;
    return 'full';
  end if;

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
grant execute on function public.change_booking(uuid, date, time, integer, text) to anon, authenticated;
