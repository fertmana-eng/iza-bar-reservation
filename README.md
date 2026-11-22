# הזמנת שולחנות - הוראות הקמה

## שלב 1: Supabase
1. צרו פרויקט חדש ב-supabase.com (חינמי)
2. היכנסו ל-SQL Editor והריצו לפי הסדר: `supabase/migrations/01_schema.sql` → `02_booking_function.sql` → `03_admin_policies.sql` → `04_add_email.sql`
3. ב-Settings → API, העתיקו את ה-Project URL וה-anon public key

## שלב 1.5: אימייל אישור (אופציונלי)
1. הרשמה חינמית ב-resend.com, ויצירת API Key
2. התקנת Supabase CLI (אם אין עדיין): `npm install -g supabase`
3. מתוך תיקיית הפרויקט: `supabase login` ואז `supabase link --project-ref YOUR_PROJECT_REF` (ה-ref מופיע ב-Settings → General)
4. הגדרת המשתנים הסודיים:
   ```
   supabase secrets set RESEND_API_KEY=re_xxxxx BUSINESS_NAME="השם שלכם"
   ```
5. פריסת הפונקציה: `supabase functions deploy send-confirmation` (הקוד נמצא ב-`supabase/functions/send-confirmation/index.ts`)

אם מדלגים על השלב הזה - הכל ימשיך לעבוד רגיל, פשוט לא יישלח מייל (שדה האימייל בטופס הוא לא חובה בכל מקרה, וגם וואטסאפ+יומן ימשיכו לעבוד).

## שלב 2: חיבור הקבצים
בשני הקבצים `index.html` ו-`admin.html`, מלאו בראש הקובץ:
```
const SUPABASE_URL = "...";       // מה-Settings → API
const SUPABASE_ANON_KEY = "...";  // מה-Settings → API
```
וב-`index.html` גם את `BUSINESS_NAME`.

## שלב 3: פרסום
העלו את שני הקבצים ל-Netlify (בדיוק כמו IzaZoo) - גררו את התיקייה למסך ה-Deploy.
- `index.html` = הלינק ששולחים ללקוחות
- `admin.html` = מסך הניהול שלכם, שומרים אותו לעצמכם (לא מקשרים אליו מהעמוד הציבורי)

## מה שכבר מוגדר במערכת
- 7 שולחנות פנימיים + מאגר בר של 12 מקומות (בדיוק כמו שתיארת)
- שיבוץ אוטומטי לשולחן הקטן ביותר שמתאים לגודל הקבוצה
- הבר כמאגר משותף (סה"כ עד 12 סועדים בו-זמנית)
- טווח הגעה 17:00-21:00, סגירת הזמנות אונליין ב-17:00
- מסך ניהול (admin.html) מציג את הרשימה מקובצת לפי אזור, עם כפתור "בטל" לכל הזמנה
- ללקוח: אישור על המסך + שליחה עצמית לוואטסאפ + הוספה ליומן, ומייל אישור אוטומטי אם הגדרתם את שלב 1.5

## דברים שכדאי לבדוק/להתאים
- שינוי מספרי/גדלי השולחנות: טבלת `venue_tables` ב-Supabase (עריכה ישירה מה-Table Editor, בלי צורך בקוד)
- שינוי שעות/שעת סגירה: טבלת `settings`
- **חשוב**: מסך הניהול (admin.html) כרגע פתוח לגמרי בלי התחברות, לנוחות העבודה על המערכת. לפני שיש לקוחות אמיתיים (המסך חושף שמות+טלפונים), יש הוראות להחזרת הגנה בתחתית `supabase/migrations/03_admin_policies.sql`
