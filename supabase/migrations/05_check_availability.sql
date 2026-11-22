-- ===================================================================
-- Created directly in the database during the chat (Sept 2026) and never
-- saved to a file; copied here from the live database in Nov 2026
-- (indentation tidied, logic unchanged).
-- The booking page calls it on the guests step: is there a free table
-- (or room at the bar) for this many guests on this date?
-- ===================================================================
create or replace function public.check_availability(p_date date, p_guests integer)
returns boolean
language plpgsql
security definer
as $function$
declare
  v_table_id     int;
  v_bar_id       int;
  v_bar_capacity int;
  v_bar_used     int;
begin
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
  limit 1;

  if v_table_id is not null then
    return true;
  end if;

  select vt.id, vt.pool_capacity into v_bar_id, v_bar_capacity
  from venue_tables vt where vt.kind = 'bar_pool' and vt.active = true
  limit 1;

  if v_bar_id is not null and p_guests between (select min_guests from venue_tables where id = v_bar_id)
                                          and (select max_guests from venue_tables where id = v_bar_id) then
    select coalesce(sum(guests), 0) into v_bar_used
    from reservations
    where assigned_table_id = v_bar_id
      and reservation_date = p_date
      and status = 'confirmed';

    if v_bar_used + p_guests <= v_bar_capacity then
      return true;
    end if;
  end if;

  return false;
end;
$function$;
