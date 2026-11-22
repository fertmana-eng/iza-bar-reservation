// Edge function notify-booking: sends an Android (web push) notification to the
// customer's phone after the manager approves or declines a request or a change.
// Called by the manager page (admin.html) with the manager's login; anyone else is refused.
// The notification keys are read from the locked table app_secrets with the service role.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SITE = "https://fertmana-eng.github.io/iza-bar-reservation/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  // only the logged-in manager may send notifications
  const asCaller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await asCaller.auth.getUser();
  if (!user) return json({ error: "not allowed" }, 401);

  let id: number, result: string;
  try { ({ id, result } = await req.json()); } catch { return json({ error: "bad request" }, 400); }
  if (!Number.isInteger(id) || !["confirmed", "reverted", "declined"].includes(result)) return json({ error: "bad request" }, 400);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: b } = await admin.from("reservations")
    .select("id,status,reservation_date,arrival_time,guests,access_token").eq("id", id).maybeSingle();
  if (!b) return json({ error: "not found" }, 404);
  const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("reservation_id", id);
  if (!subs || !subs.length) return json({ sent: 0 });

  const { data: keys } = await admin.from("app_secrets").select("key,value").in("key", ["vapid_public", "vapid_private"]);
  const k = Object.fromEntries((keys ?? []).map((r) => [r.key, r.value]));
  if (!k.vapid_public || !k.vapid_private) return json({ error: "keys missing" }, 500);
  webpush.setVapidDetails(SITE, k.vapid_public, k.vapid_private);

  const [, m, d] = String(b.reservation_date).split("-").map(Number);
  const when = `${d}.${m} בשעה ${String(b.arrival_time).slice(0, 5)}, שולחן ל-${b.guests}`;
  const message = result === "confirmed"
    ? { title: "ההזמנה שלך לעיזה בר אושרה ✳", body: when }
    : result === "reverted"
    ? { title: "השינוי לא אושר", body: `ההזמנה המקורית שלך בתוקף: ${when}` }
    : { title: "הבקשה לעיזה בר לא אושרה", body: "מצטערים, לא נוכל לארח אתכם הפעם. אפשר לכתוב לנו בוואטסאפ." };
  const payload = JSON.stringify({ ...message, url: `${SITE}booking.html#${b.access_token}` });

  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id); // the phone unsubscribed
    }
  }
  return json({ sent });
});
