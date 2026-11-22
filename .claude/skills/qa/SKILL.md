---
name: qa
description: Quality check for a change to the table reservation pages. Use after any change to index.html, admin.html or the Supabase code, before merging, or when the owner types /qa.
---

# QA check

Work in plain, non-technical language for the owner (see CLAUDE.md).

1. **Run the behaviour tests:** `node --test tests/app.test.js`. All must pass.
   If one fails, find the cause and fix it; never weaken or skip a test.
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
5. **Wait for the automatic GitHub check** ("Tests" workflow) on the pull
   request to be green before merging. If it is red, read its log and fix it.
6. **Tell the owner what to check on the phone:** a short numbered list of
   concrete steps on the booking page and/or the manager page.
7. Report in a few lines: what was tested, the result, anything not covered.
