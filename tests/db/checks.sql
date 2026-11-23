-- Reservation database access checks, run against the REAL database.
-- Everything happens inside one block that ends with an error on purpose,
-- so every test row is rolled back and nothing is changed.
-- The result comes back as the error message:
--   "DB CHECKS: ALL n PASSED"           everything is as it should be
--   "DB CHECKS: k OF n FAILED: ..."     the list of failed checks
-- Run it through the Supabase connector (execute_sql) or in the SQL Editor.
-- It uses only SELECT, INSERT and function calls (no UPDATE/DELETE), so the
-- connector runs it without a confirmation prompt.
-- The time-of-day rules (16:00 / 20:00 / 30 minutes ahead) depend on the clock and
-- are checked by the behaviour tests and by dry runs, not here. The manager's cancel
-- (an UPDATE) is checked by reading its permission and rule instead.
do $checks$
declare
  d date := current_date + 7;
  r record; n int; ok boolean; ok_list text; tok uuid; total int := 0; failed text[] := '{}';
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
    if has_function_privilege('anon',r.oid,'EXECUTE') <> (r.proname in ('book_reservation','available_spots','check_availability','get_booking','cancel_booking','update_booking_note','change_booking','save_push_subscription'))
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
  if exists(select 1 from public.settings where key not in ('arrival_start','arrival_end','booking_cutoff','approval_from'))
     or (select value from public.settings where key='booking_cutoff')<>'20:00'
     or (select value from public.settings where key='approval_from')<>'16:00'
    then failed:=failed||'settings: expected cutoff 20:00 and approval from 16:00'::text; end if;
  -- same-day approval window (09_approval_window.sql): statuses, the manager's answers, held tables
  -- changes (11_booking_changes.sql): only the manager answers; a waiting change keeps its original table
  -- notifications (12_push_notifications.sql): phone addresses and keys are locked away
  total:=total+1;
  if exists(select 1 from information_schema.role_table_grants where table_schema='public'
            and table_name in ('push_subscriptions','app_secrets') and grantee in ('anon','authenticated'))
     or not exists(select 1 from public.app_secrets where key='vapid_private')
    then failed:=failed||'notifications: tables not locked, or the key is missing'::text; end if;
  -- 11b: every booking path uses the shared helpers, and the link shows a waiting change's original
  total:=total+1;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace
        and proname in ('book_reservation','check_availability') and prosrc like '%find_place%')<>2
     or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='available_spots' and prosrc like '%table_taken%')
     or not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname='get_booking' and 'prev_date'=any(proargnames))
    then failed:=failed||'11b not applied: booking functions do not use the shared helpers'::text; end if;
  -- automatic reminders (14_booking_reminders.sql): the scheduler runs, its secret exists,
  -- and the list of due bookings is for the server only
  total:=total+1;
  if not exists(select 1 from cron.job where jobname='booking-reminders' and active)
     or not exists(select 1 from public.app_secrets where key='cron_secret')
     or has_function_privilege('anon','public.due_reminders()','EXECUTE')
     or has_function_privilege('authenticated','public.due_reminders()','EXECUTE')
    then failed:=failed||'reminders: scheduler, secret or locked list missing'::text; end if;
  -- the manager's floor actions (13_manager_floor.sql): logged-in manager only
  total:=total+1;
  if has_function_privilege('anon','public.move_booking(bigint,integer)','EXECUTE')
     or has_function_privilege('anon','public.set_arrived(bigint,boolean)','EXECUTE')
     or has_function_privilege('anon','public.manager_add_booking(date,time,text,text,integer,text,integer)','EXECUTE')
     or not has_function_privilege('authenticated','public.manager_add_booking(date,time,text,text,integer,text,integer)','EXECUTE')
    then failed:=failed||'floor actions: only the logged-in manager may call them'::text; end if;
  total:=total+1;
  if has_function_privilege('anon','public.decide_request(bigint,boolean)','EXECUTE')
     or not has_function_privilege('authenticated','public.decide_request(bigint,boolean)','EXECUTE')
    then failed:=failed||'decide_request: only the logged-in manager may call it'::text; end if;
  total:=total+1;
  insert into public.reservations(reservation_date,arrival_time,customer_name,phone,guests,assigned_table_id,assigned_kind,status,prev)
    select d,'20:30','בדיקת שינוי','050-1000001',2,null,'bar_pool','pending',
           jsonb_build_object('reservation_date',d,'arrival_time','19:00','guests',2,'assigned_table_id',id,'assigned_kind','table')
    from public.venue_tables where kind='table' and active and not public.table_taken(id,d,null) order by id limit 1
    returning (prev->>'assigned_table_id')::int into n;
  if n is null or not public.table_taken(n,d,null) then failed:=failed||'a waiting change does not hold its original table'::text; end if;
  total:=total+1;
  if not exists(select 1 from pg_constraint where conname='reservations_status_check')
     or not exists(select 1 from pg_policies where schemaname='public' and tablename='reservations' and cmd='UPDATE'
                   and with_check like '%declined%' and with_check like '%confirmed%')
    then failed:=failed||'approve/decline: status rule or manager update rule missing'::text; end if;
  total:=total+1;
  n := public.available_spots(d);
  insert into public.reservations(reservation_date,arrival_time,customer_name,phone,guests,assigned_table_id,assigned_kind,status)
    select d,'19:00','בדיקה ממתינה','050-1000002',2,id,'table','pending' from public.venue_tables
    where kind='table' and active and not public.table_taken(id,d,null) order by id limit 1;
  if public.available_spots(d)<>n-1 then failed:=failed||'a pending request does not hold its table'::text; end if;

  insert into public.reservations(reservation_date,arrival_time,customer_name,phone,guests,assigned_table_id,assigned_kind,status)
    select d+4,'19:00','שולחנות מלאים','054-'||lpad(id::text,7,'0'),2,id,'table','confirmed' from public.venue_tables where kind='table' and active;

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
  -- the personal booking link (10_booking_link.sql): only with the right secret
  total:=total+1;
  select b.booking_token into tok from public.book_reservation(d,'19:30','בדיקת קישור','050-0000001',2,null,null) b;
  if tok is null then failed:=failed||'a new booking has no secret link'::text;
  else
    select count(*) into n from public.get_booking(tok);
    if n<>1 then failed:=failed||'the link does not find its booking'::text; end if;
    select count(*) into n from public.get_booking(gen_random_uuid());
    if n<>0 then failed:=failed||'a wrong secret finds a booking'::text; end if;
    if public.update_booking_note(gen_random_uuid(),'x')<>'not_found' or public.cancel_booking(gen_random_uuid())<>'not_found'
      then failed:=failed||'a wrong secret can change a booking'::text; end if;
    if public.update_booking_note(tok,'הערה')<>'saved' then failed:=failed||'the link cannot save a comment'::text; end if;
    if public.change_booking(gen_random_uuid(), d, '19:00', 2)<>'not_found' then failed:=failed||'a wrong secret can change a booking'::text; end if;
    if public.change_booking(tok, d, '19:00', 11)<>'invalid' then failed:=failed||'a change to 11 guests is not refused'::text; end if;
    if public.change_booking(tok, d, '20:00', 3) not in ('confirmed','full') then failed:=failed||'the link cannot change the booking'::text; end if;
    if public.save_push_subscription(gen_random_uuid(),'https://push.example/x',repeat('p',40),repeat('a',16))<>'not_found'
       or public.save_push_subscription(tok,'http://not-secure/x',repeat('p',40),repeat('a',16))<>'invalid'
      then failed:=failed||'notification sign-up accepts a wrong secret or a bad address'::text; end if;
    if public.save_push_subscription(tok,'https://push.example/x',repeat('p',40),repeat('a',16))<>'saved'
      then failed:=failed||'the link cannot sign up for notifications'::text; end if;
    begin perform 1 from public.push_subscriptions; failed:=failed||'the public can read phone addresses'::text;
    exception when insufficient_privilege then null; end;
    begin perform 1 from public.app_secrets; failed:=failed||'the public can read the notification keys'::text;
    exception when insufficient_privilege then null; end;
    if public.cancel_booking(tok)<>'cancelled' then failed:=failed||'the link cannot cancel'::text; end if;
  end if;
  total:=total+1;
  begin perform public.decide_request(1, true); failed:=failed||'the public can approve requests'::text;
  exception when insufficient_privilege then null; end;
  total:=total+1;
  if public.available_spots(d) is null or public.check_availability(d,2) is null then failed:=failed||'availability functions fail for the public'::text; end if;

  -- table or bar, and double bookings (15_seating_and_limits.sql)
  total:=total+1;
  select string_agg(b.result||'/'||coalesce(b.seating,'-'),',') into ok_list from (
    select (x).result, (x).seating from (select public.book_reservation(d,'18:30','בדיקת בר','052-2000001',2,null,'bar') x) y
    union all select (x).result, (x).seating from (select public.book_reservation(d,'18:30','כפול','+972 52-200-0001',2,null,'table') x) y) b;
  if ok_list<>'confirmed/bar,duplicate/-' then failed:=failed||('bar booking / one per phone per evening: '||ok_list); end if;
  total:=total+1;
  select b.booking_token into tok from public.book_reservation(d+1,'18:30','בדיקת בר','052-2000001',2,null,'bar') b;
  if tok is null or (select g.seating from public.get_booking(tok) g)<>'bar'
    then failed:=failed||'the link does not show the bar'::text;
  elsif public.change_booking(tok, d+1, '19:00', 3)<>'confirmed'
    then failed:=failed||'a change of guests at the bar is refused'::text;
  elsif (select g.seating from public.get_booking(tok) g)<>'bar'
    then failed:=failed||'a change does not keep the bar'::text;
  elsif public.change_booking(tok, d, '19:00', 3)<>'duplicate'
    then failed:=failed||'a change can move onto an evening the phone already booked'::text;
  else
    -- the change and the read-back are separate steps (one step sees the data as it was when it started)
    ok_list := public.change_booking(tok, d+1, '19:00', 3, 'table');
    if ok_list<>'confirmed' or (select g.seating from public.get_booking(tok) g)<>'table'
      then failed:=failed||('a change cannot switch from the bar to a table (16): '||ok_list); end if;
  end if;
  total:=total+1;
  perform set_config('request.headers','{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}',true);
  select string_agg(b.result,',' order by ph) into ok_list
    from unnest(array['053-3000001','053-3000002','053-3000003','053-3000004']) ph
    cross join lateral public.book_reservation(d+2,'19:00','בדיקת קצב',ph,2,null,null) b;
  perform set_config('request.headers','{"x-forwarded-for":"198.51.100.7"}',true);
  select ok_list||','||(public.book_reservation(d+2,'19:00','בדיקת קצב','053-3000005',2,null,null)).result into ok_list;
  perform set_config('request.headers','',true);
  if ok_list<>'confirmed,confirmed,confirmed,too_many,confirmed' then failed:=failed||('3 bookings an hour per connection: '||ok_list); end if;
  total:=total+1;
  if public.check_availability(d+3,2,'table')<>'yes' or public.check_availability(d+3,2,'bar')<>'yes'
     or public.check_availability(d+3,6,'bar')<>'no'
    then failed:=failed||'the search does not follow table / bar'::text; end if;

  total:=total+1;
  if public.check_availability(d+4,2,'table')<>'bar'
     or (select b.result from public.book_reservation(d+4,'19:00','בדיקת שולחן','055-5000001',2,null,'table') b)<>'bar_available'
     or (select b.seating from public.book_reservation(d+4,'19:00','בדיקת שולחן','055-5000001',2,null,'bar') b)<>'bar'
    then failed:=failed||'no table left: the bar is not offered'::text; end if;
  total:=total+1;
  select b.booking_token into tok from public.book_reservation(d+4,'19:00','בדיקת מעבר','055-5000002',2,null,'bar') b;
  ok_list := public.change_booking(tok, d+4, '19:00', 2, 'table');
  if ok_list<>'bar_available' or (select g.seating from public.get_booking(tok) g)<>'bar'
     or public.change_booking(tok, d+4, '19:00', 2, 'nope')<>'invalid'
    then failed:=failed||'a change to a table when none is left is not answered with the bar (16)'::text; end if;

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
  total:=total+1;
  begin perform 1 from public.app_secrets; failed:=failed||'the manager page can read the notification keys'::text;
  exception when insufficient_privilege then null; end;

  perform set_config('role','postgres',true);
  if array_length(failed,1) is null then raise exception 'DB CHECKS: ALL % PASSED', total;
  else raise exception 'DB CHECKS: % OF % FAILED: %', array_length(failed,1), total, array_to_string(failed,' | '); end if;
end $checks$;
