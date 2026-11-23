---
name: design-check
description: Visual check for a change that could affect how the reservation pages look (CSS, HTML, layout code). Use before merging such a change, or when the owner types /design-check.
---

# Design check

Work in plain, non-technical language for the owner (see CLAUDE.md).

**Owner, 23 Nov 2026: no screenshots for the owner.** They check every
change live in the installed apps, so don't send images and don't wait for
their OK before merging a change they asked for; merge, then tell them what to
look at. Screenshots are only Claude's own tool, used sparingly:

1. **A change the owner asked for** (new look, size, colour, wording): no
   before/after set. If the layout could break (overlap, clipping, text
   wrapping on a narrow phone), take one quick screenshot of that part for
   yourself and check it; otherwise skip it.
2. **A change that should NOT change the look** (clean-up, refactor, code
   moved around): compare before and after, accept only zero differences.
   One-time setup: `cd tests && npm install`.
   - "Before", on the code without the change (e.g. `git stash`, run, `git stash pop`):
     `node tests/visual/screenshots.js tests/visual/out/before`
   - "After", with the change:
     `node tests/visual/screenshots.js tests/visual/out/after`
   - Compare: `node tests/visual/compare.js tests/visual/out/before tests/visual/out/after`
   `ONLY=<regex>` limits the run to the states involved. Web fonts are blocked
   in the screenshots, so look at the real page for font questions.
3. **What to check when you look:** Hebrew text right-aligned and not
   clipped, spacing and sizes consistent with the rest of the page, colours
   from the existing palette, nothing overlapping, buttons large enough to tap.
4. Report in one or two lines (no images).
