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
- `index.html`: the public booking page (the link sent to customers). **One
  screen** (owner, 23 Nov 2026, modelled on the layout of the big Israeli
  booking sites, our own look): three boxes side by side, סועדים · תאריך ·
  שעה, **empty at the start (owner: no default values)**; each opens a panel
  from the bottom (guests 1–10, our calendar up to 30 days ahead, times
  17:00–21:00 every 15 minutes). "מצאו לי מקום" checks `check_availability`;
  if there is room the name / phone / note form opens below on the same
  screen with the late (15 min) / early arrival rules above "שריינו לי
  שולחן"; if not, a message (no suggestions of other dates for now, owner).
  Changing a box closes the form and asks to search again (typed text is
  kept). Then the confirmation with "send to my WhatsApp" and "add to
  calendar". The confirmation screen shows only the booking card picture
  (owner: no double presentation); plain text only if the picture can't be
  drawn. No welcome screen: "ההזמנות שלי" and an indoor-only line (outdoor
  is walk-in only) at the top, a same-day approval note when today is
  picked between 16:00 and 20:00 (`APPROVAL_FROM`, display only; the
  database decides), today greyed out from 20:00, today's times earlier than
  30 minutes ahead greyed out; the search re-checks the clock if the page
  stayed open.
- **Table or bar** (owner, 23 Nov 2026; `15_seating_and_limits.sql`): a
  "שולחן | בר" choice above the three boxes, nothing chosen at the start.
  Bar: groups of 1–4 only; **the number of guests is never changed for
  the customer** (owner): bar with more than 4 shows "בבר אפשר עד 4
  סועדים. הקטינו את מספר הסועדים או בחרו שולחן." and the search waits
  (the guests panel always offers 1–10). Table chosen but none left while the
  bar has room: "אין שולחנות פנויים... אבל יש מקום בבר" with "להזמין בבר"
  (one tap switches and searches again); no "no preference" option (owner).
  The card, texts and personal page say where the booking ended up ("שולחן
  ל-3 סועדים" / "בבר, ל-2 סועדים", `placeText()` in card.js). On the
  personal page a change can also switch table ↔ bar (owner, 23 Nov 2026;
  `16_change_seating.sql`, `change_booking(..., p_seating)`): an "איפה"
  select next to date / time / guests; **the number of guests is never
  changed for the customer** (owner): bar with more than 4 shows "בבר אפשר
  עד 4 סועדים. הקטינו את מספר הסועדים או בחרו שולחן." and saving waits;
  switching to a table when none is left answers
  'bar_available' ("אין שולחן פנוי... אבל יש מקום בבר"). Without a choice
  a change keeps the area. Manager bookings are unaffected.
- **Double bookings** (owner, 23 Nov 2026; same file): one booking per phone
  number per evening (digits compared, +972 read as 0; also when a change
  moves to another evening) → "כבר יש הזמנה על מספר הטלפון הזה לערב
  הזה"; at most 3 bookings an hour from the same connection (only an md5
  fingerprint of the address is stored, `reservations.client_key`; skipped
  if the address can't be read; note: phones on the same mobile network can
  share an address, so a busy evening could in theory hit it) → "נסו שוב
  מאוחר יותר". No WhatsApp invitation for bigger groups (owner: fewer
  WhatsApp contacts); the guests panel says "עד 10 סועדים בהזמנה". SMS
  checks and a tablet alert for suspicious bookings: not done (offer if
  abuse happens).
- **Same-day bookings by the hour they are made** (owner's decision, 22 Nov
  2026; `09_approval_window.sql`): before 16:00 confirmed at once; 16:00–20:00
  the request is `pending` and holds its table until the manager approves
  (`confirmed`) or declines (`declined`, frees the table); from 20:00 closed
  for today. Same-day arrivals at least 30 minutes ahead, rounded up to the
  quarter hour (the database allows 25 for clock differences). Other days are
  confirmed at once. Settings: `booking_cutoff` 20:00 (public), `approval_from`
  16:00 (private, read only by the function). The customer's card says "הבקשה
  התקבלה · ממתינה לאישור" and has no "add to calendar".
- **Customer pages look like the tablet screen** (owner, 22 Nov 2026):
  `index.html` and `booking.html` use the manager page's palette (light
  #f6f4ef background, white rounded boxes, #e4e0d6 lines, dark green
  #2f4a3d buttons, the system font) with the red IZAZOO logo in a light
  header. Heebo is still loaded only because the booking card picture uses
  it. The card picture itself (card.js) keeps the old black/cream look.
- **IZAZOO logo** (owner, 22 Nov 2026): replaces "עיזה בר" in the header of
  `index.html` and `booking.html`, and sits at the start of the tablet's top
  bar and above its login (red, `assets/izazoo-logo-red.png`; a white copy
  `assets/izazoo-logo-white.png` exists for dark backgrounds). Both were cut
  from the IzaZoo app icon (`icon-512.png` in the IzaZoo repo, white IZAZOO
  on #D12026) with a see-through background. Still "עיזה בר": the WhatsApp
  booking card picture (card.js) and the message texts (not asked).
- `booking.html#<secret>`: the customer's own booking (see Next steps).
  `sw.js`: the notification helper it registers (step 4).
  `card.js` draws the booking card for both customer pages.
- `admin.html`: the manager's evening screen (owner's design request, 22 Nov
  2026; tablet in landscape, kept with the restaurant's WhatsApp): login,
  then a top bar (‹ date › arrows, weekday and date, "+ הזמנה חדשה",
  "יציאה"), the evening's totals, and side by side: the **floor plan** (the
  owner's approved picture of the main hall, `assets/iza_main_hall_v2.webp`:
  a pixel-identical lossless WebP of the handoff's `iza_main_hall_v2.png`
  (2.8 MB → 1.8 MB, owner's choice), shown unchanged, square, never
  stretched or cut; coloured table markers on top in the picture's own
  1254-pixel coordinates, owner's choice to keep them although the handoff
  said "no overlay yet"; tables coloured free / booked / waiting / arrived /
  late; the bar shows used/12 seats in a pill below it) and the **sheet** modelled
  on the bar's paper sheet (שולחן | שם | שעה | סועדים | הערות; one row per
  table 1, 2, 3, 4, 6, 7, 18, then one row per bar booking, then "+ הוספה
  לבר"), with "ממתינות לאישור" (אישור / דחייה → WhatsApp) above it and
  "בוטלו ע״י הלקוח" below. Tapping a table (plan or sheet) opens a side
  panel: booked → הגיעו ✓, move to another table (then tap the new table;
  taken tables refused, a different-size table allowed with a warning),
  WhatsApp to the customer, cancel; waiting → approve / decline; free →
  add a booking there. Manager bookings (phone / WhatsApp / walk-in) are
  confirmed at once, any time 12:00-23:45, 1-20 guests, name and phone
  optional. Database: `13_manager_floor.sql` (applied via the connector:
  `arrived_at`, `set_arrived`, `move_booking`, `manager_add_booking`,
  manager only). **Which number is which table on the plan is Claude's
  guess** (`PLAN_TABLES` in admin.html: 3, 1, 2 on the left wall; 18, 4 on
  the right wall; 6 the window counter; 7 the lounge): the owner corrects it.
  Not mapped: the small wooden table with stools at the bar's lower-left
  corner in the picture (ask the owner whether it is a table of its own).
  **Owner, 22 Nov 2026: neither the picture nor the table numbers are final;
  the owner is building the infrastructure first so the real plan and
  seating can be dropped in quickly.** Keep the plan easy to swap (picture
  file + one list of table positions).
  The handoff (ChatGPT, Nov 2026) planned a later data-driven overlay with
  normalized 0-1 coordinates stored in the data model; today positions are
  constants in admin.html.
  Refreshes quietly every minute (not while a panel is open or a move is
  being chosen). **Late guests** (owner, 22 Nov 2026): tonight's confirmed
  booking not marked "הגיעו" turns orange after its time ("מאחרים N דק׳" on
  the sheet, +N′ on the plan) and red at 15 minutes (the bar's rule; the
  panel says the table may be released); the top shows "N מאחרים". Works
  only if staff tap "הגיעו ✓" when guests sit down.
- **Automatic reminder** (owner, 22 Nov 2026; `14_booking_reminders.sql`,
  applied via the connector): the personal page also offers "🔔 קבלו תזכורת
  שעתיים לפני" on confirmed bookings. Every 10 minutes the database's
  scheduler (pg_cron job `booking-reminders`, via pg_net) calls the edge
  function `send-reminders` (deployed, `verify_jwt` off; refuses calls
  without the database-generated secret `app_secrets` 'cron_secret', value
  never in the repo), which sends one notification to tonight's confirmed
  bookings arriving in 30 min - 2 h, booked at least 3 hours ahead, not yet
  arrived, with notifications on (`due_reminders()`, server only), and marks
  `reminder_sent_at`. Tested: call with the secret answers, without it is
  refused (401); the due list picks the right bookings.
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
  2026). **Netlify** (project `remarkable-twilight-87b52c`) deleted
  by Claude with the owner's OK through Netlify's API (23 Nov 2026; it was
  emailing the owner about every change), and the owner's other old Netlify
  project `zippy-sprite-5d7768` too (owner's OK); the Netlify account is now
  empty. The Netlify GitHub app may still be installed on the owner's GitHub
  account (harmless now).
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

1. `09_approval_window.sql` run by the owner (22 Nov 2026);
   `tests/db/checks.sql`: ALL 25 PASSED. The owner will test a request
   between 16:00 and 20:00 and approve/decline it on the manager page later.
2. **Personal booking link** (plan approved: `docs/plan-booking-link.md`).
   Step 1 built: `booking.html#<secret>` shows the card, live status
   (checks every 30 s), comment editing until 1 hour before arrival, cancel
   any time (marked `cancelled_by='customer'`), WhatsApp to the bar
   (058-7460202, corrected 22 Nov 2026: an earlier number was the owner's own; the bar can't be reached by phone). "ניהול ההזמנה" button on
   the confirmation screen. Database: `10_booking_link.sql` part A applied
   via the connector; part B (`10b_book_reservation_token.sql`, returns the
   secret) run by the owner 22 Nov 2026; database check ALL 32 PASSED.
   Step 3 done early (the owner lost the link after closing the page): the
   link is the caption of the shared card picture (Android's WhatsApp keeps
   it; some iPhones drop it), it's in the text-message fallback and in the
   manager's approval message, and the phone remembers its upcoming bookings
   (`izabar_my_bookings` in local storage; shown as "ההזמנות שלי" at the
   top of the booking page; opening a link adds it, cancelling removes it).
   On the owner's phone WhatsApp dropped the caption, so the picture arrived
   without the link: fixed with a second button "שליחת הקישור להזמנה
   לוואטסאפ" (plain wa.me text, which always keeps the link; shown only where
   the picture is shared) and "שליחת הקישור לוואטסאפ שלי" on the personal
   page (owner to test).
   Step 2 built (22 Nov 2026, `11_booking_changes.sql`): the personal page
   changes date / time / guests until 1 hour before arrival (same rules as
   new bookings; a same-day change made 16:00-20:00 waits for approval).
   While a change waits, the confirmed original is kept in `prev` and its
   table stays held (`table_taken` / `bar_used` / `find_place` helpers, not
   callable by the public); the manager answers with `decide_request`
   (logged in only): approve confirms, decline restores the original. The
   manager page shows "שינוי מבוקש: ... ← ...", a "שונתה ע״י הלקוח" tag and a
   "בוטלו ע״י הלקוח" list. Part A applied via the connector; part B
   (`11b_booking_changes_replace.sql`: book_reservation / check_availability
   / available_spots use the helpers; get_booking returns the original's
   details) run by the owner 22 Nov 2026. Dry run at 17:31 Israel time passed
   (request, change, decline restores, approve frees the original, locked,
   invalid, public can't approve).
   Step 4 built (22 Nov 2026, `12_push_notifications.sql`, applied via the
   connector): while a request or change waits, the personal page offers
   "🔔 קבלו התראה כשנאשר" (Android; on iPhone only from the home screen, so
   iPhones get a hint instead). The phone registers `sw.js` and its address
   is saved with `save_push_subscription` (secret link only) in the locked
   table `push_subscriptions`. After אישור / דחייה the manager page calls the
   edge function `notify-booking` (deployed; refuses anyone but the logged-in
   manager), which sends the notification with the keys in the locked table
   `app_secrets` (key values are only in the database, never in the repo;
   the public half is in booking.html). A real phone notification can't be
   tested from Claude's machine: the owner checks it on Android.
   Database check after 11b: ALL 50 PASSED. **The owner tests steps 1-4
   together next** (test plan given in the conversation: book for tomorrow,
   send the link, change, cancel; between 16:00 and 20:00 on Android: book
   for today, turn on the notification, approve on the tablet, change and
   decline). Step 2 of accounts (optional sign-in, history)
   later. Reminders: customer sign-in would change the database's "logged in
   = manager" rule (must become an explicit manager role); SMS sign-in costs
   money per message; Apple sign-in needs a paid developer account; iPhone
   web notifications only work from the home screen.
3. The manager page runs on a tablet with the restaurant's WhatsApp (owner,
   Nov 2026), so approval messages go out from the restaurant's number.

## Legal compliance (on hold until the product is finished)

Researched 23 Nov 2026 (summaries from law-firm and vendor guides, not legal
advice; sources disagree on some numbers). **Owner's decision: on hold until
the product is finished; do it before opening to the public. Once the site is
open to the public, every change must keep it compliant** (the /qa checklist
has a legal step for that; if a change would break compliance, stop and tell
the owner before merging). Before opening, in this order:

1. **Privacy notice** (Privacy Protection Law, Amendment 13, in force Aug
   2025): a page plus one line under the booking form saying who collects,
   for what, that the details are needed to book, and how to see / correct /
   delete them. Database registration very likely not needed (now mainly for
   public bodies and data brokers). The regulator's first fines included a
   small leisure business with an incomplete online privacy notice.
2. **Terms of use** page linked from the form (a booking holds the place for
   the evening, the 15-minute rule, the bar may cancel or move a booking,
   bar = up to 4, no-shows, the site may be unavailable, Israeli law).
3. **Accessibility** (Equal Rights for Persons with Disabilities regulations,
   standard IS 5568 = WCAG AA): the bar is almost certainly above the
   ~₪100,000 turnover exemption, so assume it applies. Check both customer
   pages (panels, calendar, contrast, the card is a picture), fix, and
   publish an accessibility statement with a named contact. Lawsuits without
   proof of damage are common in Israel.
4. **Keep data only as long as needed:** delete name / phone some time after
   the visit (owner to choose 30 / 90 / 365 days; database change).
5. **Remove outside services that see visitors** (Google Fonts for Heebo,
   jsDelivr for supabase-js): host our own copies.
6. **Written security procedure** for the database (Data Security
   Regulations 2017, basic level): one page.
7. **Lawyer review** of the privacy notice, terms and accessibility
   statement (owner).

Facts for the documents: personal data = name, phone, optional note, an md5
fingerprint of the connection address, notification addresses (only if the
customer turns them on), the phone's own list of bookings (on the phone);
no cookies, trackers or payments; database in Supabase's Frankfurt region
(EU, allowed by the transfer regulations); free plan has no automatic
backups. Messages: reminders / approve-decline are booking service messages
the customer asked for; **never use the collected numbers for marketing
without separate, explicit consent** (spam law, section 30A). Still needed
from the owner: the operator's legal name, number and contact details for
the documents, and how long to keep bookings.

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

- **Behaviour tests:** `node --test tests/app.test.js` (83 tests). Run after
  every change; add a test for every bug fixed.
- **Styling changes:** `tests/visual/screenshots.js` before and after, then
  `tests/visual/compare.js` (`cd tests && npm install` first). Accept only zero
  differences, or differences the owner asked for.
- **Real-database check:** `tests/db/checks.sql` (rolled back; reports
  `DB CHECKS: ALL n PASSED`; 68 after 16_change_seating.sql, 23 Nov 2026), run by the security check through the connector.
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
- Nov 2026: same-day approval window (16:00–20:00) with approve/decline on
  the manager page (see "The project").
- Nov 2026: limits inside the database (08) and matching checks on the page;
  email option removed (owner's decision).
- Nov 2026: WhatsApp confirmation as a picture (owner's choice over PDF): a
  1080×1350 booking card drawn on the phone (bar name, name, weekday and
  date, time, guests, the 15-minute rule, booking number). "שליחה לוואטסאפ
  שלי" opens the phone's share sheet with the picture (the customer picks
  WhatsApp; a page can't attach files to a WhatsApp link or send from the
  bar's number, which needs the paid WhatsApp Business API). Where files
  can't be shared (most computers) it sends the text message as before.
- Nov 2026 (experiment, not part of this site): a 3D model of the bar from an
  old architect's plan, with tappable seats, as a private claude.ai artifact
  ("עיזה בר – בחירת מקומות", https://claude.ai/artifact/XodKCTKkfWuZLcSuZokYxM;
  source kept outside the repo). The owner is considering letting customers
  pick seats and may send a video tour, a newer plan and measurements to
  update it. Real seat picking would need per-seat availability in the
  database (today: whole table per evening, bar as a 12-seat pool) and
  decisions on split groups and walk-ins: plan it with the owner first.

## Lessons learned

- **In `tests/db/checks.sql`, make a change and read it back in separate
  steps.** Within one SQL statement, a read function (get_booking) sees the
  data as it was when the statement started, so `change(...) <> 'x' or
  read() <> 'y'` reads the old value and fails although the change worked.
- **In `tests/db/checks.sql`, don't name a table alias `r`**: the block
  already has a loop variable `r`, and PL/pgSQL mixes them up ("record r has
  no field ...").
- **A trial run that drops or replaces database functions also triggers the
  connector's confirmation prompt** (which never reaches the owner), even
  inside a rolled-back block. For such changes: the owner pastes the real
  change, then Claude runs `tests/db/checks.sql` (insert/select only, no
  prompt) right after; or the owner pastes the trial run.
- **In tests, wait for the result, not a fixed pause.** GitHub's machine is
  slower than this one: a test that checked for a WhatsApp window after
  0.4 s failed there once. Use `waitForEvent` / `waitForFunction`.
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
