-- ===================================================================
-- Manager floor screen (owner's request, Nov 2026): the tablet shows the
-- floor plan and the evening's list, and the manager can mark guests as
-- arrived, move a booking to another table, and add a booking that came by
-- phone / WhatsApp or at the door. Only the logged-in manager can call these.
-- Only adds things (applied via the connector).
-- ===================================================================

alter table public.reservations add column arrived_at timestamptz;

create function public.set_arrived(p_id bigint, p_arrived boolean)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  update reservations set arrived_at = case when p_arrived then now() end
  where id = p_id and status = 'confirmed';
  if not found then return 'not_found'; end if;
  return 'saved';
end;
$$;

-- Move a booking to another table (or the bar). The manager may seat a group
-- outside a table's usual size: that answers 'moved_size' so the page can say so.
create function public.move_booking(p_id bigint, p_table int)
returns text
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v reservations%rowtype; t venue_tables%rowtype;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  select * into v from reservations where id = p_id for update;
  if not found then return 'not_found'; end if;
  if v.status not in ('confirmed', 'pending') then return 'locked'; end if;
  perform 1 from venue_tables for update;
  select * into t from venue_tables where id = p_table and active;
  if not found then return 'not_found'; end if;
  if t.id = v.assigned_table_id then return 'unchanged'; end if;
  if t.kind = 'table' and table_taken(t.id, v.reservation_date, v.id) then return 'taken'; end if;
  if t.kind = 'bar_pool' and bar_used(t.id, v.reservation_date, v.id) + v.guests > t.pool_capacity then return 'full'; end if;
  update reservations set assigned_table_id = t.id, assigned_kind = t.kind where id = v.id;
  return case when v.guests between t.min_guests and t.max_guests then 'moved' else 'moved_size' end;
end;
$$;

-- A booking the manager enters (phone, WhatsApp, walk-in): no same-day cutoff or
-- approval, confirmed at once; on a chosen table if it is free, otherwise the best fit.
create function public.manager_add_booking(p_date date, p_time time, p_name text, p_phone text, p_guests int,
                                           p_note text, p_table int default null)
returns table(result text, reservation_id bigint, booking_token uuid)
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
declare t venue_tables%rowtype; v_table int; v_kind text; v_id bigint; v_token uuid;
begin
  if auth.uid() is null then raise exception 'not allowed'; end if;
  p_name  := coalesce(nullif(btrim(p_name), ''), 'ללא שם');
  p_phone := coalesce(btrim(p_phone), '');
  p_note  := nullif(btrim(p_note), '');
  if p_date is null or p_time is null or p_guests is null or p_guests not between 1 and 20
     or p_date < current_date or p_date > current_date + 60
     or length(p_name) > 80 or (p_phone <> '' and p_phone !~ '^[0-9+() -]{7,20}$') or length(p_note) > 300 then
    return query select 'invalid'::text, null::bigint, null::uuid;
    return;
  end if;
  perform 1 from venue_tables for update;
  if p_table is not null then
    select * into t from venue_tables where id = p_table and active;
    if not found then return query select 'invalid'::text, null::bigint, null::uuid; return; end if;
    if t.kind = 'table' and table_taken(t.id, p_date, null) then return query select 'taken'::text, null::bigint, null::uuid; return; end if;
    if t.kind = 'bar_pool' and bar_used(t.id, p_date, null) + p_guests > t.pool_capacity then
      return query select 'full'::text, null::bigint, null::uuid; return;
    end if;
    v_table := t.id; v_kind := t.kind;
  else
    select f.table_id, f.kind into v_table, v_kind from find_place(p_date, p_guests, null) f;
    if v_table is null then return query select 'full'::text, null::bigint, null::uuid; return; end if;
  end if;
  insert into reservations (reservation_date, arrival_time, customer_name, phone, guests, note, assigned_table_id, assigned_kind, status)
  values (p_date, p_time, p_name, p_phone, p_guests, p_note, v_table, v_kind, 'confirmed')
  returning id, access_token into v_id, v_token;
  return query select 'confirmed'::text, v_id, v_token;
end;
$$;

revoke execute on function public.set_arrived(bigint, boolean), public.move_booking(bigint, int),
  public.manager_add_booking(date, time, text, text, int, text, int) from public, anon;
grant execute on function public.set_arrived(bigint, boolean), public.move_booking(bigint, int),
  public.manager_add_booking(date, time, text, text, int, text, int) to authenticated;
