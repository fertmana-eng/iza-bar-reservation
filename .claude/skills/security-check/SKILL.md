---
name: security-check
description: Security check for reservation changes that touch customer data, the manager page, logins or the database. Use before merging such a change, or when the owner types /security-check.
---

# Security check

Work in plain, non-technical language for the owner (see CLAUDE.md). Read only;
never change the database without the owner's OK (CLAUDE.md explains how
database changes are applied).

Supabase project id: `brpovhypzsgwsnuenpfj` (it pauses after inactivity; if
it is paused, ask the owner before restoring it).

The rule to protect: **customers' names, phone numbers and emails may be seen
only by the logged-in manager** (one user, `izabar`; public sign-up must be off). The publishable key is in the public booking
page, so anything the "anon" role can reach, anyone on the internet can reach.

0. **Run the saved database check first:** pass the contents of
   `tests/db/checks.sql` to the Supabase connector's execute_sql. It must end
   with "DB CHECKS: ALL n PASSED". When a change adds a new database action,
   function or permission rule, add a check for it to that file in the same change.
1. **Automatic advisor:** run Supabase's security advisor and explain every
   warning.
2. **Anonymous access:** the anon role may only read the public settings
   (arrival hours, cutoff) and call the booking functions
   (`book_reservation`, `available_spots`, `check_availability`). It must not be
   able to read, change or cancel reservations, or read table names that the
   customer shouldn't see. Check both layers: table permissions (GRANT,
   `information_schema.role_table_grants`) and row rules (policies), plus
   EXECUTE on every function.
3. **Booking functions:** they run with extra rights (security definer), so
   they must check their own input: date in range, time within hours, guests
   1–10, name/phone/note/email of reasonable length, and `search_path` set.
4. **Test every write as the real role, exactly as the page does it,** in a DO
   block that ends with `raise exception` so everything is rolled back (avoid
   UPDATE/DELETE there; they trigger a confirmation prompt that times out —
   check those rules by reading the policy). The tests in `tests/` use a fake
   database with no access rules, so they can't catch this.
5. **Edge function `notify-booking`** (Android notifications): compare the
   deployed code with `supabase/functions/notify-booking/index.ts`. It must
   refuse callers who aren't the logged-in manager, and read the
   notification keys only from the locked `app_secrets` table (never from
   the code; the repository is public).
   **Edge function `send-reminders`** (automatic reminders, called every 10
   minutes by the database scheduler, `verify_jwt` off): compare with
   `supabase/functions/send-reminders/index.ts`; it must refuse any call
   without the scheduler's secret (`app_secrets` 'cron_secret').
6. **Page code:** no passwords or keys (other than the publishable key) in the
   pages; anything built from customer text (name, note) is escaped before it
   is shown, especially on the manager page.
7. Keep `supabase/` in step: if a database change or function deploy happened,
   save it there.
8. Report in plain language: what was checked, anything found, and what you
   propose (ask before applying).
