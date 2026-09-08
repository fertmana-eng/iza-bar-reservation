// Edge Function: send-confirmation
// שולח מייל אישור הזמנה דרך Resend (יש חבילה חינמית, בלי כרטיס אשראי)
// פריסה: supabase functions deploy send-confirmation
// לפני הפריסה: supabase secrets set RESEND_API_KEY=re_xxxxx BUSINESS_NAME="השם שלכם" FROM_EMAIL="reservations@yourdomain.com"

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const BUSINESS_NAME = Deno.env.get("BUSINESS_NAME") || "המסעדה";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "onboarding@resend.dev";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { email, name, date, time, guests } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    const dateDisplay = new Date(date).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>ההזמנה שלך אושרה</h2>
        <p>שלום ${name},</p>
        <p>ההזמנה שלך ל-${BUSINESS_NAME} אושרה:</p>
        <ul>
          <li>תאריך: ${dateDisplay}</li>
          <li>שעה: ${time}</li>
          <li>מספר סועדים: ${guests}</li>
        </ul>
        <p>מצפים לראותכם!</p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: email,
        subject: `אישור הזמנה - ${BUSINESS_NAME}`,
        html
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      return new Response(JSON.stringify({ error: errText }), { status: 500 });
    }

    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
