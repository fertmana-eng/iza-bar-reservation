// Background helper (service worker) for booking notifications, registered by booking.html
// when the customer asks to be notified. Shows the bar's answer and opens the booking when tapped.
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'עיזה בר', {
    body: d.body || '', dir: 'rtl', lang: 'he', data: { url: d.url || '' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (url) event.waitUntil(self.clients.openWindow(url));
});
