---
name: health-check
description: Mini-review of the whole reservation project, so problems are caught while small. Run only when the owner types /health-check or agrees to it. Never schedule it; suggest it after a batch of changes, about a month after the last one, or before a big new feature.
---

# Health check

Work in plain, non-technical language for the owner (see CLAUDE.md). This only
reports; fix things afterwards as normal changes (one pull request each, with
/qa).

1. **Tests:** `node --test tests/app.test.js` must pass, and the latest "Tests"
   run on `main` on GitHub must be green.
2. **Test coverage:** list the changes merged since the last health check
   (`git log` since the date recorded in CLAUDE.md). Each fix or new behaviour
   should have a test; list any that don't.
3. **Security:** run the security check (`.claude/skills/security-check/SKILL.md`).
4. **Size and shape:** note the sizes of `index.html` and `admin.html` and
   compare with the last health check in CLAUDE.md.
5. **Out of step:** the database matches
   `supabase/`; `CLAUDE.md` describes the project as it is now.
6. **Report** to the owner in a short list: healthy / needs attention, with a
   proposed fix for each item, smallest first. Then record the date and sizes
   under "Health checks" in CLAUDE.md.
