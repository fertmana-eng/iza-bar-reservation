// The booking card picture (1080x1350), drawn on the phone. Shared by the booking
// page (index.html) and the personal booking page (booking.html).
// b: { business, name, guests, time 'HH:MM', date 'YYYY-MM-DD', bookingId, pending }
const CARD_W = 1080, CARD_H = 1350;
// "שולחן ל-3 סועדים" or "בבר, ל-2 סועדים": the seating area the booking ended up in
// (owner, Nov 2026), used on the card and in the texts of both customer pages.
function placeText(seating, guests) {
  return seating === 'bar' ? `בבר, ל-${guests} סועדים` : `שולחן ל-${guests} סועדים`;
}

function drawBookingCard(canvas, b) {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const c = canvas.getContext('2d'), ink = '#1c1610', paper = '#f0e8d0', soft = '#5a4f3c', mid = CARD_W / 2;
  const text = (t, y, size, weight, color, maxW = 960) => {
    let s = size; c.font = `${weight} ${s}px Heebo, Arial, sans-serif`;
    while (c.measureText(t).width > maxW && s > 20) { s -= 2; c.font = `${weight} ${s}px Heebo, Arial, sans-serif`; }
    c.fillStyle = color; c.fillText(t, mid, y);
  };
  const dashed = y => { c.save(); c.setLineDash([14, 12]); c.strokeStyle = 'rgba(28,22,16,.35)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(80, y); c.lineTo(CARD_W - 80, y); c.stroke(); c.restore(); };
  c.direction = 'rtl'; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = paper; c.fillRect(0, 0, CARD_W, CARD_H);
  c.fillStyle = ink; c.fillRect(0, 0, CARD_W, 270);
  text(b.business + ' //', 160, 120, 900, paper);
  text('הזמנת מקומות', 225, 40, 700, 'rgba(240,232,208,.65)');
  text(b.pending ? 'הבקשה התקבלה' : 'ההזמנה אושרה', 380, 68, 900, ink);
  text(b.name, 465, 54, 600, soft);
  dashed(530);
  const [y, m, d] = b.date.split('-').map(Number), day = new Date(y, m - 1, d);
  const weekday = day.toLocaleDateString('he-IL', { weekday: 'long' }), dateShort = `${d}.${m}`;
  text(weekday + ' · ' + dateShort, 650, 70, 800, ink);
  text(b.time, 850, 190, 900, ink);
  text(placeText(b.seating, b.guests), 950, 58, 600, ink);
  dashed(1020);
  if (b.pending) {
    text('ממתינה לאישור · נעדכן אתכם בוואטסאפ', 1100, 40, 700, ink);
    text('נחכה עד 15 דקות משעת ההזמנה', 1160, 38, 400, soft);
  } else {
    text('נחכה עד 15 דקות משעת ההזמנה', 1100, 38, 400, soft);
    text('מצפים לראותכם ✳', 1160, 38, 400, soft);
  }
  if (b.bookingId) text('מספר הזמנה ' + b.bookingId, 1285, 32, 400, soft);
}
