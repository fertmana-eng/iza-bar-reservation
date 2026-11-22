# Plan: personal booking link (step 1 of customer accounts)

Status: **approved by the owner** (planning interview, 22 Nov 2026). Steps 1 and 3 built (Nov 2026); step 2 and 4 next. Added during testing: the phone remembers its bookings ("ההזמנות שלי" on the welcome screen), because a customer who closes the page otherwise loses the link.
Step 2 (optional customer accounts with history, e.g. Google sign-in) comes later
and reuses all of this.

## What the customer gets

Every booking gets a **private link** (long and unguessable, like a shared photo
album link). It appears:
- as a "ניהול ההזמנה" button on the confirmation screen,
- in the WhatsApp text the customer sends themselves (next to the card picture),
- in the manager's approval WhatsApp message.

Opening the link shows the booking card and its **status**, updating by itself:
ממתינה לאישור / אושרה / נדחתה / בוטלה.

From the link the customer can, **until 1 hour before the arrival time**:
- change the **arrival time**, **number of guests**, **date** and **comment**,
and **cancel at any time** (owner's answer; frees the table).

After the change deadline the link shows the booking and a WhatsApp button to
the bar (054-5904470): the bar can't be reached by phone, only by WhatsApp,
Facebook or Instagram messages (owner).

**Approval for changes: same rules as new bookings.** A same-day change made
between 16:00 and 20:00 waits for approval; other changes are confirmed at once
if a table fits. If no table fits, the change is refused and the booking stays
as it was. While a change waits, the new table is held; if the manager declines
the change, the booking goes back to what it was (still confirmed).

"Add to calendar" appears on the link once the booking is approved.

**Android notification** (optional, the customer taps "קבלו התראה"): a phone
notification when a request or change is approved or declined. On iPhone this
only works if the site is added to the home screen; WhatsApp stays the main
channel there.

## What the manager sees (tablet with the restaurant's WhatsApp)

- Requested changes appear under "ממתינות לאישור" with what changed
  (e.g. "שינוי: 19:00 → 20:30, 2 → 4 סועדים"). אישור / דחייה as today.
- Bookings the customer cancelled are marked "בוטלה ע״י הלקוח" for that day.
- The approval WhatsApp message includes the customer's link.

## How it's kept safe

- Customers never get access to the bookings table. Everything goes through
  database functions that take the link's secret and act only on that one
  booking; the secret is never shown on the manager page or in lists.
- The secret sits after `#` in the link, so it isn't sent to the web host.
- Every function checks the same limits as booking (hours, guests, deadline).
- Saved database check extended for every new action (the public can't read
  other bookings; a wrong secret does nothing).

## Building order (one tested change each, owner checks on the phone)

1. Database: the secret per booking + read / cancel / change-comment functions;
   a status page `booking.html` with the card, live status and cancel.
2. Changing time, guests and date (re-checks tables, approval rules, revert on
   decline) + the manager page showing changes and customer cancellations.
3. Links on the confirmation screen and in both WhatsApp messages.
4. Android notifications (a small server function sends them; its key is
   stored in Supabase, never in the code).

## Answers from the owner

- Contact: WhatsApp 054-5904470 (no phone calls; Facebook/Instagram messages
  also work: add those links if the owner sends the addresses).
- Cancel: allowed at any time.
