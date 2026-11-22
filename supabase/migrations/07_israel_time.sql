-- ===================================================================
-- The database runs in UTC, so book_reservation's same-day cutoff
-- ("today" and "now" vs. booking_cutoff 17:00) was 2–3 hours late.
-- Run the function in Israel time (applied 22 Nov 2026 via the connector).
-- available_spots and check_availability don't use the clock.
-- ===================================================================
alter function public.book_reservation(date, time without time zone, text, text, integer, text, text)
  set timezone to 'Asia/Jerusalem';
