# Iza Bar table reservations – notes for Claude

## About the owner (how to work with them)

Same owner as the IzaZoo management app (repository
`fertmana-eng/IzaZoo-management`); the same working rules apply:

- The owner does not write code and relies on Claude for all technical work.
  Explain things in plain, non-technical language. Avoid jargon; when a
  technical term is unavoidable, say what it means.
- **Act, then inform.** Claude may push, open pull requests and merge them into
  `main` without asking first, then tell the owner what was done and how to
  test it on their phone. Still ask before anything that cannot be undone, such
  as deleting data or changing the database.
- **Model:** the owner is on the Pro plan; use Opus. For hard or risky work,
  work in small steps, test each one (before/after screenshots for visual
  changes), and ask the owner to check each step on their phone.
- **Say up front when something can't be done** (browser or platform rules
  that code can't change), before writing code, and offer the best alternative.
- **Keep this file up to date** whenever something worth remembering happens
  (a fix merged, a decision made, a new rule from the owner, a lesson learned,
  the next steps changing), so a new session can continue without losing
  progress.

## The project

- A Hebrew (RTL) table-booking website for עיזה בר. Started in a Claude chat
  (Sept 2026), uploaded to GitHub in one go, moved to Claude Code in Nov 2026.
  **Not live for customers yet** (owner, Nov 2026).
- `index.html`: the public booking page (the link sent to customers). Steps:
  welcome text → date (up to 30 days ahead) → number of guests (1–10) →
  arrival time (17:00–21:00, 15-minute steps) → name and phone → summary with
  optional note → confirmation with "send to my WhatsApp" and "add
  to calendar". Same-day online booking closes at 17:00. Outdoor seating can't
  be booked (walk-in only), as the welcome text says.
- `admin.html`: the manager page: login first, then the bookings of a chosen
  day grouped into high tables / low tables / bar, with totals, a cancel
  button and "יציאה" (sign out).
- Login (owner's decision, Nov 2026): **one user only, the restaurant**,
  username `izabar`. Supabase logins need an email, so the page turns the
  username into `izabar@izabar.local` (not a real inbox; created by the owner
  in Supabase → Authentication → Users with "Auto Confirm User"). Never store
  the password anywhere. Public sign-up must stay OFF, otherwise anyone could
  create a login and see every booking.
- Seating (database function `book_reservation`): 7 indoor tables (high: 1, 2,
  3, 18; low: 4, 6, 7, each with a min/max group size) plus the bar as one
  shared pool of 12 seats (groups of 1–4). A booking gets the tightest-fitting
  free table; if none fits, the bar if it has room; otherwise "full". **A table
  is booked for the whole evening** (one booking per table per date); confirm
  with the owner whether that is intended.
- **No confirmation emails** (owner's decision, Nov 2026): the email field,
  the never-deployed `send-confirmation` function and its setup notes were
  removed. The database still has the `email` column and `book_reservation`'s
  optional `p_email` (harmless; the page no longer sends it).
- Backend: its own Supabase project, separate from IzaZoo: "IZA Bar
  reservation", id `brpovhypzsgwsnuenpfj` (free plan; it pauses after
  inactivity; restored 22 Nov 2026 with the owner's OK; database time zone
  is UTC, so anything using the clock must set Israel time). Only the publishable key is in the
  pages. The supabase-js library is loaded from a CDN (jsdelivr, unpinned
  version `@2`); IzaZoo uses a bundled copy instead.
- Hosting (owner's decision, Nov 2026): **exactly like IzaZoo: GitHub Pages
  from `main` plus Supabase.** The repository is being made public for that
  (free Pages needs a public repository; it holds no secrets or customer data,
  only the publishable key that is in the page anyway). Address:
  https://fertmana-eng.github.io/iza-bar-reservation/ (manager page:
  `admin.html`). The old copies: **Cloudflare** deleted by the owner (22 Nov
  2026). **Netlify** (project `remarkable-twilight-87b52c`, marked "Private",
  so only the owner's Netlify team can open it) is still connected: its new
  layout shows no delete button on the phone or in desktop view, so it was
  left for now. Harmless; delete it some time from a computer (or remove
  Netlify's access to this repository in GitHub → Settings → Applications).
- Database changes are kept in `supabase/migrations/`. The four
  original SQL files (`supabase/migrations/01_…04_`) were run by hand in the
  SQL Editor; they may not match the real database exactly (see below).

## Known problems (found Nov 2026, not fixed yet)

1. ~~Customer details open to anyone~~: fixed 22 Nov 2026 (manager login +
   `06_manager_login.sql`, run by the owner; user `izabar` created; public
   sign-up switched off by the owner). `tests/db/checks.sql`: ALL 17 PASSED.
2. ~~`check_availability` missing~~: it exists in the real database (created
   by hand in Sept); now saved as `supabase/migrations/05_check_availability.sql`.
3. ~~Time zone~~: fixed 22 Nov 2026. The pages use Israel time whatever the
   phone's time zone; `book_reservation` runs in Israel time
   (`07_israel_time.sql`). This also fixed a worse bug: every calendar day was
   linked to the day before it (tapping 26 booked the 25th).
4. ~~Customer text inserted as HTML~~: fixed 22 Nov 2026. Everything a
   customer types goes through `esc()` on both pages and in the email code.
5. ~~Confirmation emails never sent~~: emails dropped by the owner; removed.
6. ~~Function limits~~ (`08_booking_limits.sql`, run by the owner;
   it replaces `book_reservation` and deletes a row, so the connector can't):
   guests 1–10, date today to +30 days, name 1–80, phone 7–20 of digits
   `+ - ( )` and spaces, note ≤300, email ≤120 and address-shaped, else
   `'invalid'`; fixed `search_path` on all three functions. The page checks
   the same phone rule and has matching `maxlength`s. Run by the owner
   22 Nov 2026; `tests/db/checks.sql`: ALL 23 PASSED.
7. The unused `admin_password_hash` setting: removed by `08_booking_limits.sql`.
8. ~~"הוספה ליומן" on Android~~: fixed 22 Nov 2026. Android opens Google
   Calendar with the booking filled in (Chrome on Android can't open a
   calendar file straight into the calendar, a platform rule); iPhone and
   computers download a complete `.ics` (UTC times, end time, UID, DTSTAMP).
   The visit is entered as **2 hours** (Claude's choice; ask the owner if it
   should change).

## Next steps (in order)

1. WhatsApp confirmation as a file instead of text (owner's wish, Nov 2026).
   A web page can't attach a file to a wa.me link and can't send from the
   bar's WhatsApp (that needs the paid WhatsApp Business API). Proposed: a
   "share" button (Web Share API with a file) that opens the phone's share
   sheet; the customer picks WhatsApp. Recommended format: a picture of a
   booking card (Hebrew renders natively, shows inline in WhatsApp) rather
   than a PDF (needs a PDF library with an embedded Hebrew font). Waiting for
   the owner's choice.
2. New features with the owner (use a short planning interview first).

## How we make changes (always)

- **All changes go through Claude Code on this repository**, never by pasting
  a whole new file from a chat. Ideas from a chat are fine; bring the idea, not
  the file.
- **Small changes, one at a time:** one pull request per fix or feature.
- **Every change gets /qa** (and /design-check or /security-check when they
  apply). Every bug fixed gets a test that would have caught it.
- **Merge only when the GitHub "Tests" check is green**, then ask the owner to
  check on the phone.
- **Clean up as you go:** when replacing something, remove the old code in the
  same change instead of adding overrides on top.
- **Database changes:** a Supabase connector may be available. Read-only
  queries and changes that only add something can go through it (apply_migration);
  for changes that drop or replace something its confirmation prompt doesn't
  reach the owner's phone, so give the owner the SQL to paste into the
  dashboard's SQL Editor and press Run. Never work around that by adding rules
  that override old ones (access rules add up, so an added rule can never take
  away access an old rule grants). Dry-run a migration first in a DO block
  that ends with `raise exception` (everything rolled back).
- Never schedule /health-check; suggest it after a batch of changes, about a
  month after the last one, or before a big feature.

## Checks ("departments")

- `/qa` (`.claude/skills/qa/SKILL.md`): after every change, before merging.
- `/design-check`: when anything visual could change.
- `/security-check`: when customer data, logins, permissions or Supabase code change.
- `/health-check`: suggest it, don't run or schedule it on your own.

The "Tests" GitHub workflow (`.github/workflows/tests.yml`, job
`behaviour-tests`) runs the behaviour tests on every pull request and on
`main`. To make GitHub refuse merges while it is red, the owner can add a
ruleset on `main` (Settings → Rules) requiring the `behaviour-tests` check, as
in IzaZoo; on a private repository this may need a paid GitHub plan.

## Testing

Tests live in `tests/` (see `tests/README.md`). They run in headless Chromium
against a fake database (`tests/fake-supabase.js`), never the real project,
with a fixed clock in Israel time.

- **Behaviour tests:** `node --test tests/app.test.js` (27 tests). Run after
  every change; add a test for every bug fixed.
- **Styling changes:** `tests/visual/screenshots.js` before and after, then
  `tests/visual/compare.js` (`cd tests && npm install` first). Accept only zero
  differences, or differences the owner asked for.
- **Real-database check:** `tests/db/checks.sql` (rolled back; reports
  `DB CHECKS: ALL n PASSED`), run by the security check through the connector.
  Not run on GitHub on purpose (it would need the database password there).
- **The fake database has no access rules**, and its `check_availability`
  answers even though that function may not exist in the real database.
  Database rules and functions must be checked on the real database
  (security check).
- Always finish by asking the owner to check the change on their phone.

## Done so far

- Nov 2026: moved to Claude Code. SQL files and the edge function moved into
  `supabase/`; added this file, the behaviour tests, screenshot tools, the
  GitHub "Tests" workflow and the /qa, /design-check, /security-check and
  /health-check checklists. No change to how the pages work.
- Nov 2026: published with GitHub Pages (repository made public); the
  database was restored; `check_availability` saved from the live database.
- Nov 2026: manager login on `admin.html` (one user, `izabar`), sign out, and
  a message with "נסו שוב" when bookings can't be loaded. Bookings closed to
  the public in the database (`06_manager_login.sql`); saved database check.

- Nov 2026: Israel time everywhere (pages and the database cutoff); the
  calendar's day numbers now book the right date.
- Nov 2026: "add to calendar" opens Google Calendar on Android; complete
  calendar file elsewhere.
- Nov 2026: customer text escaped on both pages.
- Nov 2026: limits inside the database (08) and matching checks on the page;
  email option removed (owner's decision).
- Nov 2026 (experiment, not part of this site): a 3D model of the bar from an
  old architect's plan, with tappable seats, as a private claude.ai artifact
  ("עיזה בר – בחירת מקומות", https://claude.ai/artifact/XodKCTKkfWuZLcSuZokYxM;
  source kept outside the repo). The owner is considering letting customers
  pick seats and may send a video tour, a newer plan and measurements to
  update it. Real seat picking would need per-seat availability in the
  database (today: whole table per evening, bar as a 12-seat pool) and
  decisions on split groups and walk-ins: plan it with the owner first.

## Lessons learned

- **In tests, never compare a page element object with `assert`.** When the
  check fails, Node tries to print the whole browser object and runs out of
  memory (the session's processes get killed). Compare plain values
  (`isVisible`, text) instead.

- **Never use `toISOString()` for a date.** It converts to UTC, which in
  Israel is the previous day for local midnight: every calendar day was
  linked to the day before it. Build 'YYYY-MM-DD' from the date's own numbers,
  and get "today"/"now" with `Intl.DateTimeFormat(..., {timeZone:'Asia/Jerusalem'})`.
  In the database, `current_date`/`current_time` are UTC unless the function
  sets `timezone`.

## Health checks

None yet.
