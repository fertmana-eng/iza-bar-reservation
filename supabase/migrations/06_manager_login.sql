-- ===================================================================
-- Close customer details to the public (Nov 2026).
-- Before: the "dev" rules from 03_admin_policies.sql let anyone with the
-- page's public key read every booking (names, phones, emails) and cancel it.
-- After: only the logged-in manager (the restaurant's single user, username
-- izabar) can read bookings, see all tables and cancel bookings. Customers
-- keep booking through the functions book_reservation / available_spots /
-- check_availability, which run with their own rights and are unchanged.
-- Requires public sign-up to be OFF in Supabase (Authentication → Sign In /
-- Providers), otherwise anyone could create a login.
-- ===================================================================

drop policy "dev: anyone can read reservations" on public.reservations;
drop policy "dev: anyone can update reservations" on public.reservations;
drop policy "dev: anyone can read venue_tables" on public.venue_tables;
drop policy "public can read active tables" on public.venue_tables;   -- the booking page never reads tables

-- Table permissions: only what the pages actually use.
revoke all on public.reservations, public.venue_tables, public.settings from anon, authenticated;
grant select on public.settings to anon, authenticated;             -- arrival hours and cutoff (row rule limits the keys)
grant select on public.venue_tables to authenticated;
grant select, update (status) on public.reservations to authenticated;

create policy "manager can read reservations" on public.reservations
  for select to authenticated using (true);
create policy "manager can cancel reservations" on public.reservations
  for update to authenticated using (true) with check (status in ('confirmed', 'cancelled'));
create policy "manager can read tables" on public.venue_tables
  for select to authenticated using (true);
