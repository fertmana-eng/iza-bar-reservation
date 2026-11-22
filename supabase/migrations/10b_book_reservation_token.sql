-- Part B of 10_booking_link.sql (run by the owner): book_reservation also
-- returns the booking's secret token, so the page can show the personal link.
-- Same rules as 09_approval_window.sql; only the returned columns change.
drop function public.book_reservation(date, time, text, text, integer, text, text);

create function public.book_reservation(
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
  v_table_id      int;
  v_bar_id        int;
  v_bar_capacity  int;
  v_bar_used      int;
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

  perform 1 from venue_tables where kind = 'table' for update;

  select vt.id into v_table_id
  from venue_tables vt
  where vt.kind = 'table'
    and vt.active = true
    and p_guests between vt.min_guests and vt.max_guests
    and not exists (
      select 1 from reservations r
      where r.assigned_table_id = vt.id
        and r.reservation_date = p_date
        and r.status in ('confirmed', 'pending')
    )
  order by (vt.max_guests - vt.min_guests) asc, vt.max_guests asc
  limit 1;

  if v_table_id is not null then
    insert into reservations (reservation_date, arrival_time, customer_name, phone, email, guests, note, assigned_table_id, assigned_kind, status)
    values (p_date, p_time, p_name, p_phone, p_email, p_guests, p_note, v_table_id, 'table', v_status)
    returning id, access_token into v_new_id, v_token;
    return query select v_status, v_new_id, v_token;
    return;
  end if;

  select vt.id, vt.pool_capacity into v_bar_id, v_bar_capacity
  from venue_tables vt where vt.kind = 'bar_pool' and vt.active = true
  limit 1;

  if v_bar_id is not null and p_guests between (select min_guests from venue_tables where id = v_bar_id)
                                          and (select max_guests from venue_tables where id = v_bar_id) then
    perform 1 from venue_tables where id = v_bar_id for update;

    select coalesce(sum(guests), 0) into v_bar_used
    from reservations
    where assigned_table_id = v_bar_id
      and reservation_date = p_date
      and status in ('confirmed', 'pending');

    if v_bar_used + p_guests <= v_bar_capacity then
      insert into reservations (reservation_date, arrival_time, customer_name, phone, email, guests, note, assigned_table_id, assigned_kind, status)
      values (p_date, p_time, p_name, p_phone, p_email, p_guests, p_note, v_bar_id, 'bar_pool', v_status)
      returning id, access_token into v_new_id, v_token;
      return query select v_status, v_new_id, v_token;
      return;
    end if;
  end if;

  return query select 'full'::text, null::bigint, null::uuid;
end;
$$;

grant execute on function public.book_reservation(date, time, text, text, integer, text, text) to anon, authenticated;
