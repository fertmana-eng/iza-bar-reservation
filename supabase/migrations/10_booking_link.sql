-- ===================================================================
-- Personal booking link, step 1 (docs/plan-booking-link.md).
-- Every booking gets a secret token; customers reach their own booking only
-- through these functions, never the table itself.
-- Part A only adds things (applied via the connector, 22 Nov 2026).
-- Part B replaces book_reservation so it also returns the token (its
-- return type changes, so it must be dropped first): run by the owner.
-- ===================================================================

-- ---------- Part A ----------
alter table public.reservations add column access_token uuid not null default gen_random_uuid();
create unique index reservations_access_token_key on public.reservations (access_token);
alter table public.reservations add column cancelled_by text check (cancelled_by in ('customer', 'manager'));

-- one booking by its secret. can_change: until 1 hour before arrival;
-- can_cancel: any time until the day is over (owner's answers)
create function public.get_booking(p_token uuid)
returns table(id bigint, status text, reservation_date date, arrival_time time, customer_name text,
              guests int, note text, cancelled_by text, can_change boolean, can_cancel boolean)
language sql stable security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
  select r.id, r.status, r.reservation_date, r.arrival_time, r.customer_name, r.guests, r.note, r.cancelled_by,
         r.status in ('confirmed', 'pending') and (r.reservation_date + r.arrival_time) - interval '1 hour' > localtimestamp,
         r.status in ('confirmed', 'pending') and r.reservation_date >= current_date
  from reservations r
  where p_token is not null and r.access_token = p_token;
$$;

create function public.cancel_booking(p_token uuid)
returns text
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
declare v reservations%rowtype;
begin
  select * into v from reservations where p_token is not null and access_token = p_token for update;
  if not found then return 'not_found'; end if;
  if v.status not in ('confirmed', 'pending') then return v.status; end if;
  if v.reservation_date < current_date then return 'past'; end if;
  update reservations set status = 'cancelled', cancelled_by = 'customer' where id = v.id;
  return 'cancelled';
end;
$$;

create function public.update_booking_note(p_token uuid, p_note text)
returns text
language plpgsql security definer
set search_path = public, pg_temp
set timezone = 'Asia/Jerusalem'
as $$
declare v reservations%rowtype;
begin
  p_note := nullif(btrim(p_note), '');
  if length(p_note) > 300 then return 'invalid'; end if;
  select * into v from reservations where p_token is not null and access_token = p_token for update;
  if not found then return 'not_found'; end if;
  if v.status not in ('confirmed', 'pending')
     or (v.reservation_date + v.arrival_time) - interval '1 hour' <= localtimestamp then
    return 'locked';
  end if;
  update reservations set note = p_note where id = v.id;
  return 'saved';
end;
$$;

grant execute on function public.get_booking(uuid), public.cancel_booking(uuid), public.update_booking_note(uuid, text) to anon, authenticated;

-- ---------- Part B (owner) ----------
-- drop function public.book_reservation(date, time, text, text, integer, text, text);
-- create function public.book_reservation(...) returns table(result text, reservation_id bigint, booking_token uuid) ...
--   same body as 09_approval_window.sql, with "returning id, access_token into v_new_id, v_token"
--   and "return query select v_status, v_new_id, v_token". Full text: 10b_book_reservation_token.sql
