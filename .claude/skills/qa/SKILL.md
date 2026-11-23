---
name: qa
description: Quality check for a change to the table reservation pages. Use after any change to index.html, admin.html or the Supabase code, before merging, or when the owner types /qa.
---

# QA check

Work in plain, non-technical language for the owner (see CLAUDE.md).

1. **Run the behaviour tests** (owner, 23 Nov 2026, to save time and tokens):
   - **Small text, colour or size changes:** run only the related tests,
     e.g. `node --test --test-name-pattern="logo|header" tests/app.test.js`
     (pick words from the test names of the part you changed). GitHub's
     automatic full run (step 6) is the safety net before anything goes live.
   - **Everything else** (logic, booking rules, the database, the manager
     page's actions): run all of them, `node --test tests/app.test.js`.
   Either way all must pass; if one fails, find the cause and fix it; never
   weaken or skip a test. Read only the summary lines (pass / fail counts and
   the names of failing tests), not the whole output.
2. **Cover the change with a test.** If the change fixes a bug or adds
   behaviour, add a test to `tests/app.test.js` that fails without the change
   and passes with it (check both: temporarily undo the change, run the test,
   restore). Use `tests/helpers.js` and the fake database
   `tests/fake-supabase.js` (extend the fake when the pages use something new).
3. **If anything visual could have changed,** run the design check
   (`.claude/skills/design-check/SKILL.md`) as well.
4. **If the change touches data, customer details, logins, permissions or the
   Supabase code,** run the security check
   (`.claude/skills/security-check/SKILL.md`) as well.
5. **Legal compliance (once the site is open to the public; see "Legal
   compliance" in CLAUDE.md):** check the change against that list:
   accessibility (IS 5568 / WCAG AA: keyboard, screen-reader labels,
   contrast, text size, the accessibility statement still true), privacy
   (any new personal detail collected or stored → privacy notice updated,
   kept only as long as needed, no new outside service receiving customer
   data without the owner's OK), terms of use still matching how booking
   works, and messages (booking-related service messages only; never
   marketing to collected numbers without separate consent). If the change
   would break any of these, stop and tell the owner before merging.
6. **Wait for the automatic GitHub check** ("Tests" workflow) on the pull
   request to be green before merging. If it is red, read its log and fix it.
7. **Tell the owner what to check on the phone:** a short numbered list of
   concrete steps on the booking page and/or the manager page.
8. Report in a few lines: what was tested, the result, anything not covered.
