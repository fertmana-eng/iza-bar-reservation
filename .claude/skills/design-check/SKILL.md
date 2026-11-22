---
name: design-check
description: Visual check for a change that could affect how the reservation pages look (CSS, HTML, layout code). Use before merging such a change, or when the owner types /design-check.
---

# Design check

Work in plain, non-technical language for the owner (see CLAUDE.md).

1. **Screenshots before and after.** One-time setup: `cd tests && npm install`.
   - "Before", on the code without the change (e.g. `git stash`, run, `git stash pop`):
     `node tests/visual/screenshots.js tests/visual/out/before`
   - "After", with the change:
     `node tests/visual/screenshots.js tests/visual/out/after`
   - Compare: `node tests/visual/compare.js tests/visual/out/before tests/visual/out/after`
   The screenshots cover every booking step and the manager page at phone
   size (390x844). If the change shows something new, add it to `STATES` in
   `tests/visual/screenshots.js`. Web fonts are blocked in the screenshots, so
   they don't show the real font; look at the real page for font questions.
2. **Judge the differences.**
   - Not intended → it's a bug; fix it and compare again.
   - Intended → look at the after screenshot yourself and check: Hebrew text
     right-aligned and not clipped, spacing and sizes consistent with the rest
     of the page, colours from the existing palette (CSS variables), nothing
     overlapping, buttons large enough to tap.
3. **Show the owner** the before/after of any intended visual change (send the
   images) and get their OK before merging.
4. Report in a few lines: screenshots compared, differences found, owner's OK.
