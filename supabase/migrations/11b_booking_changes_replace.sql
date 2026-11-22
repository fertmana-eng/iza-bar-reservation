-- Part B of 11_booking_changes.sql (run by the owner): the existing functions
-- use the shared helpers, so the original of a waiting change keeps its table
-- everywhere; get_booking also returns the original details of a waiting change.
-- Booking rules are unchanged (09_approval_window.sql, 10b_book_reservation_token.sql).

create or replace function public.book_reservation(
  p_date date, p_time time, p_name text, p_phone text, p_guests int, p_note text, p_email text default null
) returns table(result text, reservation_id bigint, booking_token uuid)
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
begin
  p_name  := btrim(p_name);
  p_phone := btrim(p_phone);
  p_note  := nullif(btrim(p_note), '');
  p_email := nullif(btrim(p_email), '');
  if p_date is null or p_time is null or p_guests is null
     or p_guests not between 1 and 10
     or p_date < current_date or p_date > current_date + 30
     or coalesce(length(p_name), 0) not between 1 and 80
     or coalesce(p_phone, '') !~ '^[0-9+() -]{7,20}$'
     or length(p_note) > 300
     or (p_email is not null and (length(p_email) > 120 or p_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')) then
    return query select 'invalid'::text, null::bigint, null::uuid;
    return;
  end if;

  select value::time into v_cutoff        from settings where key = 'booking_cutoff';
  select value::time into v_approval_from from settings where key = 'approval_from';
  select value::time into v_arrival_start from settings where key = 'arrival_start';
  select value::time into v_arrival_end   from settings where key = 'arrival_end';

  if p_time < v_arrival_start or p_time > v_arrival_end then
    return query select 'invalid_time'::text, null::bigint, null::uuid;
    return;
  end if;

  if p_date = current_date then
    if localtime >= v_cutoff then
      return query select 'closed'::text, null::bigint, null::uuid;
      return;
    end if;
    if p_time < localtime + interval '25 minutes' then
      return query select 'invalid_time'::text, null::bigint, null::uuid;
      return;
    end if;
    if localtime >= v_approval_from then
      v_status := 'pending';
    end if;
  end if;

  perform 1 from venue_tables for update;
  select f.table_id, f.kind into v_table, v_kind from find_place(p_date, p_guests, null) f;
  if v_table is null then
    return query select 'full'::text, null::bigint, null::uuid;
    return;
  end if;

  insert into reservations (reservation_date, arrival_time, customer_name, phone, email, guests, note, assigned_table_id, assigned_kind, status)
  values (p_date, p_time, p_name, p_phone, p_email, p_guests, p_note, v_table, v_kind, v_status)
  returning id, access_token into v_new_id, v_token;
  return query select v_status, v_new_id, v_token;
end;
$$;

create or replace function public.check_availability(p_date date, p_guests integer)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from find_place(p_date, p_guests, null));
$$;

create or replace function public.available_spots(p_date date)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select ((select count(*) from venue_tables vt
           where vt.kind = 'table' and vt.active and not table_taken(vt.id, p_date, null))
        + coalesce((select sum(greatest(vt.pool_capacity - bar_used(vt.id, p_date, null), 0)) from venue_tables vt
                    where vt.kind = 'bar_pool' and vt.active), 0))::int;
$$;

drop function public.get_booking(uuid);
create function public.get_booking(p_token uuid)
returns table(id bigint, status text, reservation_date date, arrival_time time, customer_name text,
              guests int, note text, cancelled_by text, can_change boolean, can_cancel boolean,
              prev_date date, prev_time time, prev_guests int)
language sql stable security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
  select r.id, r.status, r.reservation_date, r.arrival_time, r.customer_name, r.guests, r.note, r.cancelled_by,
         r.status in ('confirmed', 'pending') and (r.reservation_date + r.arrival_time) - interval '1 hour' > localtimestamp,
         r.status in ('confirmed', 'pending') and r.reservation_date >= current_date,
         (r.prev->>'reservation_date')::date, (r.prev->>'arrival_time')::time, (r.prev->>'guests')::int
  from reservations r
  where p_token is not null and r.access_token = p_token;
$$;
grant execute on function public.get_booking(uuid) to anon, authenticated;
