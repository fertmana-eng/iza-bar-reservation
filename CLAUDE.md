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
  optional note and email → confirmation with "send to my WhatsApp" and "add
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
- Optional confirmation email: edge function `send-confirmation` using Resend.
- Backend: its own Supabase project, separate from IzaZoo: "IZA Bar
  reservation", id `brpovhypzsgwsnuenpfj` (free plan; it pauses after
  inactivity; restored 22 Nov 2026 with the owner's OK; database time zone
  is UTC; 2 test bookings, no login users yet). Only the publishable key is in the
  pages. The supabase-js library is loaded from a CDN (jsdelivr, unpinned
  version `@2`); IzaZoo uses a bundled copy instead.
- Hosting (owner's decision, Nov 2026): **exactly like IzaZoo: GitHub Pages
  from `main` plus Supabase.** The repository is being made public for that
  (free Pages needs a public repository; it holds no secrets or customer data,
  only the publishable key that is in the page anyway). Address:
  https://fertmana-eng.github.io/iza-bar-reservation/ (manager page:
  `admin.html`). Until then it is also published by **Netlify** (site
  `remarkable-twilight-87b52c`) and **Cloudflare** ("Workers Builds:
  iza-bar-reservation"); once the GitHub address works, the owner switches
  both off. Cloudflare's check fails on pull-request branches but succeeds on
  `main` (harmless; goes away when Cloudflare is disconnected).
- Database changes and the edge function are kept in `supabase/`. The four
  original SQL files (`supabase/migrations/01_…04_`) were run by hand in the
  SQL Editor; they may not match the real database exactly (see below).

## Known problems (found Nov 2026, not fixed yet)

1. ~~Customer details open to anyone~~: fixed 22 Nov 2026 (manager login +
   `06_manager_login.sql`, run by the owner; user `izabar` created; public
   sign-up switched off by the owner). `tests/db/checks.sql`: ALL 17 PASSED.
2. ~~`check_availability` missing~~: it exists in the real database (created
   by hand in Sept); now saved as `supabase/migrations/05_check_availability.sql`.
3. **Time zone.** The database's `current_date`/`current_time` are UTC, so the
   17:00 same-day cutoff really applies at about 19:00–20:00 Israel time. The
   pages use `toISOString()` for "today", which is UTC too (wrong date between
   midnight and 02:00/03:00 Israel time). IzaZoo had the same bug.
4. **Customer text is inserted as HTML** (name, note) on the manager page and
   in the email: a customer could inject code. Escape it.
5. **`send-confirmation` can be called by anyone** with any address and text,
   so it could be used to send emails through the owner's Resend account.
   Better: send the email from the database side after a real booking, or have
   the function look up the booking itself.
6. The functions (`book_reservation`, `available_spots`, `check_availability`)
   have no `search_path` set and don't limit text length or guest count.
   (Only the 7-parameter `book_reservation` exists in the real database.)
7. The `admin_password_hash` setting is unused (left over).

## Next steps (in order)

1. Owner checks the login and a test booking on the phone.
2. Fix 3–6, one change each. Real-database facts (Nov 2026): anon and
   authenticated have every table permission on all three tables (Supabase's
   default), so the policies are the only protection.
3. Once GitHub Pages works, the owner disconnects Netlify and Cloudflare.
4. Then new features with the owner (use a short planning interview first).

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

- **Behaviour tests:** `node --test tests/app.test.js` (17 tests). Run after
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

## Health checks

None yet.
