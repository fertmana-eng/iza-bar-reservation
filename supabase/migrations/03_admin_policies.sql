-- ===================================================================
-- מצב פיתוח: גישה פתוחה למסך הניהול בלי התחברות
-- נוח לעבודה עכשיו, אבל חושף את רשימת הלקוחות (כולל טלפונים) לכל מי
-- שיש לו את קישור admin.html + ה-anon key - חובה להחליף בחזרה
-- למדיניות "authenticated" (בהערה למטה) לפני שעולים לאוויר עם לקוחות אמיתיים
-- ===================================================================
create policy "dev: anyone can read reservations" on reservations
  for select using (true);

create policy "dev: anyone can read venue_tables" on venue_tables
  for select using (true);

create policy "dev: anyone can update reservations" on reservations
  for update using (true);

-- כשמוכנים לעבור לגרסה מוגנת בהתחברות: מחקו את שלוש המדיניות למעלה
-- (Authentication > Policies בממשק Supabase) והריצו במקומן:
--
-- create policy "authenticated can read reservations" on reservations
--   for select using (auth.role() = 'authenticated');
-- create policy "authenticated can read all venue_tables" on venue_tables
--   for select using (auth.role() = 'authenticated');
-- create policy "authenticated can update reservations" on reservations
--   for update using (auth.role() = 'authenticated');
--
-- ואז להחזיר את מסך ההתחברות ב-admin.html (יש גרסה קודמת בהיסטוריית הצ'אט)
