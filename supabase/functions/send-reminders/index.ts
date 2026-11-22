// Edge function send-reminders: called every 10 minutes by the database's scheduler
// (14_booking_reminders.sql). Sends one phone notification about 2 hours before each
// of tonight's confirmed bookings whose customer turned notifications on.
// Refuses any caller without the scheduler's secret (kept in the locked table app_secrets).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SITE = "https://fertmana-eng.github.io/iza-bar-reservation/";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: keys } = await admin.from("app_secrets").select("key,value").in("key", ["cron_secret", "vapid_public", "vapid_private"]);
  const k = Object.fromEntries((keys ?? []).map((r) => [r.key, r.value]));
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!k.cron_secret || given.length !== k.cron_secret.length || given !== k.cron_secret) return json({ error: "not allowed" }, 401);
  if (!k.vapid_public || !k.vapid_private) return json({ error: "keys missing" }, 500);
  webpush.setVapidDetails(SITE, k.vapid_public, k.vapid_private);

  const { data: due, error } = await admin.rpc("due_reminders");
  if (error) return json({ error: error.message }, 500);
  let sent = 0;
  for (const b of due ?? []) {
    // mark first, so a slow run and the next one never remind twice
    const { data: marked } = await admin.from("reservations").update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", b.id).is("reminder_sent_at", null).select("id");
    if (!marked || !marked.length) continue;
    const payload = JSON.stringify({
      title: "תזכורת: מחכים לכם היום בעיזה בר ✳",
      body: `בשעה ${String(b.arrival_time).slice(0, 5)}, שולחן ל-${b.guests}. נחכה עד 15 דקות משעת ההזמנה.`,
      url: `${SITE}booking.html#${b.access_token}`,
    });
    const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("reservation_id", b.id);
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }
  return json({ due: (due ?? []).length, sent });
});
