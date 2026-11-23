# עיזה בר – design rules

One set of rules for all three pages (booking page, personal booking page,
manager tablet). Owner's request, 23 Nov 2026: "more coherent – fonts, sizes,
bolding, text colours, boxes". The rules come from what the pages already
use most; the odd ones out are brought into line. **Status: approved by the owner
(23 Nov 2026); applied to the booking page; personal page and manager page
next** (booking page → personal page →
manager page), each checked live by the owner.

Every value lives in one shared file, `assets/theme.css`, as
named settings (CSS variables). Pages use the names, never raw numbers or
colour codes, so a change in one place changes everything.

## Header

IZAZOO logo (24 px high) + "//" + **עיזה בר** (extra bold), both in the
muted grey (#6b6862, the colour of "ההזמנות שלי"). **Their letters are exactly
as tall as the logo's** (20 px of ink) and centred with it: that takes a 36 px
font for the words and 26 px for "//", because a font size includes empty
room above and below the letters (measured on the page, 23 Nov 2026). Same on
every page, the tablet included.

## Font (decided, applied 23 Nov 2026)

**Heebo** everywhere (owner's choice after a side-by-side preview with
Assistant and Rubik), so the app looks the same on every phone; the booking
card picture uses it too. Stored on our own site (`assets/fonts/`, Hebrew and
Latin parts, every weight in one file, licence `OFL-Heebo.txt`), not loaded
from Google. Fallback while it loads on the first visit: Arial.

## Text sizes (6, instead of 13 today)

| Name | Size | Used for |
| --- | --- | --- |
| small | 12 px | hints, small print under fields, legend on the plan |
| label | 14 px | field labels, notes, table text on the tablet |
| body | 16 px | normal text, inputs, buttons |
| section | 18 px | section titles, panel titles, "יש מקום!" |
| title | 22 px | the page's main title ("הזמנת שולחן"), card headings |
| big | 28 px | big numbers (the time on the tablet, totals) |

Inputs stay at least 16 px (smaller makes iPhones zoom in).

## Boldness (3 levels, instead of 6)

- **regular (400)**: running text.
- **semi-bold (600)**: labels, buttons, values the eye should catch.
- **extra-bold (800)**: titles and the business name.

## Text colours

| Name | Colour | Used for |
| --- | --- | --- |
| ink | #1f1e1c | all main text |
| muted | #6b6862 | secondary text, labels, hints |
| faint | #b3ab9c | placeholders, disabled |
| accent | #2f4a3d | buttons, selected items, links, "יש מקום!" |
| danger | #7a2e2e | errors, cancel |

## Status colours (same meaning on every page)

| Status | Text | Background | Border |
| --- | --- | --- | --- |
| waiting for approval | #8a5a00 | #fffaf0 | #e2c27a |
| confirmed / arrived | #1d6b3a | #dcefe2 | #b9dcc4 |
| error / cancelled | #7a2e2e | #fdf0ef | #e9c4c1 |
| late (tablet only) | orange #f2994a, red #d64541 after 15 min | | |

WhatsApp buttons keep WhatsApp's green (#2fae60), only for WhatsApp.

## Backgrounds and lines

- page background **paper** #f6f4ef; boxes **card** white; lines **line** #e4e0d6.
- one name for each (today the tablet calls them `--bg` / `--border`, the
  customer pages `--paper` / `--line`).

## Boxes and corners (3 roundnesses, instead of 7)

- **10 px**: buttons, inputs, small choices (time / guests buttons).
- **14 px**: boxes (the main card, info boxes, panels on the tablet).
- **round (pill)**: status tags ("אושרה", "ממתינה").
- Bottom panels: 18 px on the top corners only.
- Box = white, 1 px line border, no shadow (only the booking card picture
  has a shadow).
- Info box (rules, "ההזמנות שלי") = paper background, line border, 14 px.

## Buttons (4 kinds, all 46 px high, 16 px semi-bold)

1. **Main**: green fill, white text. One per screen.
2. **Secondary**: white, line border, dark text.
3. **Danger**: white, red border and text ("ביטול ההזמנה").
4. **WhatsApp**: WhatsApp green, white text.

Disabled: same button, faded (45%).

## Spacing

Steps of 4: 4, 8, 12, 16, 24 px. Boxes have 16–22 px inside; between
sections 24 px; between a label and its field 6 px.

## Language and tone

Hebrew, plural address ("בחרו", "נעדכן אתכם"), short sentences, no
exclamation marks except on good news ("יש מקום!"). Times as 19:00, dates as
25.11.
