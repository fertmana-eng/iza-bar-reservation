-- ===================================================================
-- טבלת הגדרת מקומות (שולחנות + בר)
-- ===================================================================
create table venue_tables (
  id            serial primary key,
  name          text not null,          -- שם פנימי בלבד, לא מוצג ללקוח
  area          text not null,          -- 'high' / 'low' / 'bar'
  kind          text not null default 'table',  -- 'table' (שולחן ייעודי) או 'bar_pool' (מאגר משותף)
  min_guests    int not null,
  max_guests    int not null,
  pool_capacity int,                     -- רק עבור kind='bar_pool': סה"כ מקומות במאגר
  active        boolean not null default true,
  sort_order    int not null default 0
);

insert into venue_tables (name, area, kind, min_guests, max_guests, sort_order) values
  ('שולחן 1', 'high', 'table', 1, 2, 1),
  ('שולחן 2', 'high', 'table', 1, 2, 2),
  ('שולחן 3', 'high', 'table', 2, 5, 3),
  ('שולחן 18', 'high', 'table', 4, 6, 4),
  ('שולחן 4', 'low',  'table', 3, 6, 5),
  ('שולחן 6', 'low',  'table', 3, 5, 6),
  ('שולחן 7', 'low',  'table', 5, 10, 7);

insert into venue_tables (name, area, kind, min_guests, max_guests, pool_capacity, sort_order) values
  ('בר', 'bar', 'bar_pool', 1, 4, 12, 8);

-- ===================================================================
-- טבלת הזמנות
-- ===================================================================
create table reservations (
  id                bigserial primary key,
  reservation_date  date not null,
  arrival_time      time not null,
  customer_name     text not null,
  phone             text not null,
  guests            int not null,
  note              text,
  assigned_table_id int references venue_tables(id),   -- null אם שובץ לבר
  assigned_kind     text not null,                       -- 'table' / 'bar_pool'
  status            text not null default 'confirmed',   -- confirmed / cancelled
  created_at        timestamptz not null default now()
);

create index idx_reservations_date on reservations(reservation_date) where status = 'confirmed';

-- ===================================================================
-- הגדרות כלליות (שעות פעילות, שעת סגירת הזמנות וכו')
-- ===================================================================
create table settings (
  key   text primary key,
  value text not null
);

insert into settings (key, value) values
  ('arrival_start', '17:00'),
  ('arrival_end',   '21:00'),
  ('booking_cutoff','17:00'),   -- אחרי השעה הזו לא ניתן להזמין אונליין לאותו יום
  ('admin_password_hash', '');  -- יוגדר בנפרד

alter table venue_tables enable row level security;
alter table reservations enable row level security;
alter table settings enable row level security;

-- קריאה פומבית לזמינות (בלי לחשוף שמות שולחנות ללקוח - זה מטופל באפליקציה, לא ב-DB)
create policy "public can read active tables" on venue_tables
  for select using (active = true);

create policy "public can read arrival/cutoff settings" on settings
  for select using (key in ('arrival_start','arrival_end','booking_cutoff'));

-- הזמנות עצמן נכתבות/נקראות רק דרך הפונקציה המאובטחת book_reservation ודרך מסך הניהול (service role)
