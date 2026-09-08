-- ===================================================================
-- הפונקציה המרכזית: מנסה לשבץ הזמנה חדשה
-- מחזירה: 'confirmed' + מספר הזמנה, או 'full' אם אין מקום מתאים
-- security definer + row locking כדי למנוע מצב מרוץ בין שתי הזמנות בו-זמנית
-- ===================================================================
create or replace function book_reservation(
  p_date          date,
  p_time          time,
  p_name          text,
  p_phone         text,
  p_guests        int,
  p_note          text
) returns table(result text, reservation_id bigint) as $$
declare
  v_cutoff        time;
  v_arrival_start time;
  v_arrival_end   time;
  v_table_id      int;
  v_bar_id        int;
  v_bar_capacity  int;
  v_bar_used      int;
  v_new_id        bigint;
begin
  select value::time into v_cutoff        from settings where key = 'booking_cutoff';
  select value::time into v_arrival_start from settings where key = 'arrival_start';
  select value::time into v_arrival_end   from settings where key = 'arrival_end';

  if p_date = current_date and current_time > v_cutoff then
    return query select 'closed'::text, null::bigint;
    return;
  end if;

  if p_time < v_arrival_start or p_time > v_arrival_end then
    return query select 'invalid_time'::text, null::bigint;
    return;
  end if;

  -- נועל את כל השולחנות הרלוונטיים לטרנזקציה הזו כדי למנוע שיבוץ כפול בו-זמני
  perform 1 from venue_tables where kind = 'table' for update;

  -- שולחן ייעודי מתאים - הכי קטן שמכיל את כמות הסועדים, ועדיין פנוי לתאריך הזה
  select vt.id into v_table_id
  from venue_tables vt
  where vt.kind = 'table'
    and vt.active = true
    and p_guests between vt.min_guests and vt.max_guests
    and not exists (
      select 1 from reservations r
      where r.assigned_table_id = vt.id
        and r.reservation_date = p_date
        and r.status = 'confirmed'
    )
  order by (vt.max_guests - vt.min_guests) asc, vt.max_guests asc
  limit 1;

  if v_table_id is not null then
    insert into reservations (reservation_date, arrival_time, customer_name, phone, guests, note, assigned_table_id, assigned_kind)
    values (p_date, p_time, p_name, p_phone, p_guests, p_note, v_table_id, 'table')
    returning id into v_new_id;
    return query select 'confirmed'::text, v_new_id;
    return;
  end if;

  -- אין שולחן ייעודי מתאים - ננסה את מאגר הבר
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
      and status = 'confirmed';

    if v_bar_used + p_guests <= v_bar_capacity then
      insert into reservations (reservation_date, arrival_time, customer_name, phone, guests, note, assigned_table_id, assigned_kind)
      values (p_date, p_time, p_name, p_phone, p_guests, p_note, v_bar_id, 'bar_pool')
      returning id into v_new_id;
      return query select 'confirmed'::text, v_new_id;
      return;
    end if;
  end if;

  return query select 'full'::text, null::bigint;
end;
$$ language plpgsql security definer;

-- ===================================================================
-- פונקציית עזר: כמה מקומות פנויים נותרו היום (לתצוגה ללקוח - "נותרו X מקומות")
-- לא חושפת שולחנות/שמות, רק מספר גס
-- ===================================================================
create or replace function available_spots(p_date date) returns int as $$
declare
  v_free_tables int;
  v_bar_free    int;
begin
  select count(*) into v_free_tables
  from venue_tables vt
  where vt.kind = 'table' and vt.active = true
    and not exists (
      select 1 from reservations r
      where r.assigned_table_id = vt.id and r.reservation_date = p_date and r.status = 'confirmed'
    );

  select greatest(vt.pool_capacity - coalesce(sum(r.guests), 0), 0) into v_bar_free
  from venue_tables vt
  left join reservations r on r.assigned_table_id = vt.id and r.reservation_date = p_date and r.status = 'confirmed'
  where vt.kind = 'bar_pool' and vt.active = true
  group by vt.pool_capacity;

  return v_free_tables + coalesce(v_bar_free, 0);
end;
$$ language plpgsql security definer;

grant execute on function book_reservation to anon;
grant execute on function available_spots to anon;
