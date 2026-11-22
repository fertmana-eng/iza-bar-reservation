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
