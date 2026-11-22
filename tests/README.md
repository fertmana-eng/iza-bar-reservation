# Reservation tests

Everything runs in headless Chromium against a fake database
(`fake-supabase.js`), so the real Supabase project is never touched. Every
request to the internet (fonts, the real database library) is blocked.
Playwright with Chromium must already be installed.

## Behaviour tests

```
node --test tests/app.test.js
```

Each test checks its own result (pass / fail). Run them after every change.
The same tests run on GitHub on every pull request ("Tests").

## Database access check (real database)

`tests/db/checks.sql` tests the access rules on the real Supabase database:
the public can book and read the opening hours but can't see or change
bookings; the logged-in manager can read bookings and tables and cancel. It
runs inside one block that rolls everything back, and reports
`DB CHECKS: ALL n PASSED` or the list of failed checks. Run it through the
Supabase connector (execute_sql) or paste it into the SQL Editor. Not run on
GitHub on purpose.

## Screenshot comparison (for styling changes)

```
cd tests && npm install && cd ..
node tests/visual/screenshots.js tests/visual/out/before   # before the change
# ...make the change...
node tests/visual/screenshots.js tests/visual/out/after
node tests/visual/compare.js tests/visual/out/before tests/visual/out/after
```

A styling change is accepted only with zero differences (or differences the
owner asked for). Differing screenshots get a `diff-*.png` showing what changed.
