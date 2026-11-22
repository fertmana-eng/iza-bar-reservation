-- Reservation database access checks, run against the REAL database.
-- Everything happens inside one block that ends with an error on purpose,
-- so every test row is rolled back and nothing is changed.
-- The result comes back as the error message:
--   "DB CHECKS: ALL n PASSED"           everything is as it should be
--   "DB CHECKS: k OF n FAILED: ..."     the list of failed checks
-- Run it through the Supabase connector (execute_sql) or in the SQL Editor.
-- It uses only SELECT, INSERT and function calls (no UPDATE/DELETE), so the
-- connector runs it without a confirmation prompt. The manager's cancel
-- (an UPDATE) is checked by reading its permission and rule instead.
do $checks$
declare
  d date := current_date + 7;
  r record; n int; ok boolean; ok_list text; total int := 0; failed text[] := '{}';
begin
  -- ---------- structure ----------
  total:=total+1;
  if exists(select 1 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and not c.relrowsecurity)
    then failed:=failed||'a table has row-level security off'::text; end if;
  -- the public (anon) may only read settings; no table writes at all
  total:=total+1;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public' and grantee='anon'
            and not (table_name='settings' and privilege_type='SELECT'))
    then failed:=failed||'the public has table access beyond reading settings'::text; end if;
  total:=total+1;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public' and grantee='authenticated'
            and privilege_type in ('INSERT','DELETE','TRUNCATE'))
    then failed:=failed||'the manager can insert or delete rows directly'::text; end if;
  -- the manager's cancel: column permission on status only, plus a row rule
  total:=total+1;
  if not has_column_privilege('authenticated','public.reservations','status','UPDATE')
     or has_column_privilege('authenticated','public.reservations','phone','UPDATE')
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='reservations' and cmd='UPDATE' and 'authenticated'=any(roles))
    then failed:=failed||'manager cancel: permission should be on status only, with a row rule'::text; end if;
  total:=total+1;
  if exists(select 1 from pg_policies where schemaname='public' and tablename in ('reservations','venue_tables')
            and ('public'=any(roles) or 'anon'=any(roles)))
    then failed:=failed||'a booking/table rule still applies to the public'::text; end if;
  -- functions the booking page needs are callable by the public; nothing else is
  for r in select p.oid, p.proname from pg_proc p where p.pronamespace='public'::regnamespace loop
    total:=total+1;
    if has_function_privilege('anon',r.oid,'EXECUTE') <> (r.proname in ('book_reservation','available_spots','check_availability'))
      then failed:=failed||(r.proname||': wrong public access'); end if;
  end loop;

  -- the same-day cutoff must use Israel time, not the database's UTC
  total:=total+1;
  if not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='book_reservation'
                and 'TimeZone=Asia/Jerusalem'=any(proconfig))
    then failed:=failed||'book_reservation does not run in Israel time'::text; end if;

  -- functions with extra rights must have a fixed search_path
  for r in select p.proname, p.proconfig from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef loop
    total:=total+1;
    if not exists(select 1 from unnest(r.proconfig) c where c like 'search_path=%')
      then failed:=failed||(r.proname||': no fixed search_path'); end if;
  end loop;
  total:=total+1;
  if exists(select 1 from public.settings where key not in ('arrival_start','arrival_end','booking_cutoff'))
    then failed:=failed||'unexpected settings rows'::text; end if;

  -- ---------- as the public (anyone with the page's key) ----------
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  total:=total+1;
  begin perform 1 from public.reservations limit 1; failed:=failed||'the public can read bookings'::text;
  exception when insufficient_privilege then null; end;
  total:=total+1;
  begin perform 1 from public.venue_tables limit 1; failed:=failed||'the public can read tables'::text;
  exception when insufficient_privilege then null; end;
  total:=total+1;
  begin insert into public.reservations(reservation_date,arrival_time,customer_name,phone,guests,assigned_kind) values(d,'18:00','x','x',2,'table');
    failed:=failed||'the public can add bookings directly'::text;
  exception when insufficient_privilege then null; end;
  total:=total+1;
  select count(*) into n from public.settings;
  if n<>3 then failed:=failed||('the public sees '||n||' settings instead of 3'); end if;
  -- booking as a customer works (rolled back at the end)
  total:=total+1;
  select count(*) into n from public.book_reservation(d,'18:00','בדיקה','050-0000000',2,null,null) b where b.result='confirmed';
  if n<>1 then failed:=failed||'a customer cannot book'::text; end if;
  -- the function refuses what the page would never send (08_booking_limits.sql)
  total:=total+1;
  select string_agg(b.result,',') into ok_list from (
    select (public.book_reservation(d,'18:00','x','050-0000000',11,null,null)).result
    union all select (public.book_reservation(current_date-1,'18:00','x','050-0000000',2,null,null)).result
    union all select (public.book_reservation(d,'18:00',repeat('x',81),'050-0000000',2,null,null)).result
    union all select (public.book_reservation(d,'18:00','x','abc',2,null,null)).result
    union all select (public.book_reservation(d,'18:00','x','050-0000000',2,null,'nope')).result) b;
  if ok_list<>'invalid,invalid,invalid,invalid,invalid' then failed:=failed||('bad input not refused: '||ok_list); end if;
  total:=total+1;
  if public.available_spots(d) is null or public.check_availability(d,2) is null then failed:=failed||'availability functions fail for the public'::text; end if;

  -- ---------- as the logged-in manager ----------
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  total:=total+1;
  select count(*) into n from public.reservations where reservation_date=d and customer_name='בדיקה';
  if n<>1 then failed:=failed||'the manager cannot see a new booking'::text; end if;
  total:=total+1;
  select count(*) into n from public.venue_tables;
  if n=0 then failed:=failed||'the manager cannot read tables'::text; end if;
  total:=total+1;
  begin insert into public.reservations(reservation_date,arrival_time,customer_name,phone,guests,assigned_kind) values(d,'18:00','x','x',2,'table');
    failed:=failed||'the manager can add bookings directly'::text;
  exception when insufficient_privilege then null; end;

  perform set_config('role','postgres',true);
  if array_length(failed,1) is null then raise exception 'DB CHECKS: ALL % PASSED', total;
  else raise exception 'DB CHECKS: % OF % FAILED: %', array_length(failed,1), total, array_to_string(failed,' | '); end if;
end $checks$;
