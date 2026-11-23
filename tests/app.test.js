// Behaviour tests for the table reservation pages. Run from the project folder:
//   node --test tests/app.test.js
// Each test opens a page in headless Chromium with a fake database
// (tests/fake-supabase.js), never the real one.
const {test,describe,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium,startServer,openPage,text}=require('./helpers');

let browser,server;
before(async()=>{browser=await chromium.launch();server=await startServer();});
after(async()=>{await browser.close();await server.close();});
const open=opts=>openPage(browser,server.url,opts);

// A Sunday morning in Israel, before the 17:00 same-day cutoff
const MORNING='2026-11-22T10:00:00+02:00';
const rpcCalls=(page,name)=>page.evaluate(n=>__ops.filter(o=>o.rpc===n),name);

// The one-screen booking page: pick guests, date and time in the bottom panels
async function choose(page,{seating='table',guests=3,date='2026-11-25',time='17:15'}={}){
  if(seating)await page.click(`[data-seating="${seating}"]`);
  if(guests){await page.click('#pickGuests');await page.click(`#sheet [data-guests="${guests}"]`);}
  if(date){await page.click('#pickDate');await page.click(`#sheet .cal-grid button[data-date="${date}"]`);}
  if(time){await page.click('#pickTime');await page.click(`#sheet [data-time="${time}"]`);}
}
// ...then search and fill the name and phone, up to the confirm button
async function fillBooking(page,opts={}){
  await choose(page,opts);
  await page.click('#findBtn');await page.waitForSelector('#submitBtn');
  await page.fill('#nameInput','דנה כהן');await page.fill('#phoneInput','050-1234567');
}
const openCalendar=async page=>{await page.click('#pickDate');await page.waitForSelector('#sheet .cal-grid');};

describe('customer booking page',()=>{
  // Owner, Nov 2026: one screen like the big booking sites, no default values,
  // and each rule shown where it matters.
  test('opens on one screen with three empty boxes, the indoor-only note and a search button',async()=>{
    const {page,ctx,errors}=await open({time:MORNING});
    assert.equal(await text(page,'#indoorNote'),'הזמנה לישיבה בפנים בלבד. בחוץ ללא הזמנה, לפי מקום פנוי.');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.pick')].map(b=>b.innerText.replace(/\s+/g,' ').trim())),['סועדים ▾','תאריך ▾','שעה ▾']);
    assert.equal(await page.evaluate(()=>document.querySelectorAll('.seating button.on').length),0,'table / bar not chosen yet');
    assert.equal(await page.isDisabled('#findBtn'),true,'nothing chosen yet');
    await choose(page,{seating:null});
    assert.equal(await page.isDisabled('#findBtn'),true,'table or bar must be chosen too');
    assert.equal(await page.isVisible('#nameInput'),false);
    await choose(page);
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.pick')].map(b=>b.innerText.replace(/\s+/g,' ').trim())),['3 סועדים ▾','ד׳ 25.11 ▾','17:15 ▾']);
    assert.equal(await page.isDisabled('#findBtn'),false);
    assert.equal(await page.isVisible('#sheet'),false,'each panel closes after a choice');
    assert.equal((await rpcCalls(page,'check_availability')).length,0,'nothing is checked before the search');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a panel closes with ✕ or a tap outside it, without changing anything',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await page.click('#pickGuests');await page.click('#sheetClose');
    assert.equal(await page.isVisible('#sheet'),false);
    await page.click('#pickTime');await page.mouse.click(10,10);
    assert.equal(await page.isVisible('#sheet'),false);
    assert.equal(await page.isDisabled('#findBtn'),true);await ctx.close();
  });
  test('when there is room, the details form opens on the same screen with the arrival rules above the button',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await choose(page);await page.click('#findBtn');await page.waitForSelector('#submitBtn');
    assert.deepEqual((await rpcCalls(page,'check_availability')).map(c=>c.args),[{p_date:'2026-11-25',p_guests:3,p_seating:'table'}]);
    assert.equal(await text(page,'.found-title'),'יש מקום! נשאר רק להשאיר פרטים');
    assert.equal(await text(page,'#rules'),'נחכה למאחרים עד 15 דקות משעת ההזמנה. אחר כך לא נוכל להתחייב שהמקום יישמר לכם 🙏 הקדמתם? ייתכן שתצטרכו להמתין שהמקום שלכם יתפנה.');
    assert.ok(await page.evaluate(()=>document.getElementById('rules').compareDocumentPosition(document.getElementById('submitBtn'))&Node.DOCUMENT_POSITION_FOLLOWING));
    await ctx.close();
  });
  test('changing a choice after the search closes the form and asks to search again, keeping what was typed',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);
    await page.click('#pickGuests');await page.click('#sheet [data-guests="5"]');
    assert.equal(await page.isVisible('#submitBtn'),false);
    assert.equal(await page.isEnabled('#findBtn'),true);
    await page.click('#findBtn');await page.waitForSelector('#submitBtn');
    assert.equal(await page.inputValue('#nameInput'),'דנה כהן');
    assert.equal(await page.inputValue('#phoneInput'),'050-1234567');await ctx.close();
  });
  test('picking today between 16:00 and 20:00 says it waits for approval; other days do not',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T17:00:00+02:00'});
    assert.equal(await page.isVisible('#approvalNote'),false);
    await choose(page,{guests:null,time:null,date:'2026-11-22'});
    assert.equal(await text(page,'#approvalNote'),'הזמנה להיום אחרי 16:00 ממתינה לאישור שלנו. נעדכן אתכם בוואטסאפ.');
    await choose(page,{guests:null,time:null,date:'2026-11-25'});
    assert.equal(await page.isVisible('#approvalNote'),false);await ctx.close();
    const morning=await open({time:MORNING});
    await choose(morning.page,{guests:null,time:null,date:'2026-11-22'});
    assert.equal(await morning.page.isVisible('#approvalNote'),false);await morning.ctx.close();
  });
  test('a full booking sends the right details and shows the confirmation',async()=>{
    const {page,ctx,errors}=await open({time:MORNING});
    await fillBooking(page);
    await page.fill('#noteInput','יום הולדת');
    await page.click('#submitBtn');await page.waitForSelector('.success');
    const [call]=await rpcCalls(page,'book_reservation');
    assert.deepEqual(call.args,{p_date:'2026-11-25',p_time:'17:15',p_name:'דנה כהן',p_phone:'050-1234567',p_guests:3,p_note:'יום הולדת',p_seating:'table'});
    // the confirmation is the booking card picture only (owner's request), described for screen readers
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.equal(await page.getAttribute('#cardPreview','alt'),'ההזמנה אושרה: דנה כהן, שולחן ל-3 סועדים, 25.11 בשעה 17:15');
    assert.equal(await text(page,'.success'),'');
    assert.ok(await page.isVisible('.btn-whatsapp'));assert.ok(await page.isVisible('#icsBtn'));
    assert.equal((await page.evaluate(()=>__ops.filter(o=>o.fn))).length,0,'no email is requested');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  // Table or bar (owner, Nov 2026)
  test('choosing the bar limits the group to 4 and books at the bar; the card says so',async()=>{
    const {page,ctx,errors}=await open({time:MORNING});
    await choose(page,{seating:'table',guests:6,date:null,time:null});
    await page.click('[data-seating="bar"]');
    assert.match(await text(page,'#pickGuests'),/^סועדים/,'6 guests can not sit at the bar: cleared');
    await page.click('#pickGuests');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#sheet [data-guests]')].map(b=>+b.dataset.guests)),[1,2,3,4]);
    assert.match(await text(page,'#sheet .hint'),/בבר: עד 4 סועדים בהזמנה/);
    await page.click('#sheet [data-guests="2"]');
    await choose(page,{seating:null,guests:null});
    await page.click('#findBtn');await page.waitForSelector('#submitBtn');
    assert.equal((await rpcCalls(page,'check_availability'))[0].args.p_seating,'bar');
    await page.fill('#nameInput','דנה כהן');await page.fill('#phoneInput','050-1234567');
    await page.click('#submitBtn');await page.waitForSelector('#cardPreview:not([hidden])');
    assert.equal((await rpcCalls(page,'book_reservation'))[0].args.p_seating,'bar');
    assert.equal(await page.getAttribute('#cardPreview','alt'),'ההזמנה אושרה: דנה כהן, בבר, ל-2 סועדים, 25.11 בשעה 17:15');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('table chosen but none left: the bar is offered, and one tap books there',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{available:'bar'}});
    await choose(page,{guests:2});await page.click('#findBtn');await page.waitForSelector('#barOffer');
    assert.match(await text(page,'#barOffer'),/^אין שולחנות פנויים בתאריך הזה, אבל יש מקום בבר\. להזמין בבר$/);
    assert.equal(await page.isVisible('#nameInput'),false);
    await page.evaluate(()=>{window.__cfg.available='yes';});
    await page.click('#switchBar');await page.waitForSelector('#submitBtn');
    assert.equal(await page.evaluate(()=>document.querySelector('.seating button.on').dataset.seating),'bar');
    assert.equal(await page.isVisible('#barOffer'),false);
    assert.deepEqual((await rpcCalls(page,'check_availability')).map(c=>c.args.p_seating),['table','bar']);
    await ctx.close();
  });
  test('the tables filling up while booking also offers the bar',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{bookResult:'bar_available'}});
    await fillBooking(page,{guests:2});await page.click('#submitBtn');await page.waitForSelector('#barOffer');
    assert.equal(await page.isVisible('#submitBtn'),false);await ctx.close();
  });
  // Double bookings (owner, Nov 2026): one per phone per evening, 3 an hour per connection
  for(const [result,msg] of [['duplicate',/כבר יש הזמנה על מספר הטלפון הזה לערב הזה/],['too_many',/נעשו כבר כמה הזמנות מהחיבור הזה בשעה האחרונה/]]){
    test(`a refused double booking is explained (${result})`,async()=>{
      const {page,ctx}=await open({time:MORNING,cfg:{bookResult:result}});
      await fillBooking(page);await page.click('#submitBtn');await page.waitForTimeout(200);
      assert.match(await text(page,'#submitError'),msg);
      assert.ok(await page.isEnabled('#submitBtn'));await ctx.close();
    });
  }
  // a phone that can share files: record what would go to the share sheet
  const fakeShare=()=>{window.__shared=[];navigator.canShare=d=>!!(d&&d.files);
    navigator.share=async d=>{window.__shared.push((d.files||[]).map(f=>f.name+'|'+f.type+'|'+(f.size>10000)));window.__sharedText=d.text;};};
  test('on a phone, the WhatsApp button shares a picture of the booking',async()=>{
    const {page,ctx,errors}=await open({time:MORNING,init:fakeShare});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('.success');
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.deepEqual(await page.evaluate(()=>{const i=document.getElementById('cardPreview');return [i.naturalWidth,i.naturalHeight];}),[1080,1350]);
    const pages=ctx.pages().length;
    await page.click('#waLink');await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(()=>window.__shared),[['izabar-booking.png|image/png|true']]);
    // the private link goes along as the picture's caption
    assert.match(await page.evaluate(()=>window.__sharedText),/אישור הזמנה - עיזה בר\nדנה כהן, שולחן ל-3 סועדים\n25\.11 בשעה 17:15\nלצפייה, שינוי או ביטול: http:\/\/localhost:\d+\/booking\.html#11111111-2222-4333-8444-555555555555$/);
    assert.equal(ctx.pages().length,pages,'no WhatsApp text link opened');
    // WhatsApp may drop the caption: a second button sends the link as plain text
    assert.ok(await page.isVisible('#waLinkText'));
    assert.match(decodeURIComponent(await page.getAttribute('#waLinkText','href')),/^https:\/\/wa\.me\/\?text=אישור הזמנה - עיזה בר\n.*\nלצפייה, שינוי או ביטול: http:\/\/localhost:\d+\/booking\.html#11111111-2222-4333-8444-555555555555$/s);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('if the picture cannot be drawn, the confirmation is shown as text',async()=>{
    const {page,ctx}=await open({time:MORNING,init:()=>{HTMLCanvasElement.prototype.getContext=()=>null;}});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('#cardFallback:not([hidden])');
    assert.match(await text(page,'.success'),/ההזמנה אושרה.*דנה כהן, שולחן ל-3 סועדים.*25\.11 בשעה 17:15/);
    assert.equal(await page.isVisible('#cardPreview'),false);
    assert.ok(await page.isVisible('#waLink'));await ctx.close();
  });
  test('where pictures cannot be shared, the WhatsApp button sends the text as before',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('#cardPreview:not([hidden])');
    const href=await page.getAttribute('#waLink','href');
    assert.ok(href.startsWith('https://wa.me/?text='));
    assert.equal(await page.isVisible('#waLinkText'),false,'one button is enough when the text already carries the link');
    assert.match(decodeURIComponent(href),/אישור הזמנה - עיזה בר\nדנה כהן, שולחן ל-3 סועדים\n25\.11 בשעה 17:15\nלצפייה, שינוי או ביטול: http:\/\/localhost:\d+\/booking\.html#11111111/);
    await ctx.close();
  });
  // Same-day rules by the hour of booking (owner, Nov 2026): before 16:00 confirmed,
  // 16:00-20:00 waits for approval, from 20:00 closed; arrivals at least 30 minutes ahead.
  test('a request waiting for approval gets its own card, without "add to calendar"',async()=>{
    const {page,ctx,errors}=await open({time:'2026-11-22T17:00:00+02:00',cfg:{bookResult:'pending'}});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('#cardPreview:not([hidden])');
    assert.match(await page.getAttribute('#cardPreview','alt'),/^הבקשה התקבלה וממתינה לאישור: דנה כהן/);
    assert.equal(await page.isVisible('#icsBtn'),false);assert.equal(await page.isVisible('#calLink'),false);
    assert.match(decodeURIComponent(await page.getAttribute('#waLink','href')),/בקשת הזמנה \(ממתינה לאישור\) - עיזה בר/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('if the chosen time has just passed, the customer is told to pick a later one',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{bookResult:'invalid_time'}});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForTimeout(200);
    assert.match(await text(page,'#submitError'),/השעה שבחרתם כבר לא זמינה/);await ctx.close();
  });
  test('the confirmation screen links to the personal booking page',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('.success');
    assert.equal(await page.getAttribute('#manageLink','href'),'booking.html#11111111-2222-4333-8444-555555555555');
    await ctx.close();
    const second=await open({time:MORNING,cfg:{token:null}});      // a database without the link yet: no button
    await fillBooking(second.page);await second.page.click('#submitBtn');await second.page.waitForSelector('.success');
    assert.equal(await second.page.isVisible('#manageLink'),false);await second.ctx.close();
  });
  test('the phone remembers its bookings: "my bookings" at the top of the page',async()=>{
    const {page,ctx}=await open({time:MORNING});
    assert.equal(await page.isVisible('#myBookings'),false,'nothing before the first booking');
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('.success');
    await page.evaluate(()=>{const l=JSON.parse(localStorage.getItem('izabar_my_bookings'));
      l.push({token:'99999999-2222-4333-8444-555555555555',date:'2026-11-01',time:'18:00',guests:2});   // an old one: not shown
      localStorage.setItem('izabar_my_bookings',JSON.stringify(l));});
    await page.reload();await page.waitForSelector('#myBookings');
    assert.match(await text(page,'#myBookings'),/^ההזמנות שלי 25\.11 · 17:15 · 3 סועדים לצפייה ושינוי ‹$/);
    assert.equal(await page.getAttribute('.my-booking','href'),'booking.html#11111111-2222-4333-8444-555555555555');
    await ctx.close();
  });
  test('there is no email field (owner decided against emails)',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);
    assert.equal(await page.isVisible('#emailInput'),false);
    assert.doesNotMatch(await text(page,'#stepArea'),/אימייל/);await ctx.close();
  });
  test('"add to calendar" on Android opens Google Calendar with the booking filled in',async()=>{
    const {page,ctx}=await open({time:MORNING,userAgent:'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('.success');
    assert.equal(await page.isVisible('#icsBtn'),false,'no file button on Android');
    const url=new URL(await page.getAttribute('#calLink','href'));
    assert.equal(url.origin+url.pathname,'https://calendar.google.com/calendar/render');
    assert.equal(url.searchParams.get('dates'),'20261125T171500/20261125T191500');
    assert.equal(url.searchParams.get('ctz'),'Asia/Jerusalem');
    assert.equal(url.searchParams.get('text'),'עיזה בר - שולחן ל-3 סועדים');
    assert.match(url.searchParams.get('details'),/דנה כהן/);
    assert.equal(await page.getAttribute('#calLink','target'),'_blank');await ctx.close();
  });
  test('"add to calendar" elsewhere downloads a complete calendar file in the right time',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('.success');
    const [dl]=await Promise.all([page.waitForEvent('download'),page.click('#icsBtn')]);
    assert.equal(dl.suggestedFilename(),'reservation.ics');
    const ics=require('fs').readFileSync(await dl.path(),'utf8');
    // 17:15 in Israel in November is 15:15 UTC; two hours long
    assert.match(ics,/\r\nDTSTART:20261125T151500Z\r\nDTEND:20261125T171500Z\r\n/);
    for(const line of ['BEGIN:VCALENDAR','PRODID:','UID:','DTSTAMP:','SUMMARY:עיזה בר - שולחן ל-3 סועדים','LOCATION:עיזה בר','END:VCALENDAR'])assert.ok(ics.includes(line),line);
    // summer time: Israel is 3 hours ahead
    assert.equal(await page.evaluate(()=>israelToUtc('20260610T170000')),'20260610T140000Z');
    await ctx.close();
  });
  test('for today, times earlier than 30 minutes from now (rounded up to a quarter hour) cannot be picked',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T18:40:00+02:00'});
    await choose(page,{guests:null,time:null,date:'2026-11-22'});
    await page.click('#pickTime');
    assert.equal(await page.isDisabled('#sheet [data-time="19:00"]'),true);
    assert.equal(await page.isDisabled('#sheet [data-time="19:15"]'),false);
    assert.match(await text(page,'#sheet .hint'),/להיום: בין 19:15 ל-21:00/);
    await page.click('#sheet [data-time="19:15"]');
    // another day starts at the usual 17:00 and keeps the chosen time
    await choose(page,{guests:null,time:null,date:'2026-11-23'});
    assert.match(await text(page,'#pickTime'),/19:15/);
    await page.click('#pickTime');assert.equal(await page.isDisabled('#sheet [data-time="17:00"]'),false);
    await page.click('#sheet [data-time="17:00"]');
    // back to today: 17:00 is too early, so the time is cleared
    await choose(page,{guests:null,time:null,date:'2026-11-22'});
    assert.match(await text(page,'#pickTime'),/^שעה/);await ctx.close();
  });
  test('a time that passed while the page was open is caught by the search',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T18:40:00+02:00'});
    await choose(page,{date:'2026-11-22',time:'19:15'});
    await page.clock.setFixedTime(new Date('2026-11-22T19:00:00+02:00'));
    await page.click('#findBtn');await page.waitForSelector('#formWarning');
    assert.match(await text(page,'#formWarning'),/השעה שבחרתם כבר עברה/);
    assert.match(await text(page,'#pickTime'),/^שעה/);
    assert.equal((await rpcCalls(page,'check_availability')).length,0);await ctx.close();
  });
  test('a name or note containing code is shown as plain text, never run',async()=>{
    const {page,ctx,errors}=await open({time:MORNING});
    const evil='"><img src=x onerror="window.__pwned=1">';
    await choose(page);await page.click('#findBtn');await page.waitForSelector('#submitBtn');
    await page.fill('#nameInput',evil);await page.fill('#phoneInput','050-1234567');
    await page.fill('#noteInput','</textarea><img src=x onerror="window.__pwned=2">');
    // change a choice and search again: the typed text is put back into the form
    await page.click('#pickGuests');await page.click('#sheet [data-guests="4"]');
    await page.click('#findBtn');await page.waitForSelector('#submitBtn');
    assert.equal(await page.inputValue('#nameInput'),evil);
    await page.click('#submitBtn');await page.waitForSelector('#cardPreview:not([hidden])');
    assert.ok((await page.getAttribute('#cardPreview','alt')).includes(evil));
    assert.equal(await page.evaluate(()=>[window.__pwned,document.querySelectorAll('img:not(#cardPreview):not(.venue-logo)').length].join()),',0');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a missing or wrong phone number is explained before anything is sent',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await choose(page);await page.click('#findBtn');await page.waitForSelector('#submitBtn');
    await page.click('#submitBtn');
    assert.match(await text(page,'#submitError'),/נא למלא שם וטלפון/);
    await page.fill('#nameInput','דנה');await page.fill('#phoneInput','abc');await page.click('#submitBtn');
    assert.match(await text(page,'#submitError'),/מספר הטלפון לא תקין/);
    assert.equal((await rpcCalls(page,'book_reservation')).length,0);
    await page.fill('#phoneInput','+972 50-123-4567');
    await page.click('#submitBtn');await page.waitForSelector('.success');
    await ctx.close();
  });
  test('if the database refuses the details, the customer is told to check them',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{bookResult:'invalid'}});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForTimeout(200);
    assert.match(await text(page,'#submitError'),/אחד הפרטים לא תקין/);
    assert.ok(await page.isEnabled('#submitBtn'));await ctx.close();
  });
  test('no room for the group on that date: a message, and the form stays closed',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{available:'no'}});
    await choose(page);await page.click('#findBtn');await page.waitForSelector('#formWarning');
    assert.equal(await text(page,'#formWarning'),'אין מקום ל-3 סועדים בתאריך הזה. נסו תאריך אחר או קבוצה קטנה יותר.');
    assert.equal(await page.isVisible('#nameInput'),false);
    // a new choice clears the message
    await page.click('#pickGuests');await page.click('#sheet [data-guests="2"]');
    assert.equal(await page.isVisible('#formWarning'),false);await ctx.close();
  });
  test('if the date fills up while booking, the customer is asked to pick another date',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{bookResult:'full'}});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('#formWarning');
    assert.match(await text(page,'#formWarning'),/התאריך הזה התמלא בדיוק עכשיו/);
    assert.match(await text(page,'#pickDate'),/^תאריך/);
    assert.equal(await page.isVisible('#submitBtn'),false);await ctx.close();
  });
  test('from 20:00, today can no longer be booked',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T20:05:00+02:00'});
    await openCalendar(page);
    assert.equal(await page.evaluate(()=>document.querySelector('.cal-grid button.today')?.dataset.date),'2026-11-22');
    assert.equal(await page.isDisabled('.cal-grid button[data-date="2026-11-22"]'),true);
    await ctx.close();
  });
  test('today picked just before 20:00 is refused if the page is still open after 20:00',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T19:20:00+02:00'});
    await choose(page,{date:'2026-11-22',time:'21:00'});
    await page.clock.setFixedTime(new Date('2026-11-22T20:01:00+02:00'));
    await page.click('#findBtn');await page.waitForSelector('#formWarning');
    assert.match(await text(page,'#formWarning'),/ההזמנות המקוונות ליום זה נסגרו/);
    assert.equal((await rpcCalls(page,'check_availability')).length,0);await ctx.close();
  });
  // Bug found Nov 2026: every calendar day was linked to the day before it
  // (dates went through UTC), so tapping 26 booked the 25th.
  const calendarDays=page=>page.evaluate(()=>[...document.querySelectorAll('.cal-grid button')]
    .map(b=>({n:+b.textContent,date:b.dataset.date,today:b.classList.contains('today')})));
  for(const [label,time,today] of [['in the morning','2026-11-22T10:00:00+02:00','2026-11-22'],['just after midnight','2026-11-23T00:30:00+02:00','2026-11-23']]){
    test(`each calendar day books that same date, and today is marked correctly (${label})`,async()=>{
      const {page,ctx}=await open({time});
      await openCalendar(page);
      const days=await calendarDays(page);
      assert.deepEqual(days.filter(d=>+d.date.slice(8)!==d.n),[]);
      assert.deepEqual(days.filter(d=>d.today).map(d=>d.date),[today]);
      await page.click('.cal-grid button:has-text("26")');
      await choose(page,{date:null});await page.click('#findBtn');await page.waitForSelector('#submitBtn');
      assert.equal((await rpcCalls(page,'check_availability'))[0].args.p_date,'2026-11-26');
      await ctx.close();
    });
  }
  test('a phone in another time zone still uses Israel time for today and the cutoff',async()=>{
    // 20:30 in Israel is 13:30 in New York: today is already closed in Israel
    const {page,ctx}=await open({time:'2026-11-22T20:30:00+02:00',timezoneId:'America/New_York'});
    await openCalendar(page);
    assert.deepEqual((await calendarDays(page)).filter(d=>d.today).map(d=>d.date),['2026-11-22']);
    assert.equal(await page.isDisabled('.cal-grid button[data-date="2026-11-22"]'),true);
    await ctx.close();
  });
  test('the calendar panel moves between months within the 30 days ahead',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await openCalendar(page);
    assert.equal(await page.isDisabled('#prevMonth'),true);
    await page.click('#nextMonth');
    assert.match(await text(page,'.cal-month'),/דצמבר 2026/);
    assert.equal(await page.isDisabled('.cal-grid button[data-date="2026-12-22"]'),false);
    assert.equal(await page.isDisabled('.cal-grid button[data-date="2026-12-23"]'),true);
    await page.click('.cal-grid button[data-date="2026-12-10"]');
    assert.match(await text(page,'#pickDate'),/10\.12/);await ctx.close();
  });
});

describe('IZAZOO logo',()=>{
  test('the red logo replaces the bar name in the booking pages\' header and sits on the tablet screen (same look everywhere)',async()=>{
    const logo=page=>page.evaluate(()=>[...document.querySelectorAll('img.venue-logo, img.brand-logo')].filter(i=>i.offsetParent)
      .map(i=>[i.getAttribute('src'),i.alt,i.complete&&i.naturalWidth>0]));
    for(const [file,src,cfg] of [['','assets/izazoo-logo-red.png',{}],
      ['booking.html#11111111-2222-4333-8444-555555555555','assets/izazoo-logo-red.png',{bookings:[{access_token:'11111111-2222-4333-8444-555555555555',id:1,status:'confirmed',reservation_date:'2026-11-25',arrival_time:'19:00:00',customer_name:'דנה',guests:2,note:null,can_change:true,can_cancel:true}]}],
      ['admin.html','assets/izazoo-logo-red.png',{}],['admin.html','assets/izazoo-logo-red.png',{noSession:true}]]){
      const {page,ctx}=await open({file,time:MORNING,cfg});
      await page.waitForFunction(()=>[...document.images].filter(i=>/izazoo-logo/.test(i.src)).every(i=>i.complete));
      assert.deepEqual(await logo(page),[[src,'IZAZOO',true]],file||'index.html');
      assert.doesNotMatch(await page.evaluate(()=>document.querySelector('.header-band')?.innerText||''),/עיזה בר/);
      await ctx.close();
    }
  });
});

describe('manager login',()=>{
  test('without a login, the manager page shows only the login form and reads nothing',async()=>{
    const {page,ctx,errors}=await open({file:'admin.html',cfg:{noSession:true}});
    assert.ok(await page.isVisible('#loginForm'));
    assert.equal(await page.$('#listContent'),null);
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.table)),[]);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('logging in with the username opens the bookings',async()=>{
    const {page,ctx,errors}=await open({file:'admin.html',time:MORNING,cfg:{noSession:true}});
    await page.fill('#userInput',' IzaBar ');await page.fill('#passInput','secret');
    await page.click('#loginBtn');await page.waitForSelector('#summary');
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.auth)),[{auth:'signIn',email:'izabar@izabar.local'}]);
    assert.equal(await text(page,'#dayTitle'),'יום ראשון · 22.11.2026');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a wrong password or no connection shows a clear message',async()=>{
    for(const [loginError,msg] of [['wrong',/שם משתמש או סיסמה שגויים/],['network',/אין חיבור לשרת/]]){
      const {page,ctx}=await open({file:'admin.html',cfg:{noSession:true,loginError}});
      await page.fill('#userInput','izabar');await page.fill('#passInput','x');
      await page.click('#loginBtn');await page.waitForTimeout(200);
      assert.match(await text(page,'#loginError'),msg);
      assert.ok(await page.isEnabled('#loginBtn'));await ctx.close();
    }
  });
  test('an empty username or password is not sent',async()=>{
    const {page,ctx}=await open({file:'admin.html',cfg:{noSession:true}});
    await page.fill('#userInput','izabar');await page.click('#loginBtn');await page.waitForTimeout(200);
    assert.match(await text(page,'#loginError'),/נא למלא/);
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.auth)),[]);await ctx.close();
  });
  test('signing out returns to the login form',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING});
    await page.click('#signOutBtn');await page.waitForTimeout(200);
    assert.ok(await page.isVisible('#loginForm'));
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.auth)),[{auth:'signOut'}]);await ctx.close();
  });
});

describe('manager page (floor plan and evening sheet)',()=>{
  const reservations=[
    {id:1,reservation_date:'2026-11-22',arrival_time:'19:00:00',customer_name:'רון',phone:'052-1111111',guests:2,note:null,assigned_table_id:1,assigned_kind:'table',status:'confirmed'},
    {id:2,reservation_date:'2026-11-22',arrival_time:'18:00:00',customer_name:'מאיה',phone:'054-2222222',guests:3,note:'כיסא תינוק',assigned_table_id:8,assigned_kind:'bar_pool',status:'confirmed'}];
  const openAdmin=(rows=reservations,opts={})=>open({file:'admin.html',time:MORNING,cfg:{reservations:rows.map(r=>({...r}))},...opts});
  const sheetRows=page=>page.evaluate(()=>[...document.querySelectorAll('#sheet tbody tr')].map(tr=>tr.innerText.replace(/\s+/g,' ').trim()));
  const planStates=page=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#plan .tbl')].map(g=>[g.querySelector('.num').textContent,g.classList[1]])));
  const openRow=(page,id)=>page.click(`#sheet tr[data-id="${id}"]`);

  test('the evening sheet: one row per table like the paper, then the bar, with totals',async()=>{
    const {page,ctx,errors}=await openAdmin();
    assert.equal(await text(page,'#dayTitle'),'יום ראשון · 22.11.2026');
    assert.equal(await text(page,'#summary'),'2 הזמנות · 5 סועדים');
    assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#sheet th')].map(th=>th.textContent)),['שולחן','שם','שעה','סועדים','הערות']);
    assert.deepEqual(await sheetRows(page),['1 רון 19:00 2','2','3','4','6','7','18','בר מאיה 18:00 3 כיסא תינוק','בר + הוספה לבר']);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('the floor plan is the approved picture, whole and in proportion on a tablet and a phone',async()=>{
    for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
      const {page,ctx,errors}=await openAdmin(reservations,{viewport});
      const r=await page.evaluate(async()=>{
        const img=document.querySelector('#plan image'),svg=document.getElementById('plan').getBoundingClientRect();
        const probe=new Image();probe.src=img.getAttribute('href');await probe.decode();
        return {href:img.getAttribute('href'),viewBox:document.getElementById('plan').getAttribute('viewBox'),
          natural:[probe.naturalWidth,probe.naturalHeight],square:Math.abs(svg.width-svg.height)<1.5,
          fits:svg.right<=innerWidth+0.5&&svg.left>=-0.5};});
      assert.deepEqual(r,{href:'assets/iza_main_hall_v2.webp',viewBox:'0 0 1254 1254',natural:[1254,1254],square:true,fits:true},JSON.stringify(viewport));
      assert.deepEqual(errors,[]);await ctx.close();
    }
  });
  test('the floor plan colours each table by its state and counts the bar',async()=>{
    const rows=[...reservations,{id:3,reservation_date:'2026-11-22',arrival_time:'20:00:00',customer_name:'דן',phone:'050-3',guests:4,note:null,assigned_table_id:4,assigned_kind:'table',status:'pending'},
      {id:4,reservation_date:'2026-11-22',arrival_time:'17:00:00',customer_name:'גל',phone:'050-4',guests:6,note:null,assigned_table_id:7,assigned_kind:'table',status:'confirmed',arrived_at:'2026-11-22T15:00:00Z'}];
    const {page,ctx}=await openAdmin(rows);
    assert.deepEqual(await planStates(page),{3:'free',1:'booked',2:'free',18:'free',4:'pending',6:'free',7:'arrived'});
    assert.equal(await page.textContent('#barCount'),'3/12');
    assert.equal(await text(page,'#summary'),'3 הזמנות · 11 סועדים · 1 ממתינות לאישור · 1 הגיעו');await ctx.close();
  });
  test('late guests: orange after the booking time, red after 15 minutes, counted at the top',async()=>{
    const rows=[
      {id:1,reservation_date:'2026-11-22',arrival_time:'19:00:00',customer_name:'רון',phone:'052-1',guests:2,note:null,assigned_table_id:1,assigned_kind:'table',status:'confirmed'},
      {id:2,reservation_date:'2026-11-22',arrival_time:'18:45:00',customer_name:'דנה',phone:'052-2',guests:5,note:null,assigned_table_id:3,assigned_kind:'table',status:'confirmed'},
      {id:3,reservation_date:'2026-11-22',arrival_time:'18:30:00',customer_name:'אבי',phone:'052-3',guests:7,note:null,assigned_table_id:7,assigned_kind:'table',status:'confirmed',arrived_at:'2026-11-22T16:31:00Z'},
      {id:4,reservation_date:'2026-11-22',arrival_time:'20:00:00',customer_name:'נועה',phone:'052-4',guests:4,note:null,assigned_table_id:4,assigned_kind:'table',status:'confirmed'}];
    const {page,ctx}=await openAdmin(rows,{time:'2026-11-22T19:10:00+02:00'});
    const st=await planStates(page);
    assert.deepEqual([st[1],st[3],st[7],st[4]],['late','late15','arrived','booked']);
    assert.equal(await text(page,'#summary'),'4 הזמנות · 18 סועדים · 1 הגיעו · 2 מאחרים');
    const sheet=await sheetRows(page);
    assert.equal(sheet[0],'1 רון מאחרים 10 דק׳ 19:00 2');
    assert.equal(sheet[2],'3 דנה מאחרים 25 דק׳ 18:45 5');
    assert.equal(await page.textContent('#plan .tbl[data-table="3"] .num'),'3');
    await page.click('#plan .tbl[data-table="3"]');await page.waitForSelector('#lateNote');
    assert.equal(await text(page,'#lateNote'),'מאחרים 25 דקות. עברו 15 דקות: אפשר לשחרר את השולחן.');
    await page.click('#arrivedBtn');                      // they arrived: no longer late
    await page.waitForFunction(()=>document.querySelector('#plan .tbl[data-table="3"]').classList.contains('arrived'),null,{timeout:10000});
    assert.equal(await text(page,'#summary'),'4 הזמנות · 18 סועדים · 2 הגיעו · 1 מאחרים');await ctx.close();
    const other=await openAdmin(rows.map(r=>({...r,reservation_date:'2026-11-21'})),{time:'2026-11-22T19:10:00+02:00'});
    await other.page.click('#prevDay');await other.page.waitForSelector('#summary');
    assert.doesNotMatch(await text(other.page,'#summary'),/מאחרים/,'another day is never late');await other.ctx.close();
  });
  test('the day can be changed with the arrows; just after midnight it opens on the new day',async()=>{
    const {page,ctx}=await openAdmin();
    await page.click('#nextDay');await page.waitForTimeout(200);
    assert.equal(await page.inputValue('#dateInput'),'2026-11-23');assert.equal(await text(page,'#dayTitle'),'יום שני · 23.11.2026');
    assert.equal(await text(page,'#summary'),'0 הזמנות · 0 סועדים');
    await page.click('#prevDay');await page.click('#prevDay');await page.waitForTimeout(200);
    assert.equal(await page.inputValue('#dateInput'),'2026-11-21');await ctx.close();
    const late=await open({file:'admin.html',time:'2026-11-23T00:30:00+02:00'});
    assert.equal(await late.page.inputValue('#dateInput'),'2026-11-23');await late.ctx.close();
  });
  test('tapping a booked table opens its details; "arrived" is marked on the sheet and the plan',async()=>{
    const {page,ctx}=await openAdmin();
    await page.click('#plan .tbl[data-table="1"]');await page.waitForSelector('#panel');
    assert.match(await text(page,'#panel'),/שולחן 1 · רון מוזמן שעה 19:00 סועדים 2 טלפון 052-1111111 הערה —/);
    assert.equal(await page.getAttribute('#waBtn','href'),'https://wa.me/972521111111');
    await page.click('#arrivedBtn');await page.waitForFunction(()=>!document.getElementById('overlay'));
    await page.waitForFunction(()=>document.querySelector('#plan .tbl[data-table="1"]').classList.contains('arrived'),null,{timeout:10000});
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='set_arrived').map(o=>o.args)),[{p_id:1,p_arrived:true}]);
    assert.match((await sheetRows(page))[0],/רון הגיעו ✓/);await ctx.close();
  });
  test('moving a booking: choose "move", then tap a free table',async()=>{
    const {page,ctx}=await openAdmin();
    await openRow(page,1);await page.click('#moveBtn');
    await page.waitForSelector('#moveBanner');
    assert.match(await text(page,'#moveBanner'),/בחרו שולחן חדש עבור רון \(2 סועדים\)/);
    assert.equal(await page.evaluate(()=>document.querySelector('#plan .tbl[data-table="2"]').classList.contains('target')),true);
    await page.click('#plan .tbl[data-table="2"]');await page.waitForSelector('#toast');
    assert.equal(await text(page,'#toast'),'ההזמנה הועברה.');
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='move_booking').map(o=>o.args)),[{p_id:1,p_table:2}]);
    await page.waitForFunction(()=>!document.getElementById('moveBanner'));
    assert.deepEqual((await sheetRows(page)).slice(0,2),['1','2 רון 19:00 2']);await ctx.close();
  });
  test('moving onto a taken table is refused; a different-size table is allowed with a warning',async()=>{
    const rows=[...reservations,{id:3,reservation_date:'2026-11-22',arrival_time:'20:00:00',customer_name:'דן',phone:'050-3',guests:4,note:null,assigned_table_id:4,assigned_kind:'table',status:'confirmed'}];
    const {page,ctx}=await openAdmin(rows);
    await openRow(page,1);await page.click('#moveBtn');await page.waitForSelector('#moveBanner');
    await page.click('#sheet tr[data-table="4"]');await page.waitForSelector('#toast');
    assert.equal(await text(page,'#toast'),'השולחן הזה תפוס.');
    await openRow(page,1);await page.click('#moveBtn');await page.waitForSelector('#moveBanner');
    await page.click('#plan .tbl[data-table="7"]');
    await page.waitForFunction(()=>/בגודל אחר/.test(document.getElementById('toast')?.textContent||''),null,{timeout:10000});
    await page.click('#moveCancel').catch(()=>{});await ctx.close();
  });
  test('tapping a free table adds a booking there (phone, WhatsApp or walk-in)',async()=>{
    const {page,ctx}=await openAdmin();
    await page.click('#plan .tbl[data-table="3"]');await page.waitForSelector('#addForm');
    assert.equal(await page.inputValue('#addTable'),'3');
    await page.fill('#addName','משה');await page.fill('#addPhone','050-9999999');
    await page.selectOption('#addTime','20:15');await page.selectOption('#addGuests','4');await page.fill('#addNote','טלפון');
    await page.click('#addSave');await page.waitForSelector('#toast');
    assert.equal(await text(page,'#toast'),'ההזמנה נשמרה.');
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='manager_add_booking').map(o=>o.args)),
      [{p_date:'2026-11-22',p_time:'20:15',p_name:'משה',p_phone:'050-9999999',p_guests:4,p_note:'טלפון',p_table:3}]);
    await page.waitForFunction(()=>/משה/.test(document.getElementById('sheet').innerText));
    assert.equal((await sheetRows(page))[2],'3 משה 20:15 4 טלפון');await ctx.close();
  });
  test('"+ הזמנה חדשה" places automatically; a taken table and a bad phone are explained',async()=>{
    const {page,ctx}=await openAdmin();
    await page.click('#addBtn');await page.waitForSelector('#addForm');
    assert.equal(await page.inputValue('#addTable'),'');
    await page.fill('#addPhone','abc');await page.click('#addSave');
    assert.match(await text(page,'#addError'),/מספר הטלפון לא תקין/);
    await page.fill('#addPhone','');await page.selectOption('#addTable','1');await page.click('#addSave');
    await page.waitForFunction(()=>!document.getElementById('addError').hidden&&/תפוס/.test(document.getElementById('addError').textContent));
    await page.selectOption('#addTable','');await page.click('#addSave');await page.waitForSelector('#toast');
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='manager_add_booking').map(o=>[o.args.p_table,o.args.p_name])),[[1,''],[null,'']]);
    await ctx.close();
  });
  test('the bar shows its bookings and can take another',async()=>{
    const {page,ctx}=await openAdmin();
    await page.click('#plan .bar-hit');await page.waitForSelector('#panel');
    assert.match(await text(page,'#panel'),/בר 3 מתוך 12 מקומות תפוסים 18:00 מאיה 3 סועדים/);
    await page.click('#barAdd');await page.waitForSelector('#addForm');
    assert.equal(await page.inputValue('#addTable'),'8');await ctx.close();
  });
  test('cancelling a booking asks first; no keeps it, yes cancels it',async()=>{
    for(const [dismiss,expected] of [[true,'confirmed'],[false,'cancelled']]){
      const {page,ctx,dialogs}=await openAdmin(reservations,{dismissDialogs:dismiss});
      await openRow(page,1);await page.click('#cancelBtn');await page.waitForTimeout(300);
      assert.deepEqual(dialogs,['לבטל את ההזמנה הזו?']);
      assert.equal(await page.evaluate(()=>__db.reservations.find(r=>r.id===1).status),expected);await ctx.close();
    }
  });
  test('a booking whose name or note contains code is shown as plain text, never run',async()=>{
    const evil=[{id:9,reservation_date:'2026-11-22',arrival_time:'20:00:00',customer_name:'<img src=x onerror="window.__pwned=1">',
      phone:'<b>050</b>',guests:2,note:'<script>window.__pwned=2</script>',assigned_table_id:1,assigned_kind:'table',status:'confirmed'}];
    const {page,ctx,errors}=await openAdmin(evil);
    const t=await text(page,'#sheet');
    assert.ok(t.includes('<img src=x onerror="window.__pwned=1">')&&t.includes('<script>window.__pwned=2</script>'));
    await openRow(page,9);
    assert.ok((await text(page,'#panel')).includes('<b>050</b>'));
    assert.equal(await page.evaluate(()=>[window.__pwned,document.querySelectorAll('#listContent img,#listContent script,#panel b').length].join()),',0');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  const pendingRow={id:5,reservation_date:'2026-11-22',arrival_time:'19:30:00',customer_name:'נועה',phone:'052-3333333',guests:4,note:null,assigned_table_id:4,assigned_kind:'table',status:'pending',access_token:'aaaaaaaa-2222-4333-8444-555555555555'};
  test('requests waiting for approval are listed first, with approve and decline',async()=>{
    const {page,ctx,errors}=await openAdmin([...reservations,pendingRow]);
    assert.equal(await text(page,'#summary'),'2 הזמנות · 5 סועדים · 1 ממתינות לאישור');
    assert.match(await text(page,'.pending-card'),/19:30 נועה · שולחן 4 4 · 052-3333333 אישור דחייה/);
    assert.match((await sheetRows(page))[3],/^4 נועה ממתין 19:30 4$/);
    const href=await page.getAttribute('.pending-card .approve-btn','href');
    assert.ok(href.startsWith('https://wa.me/972523333333?text='));
    assert.match(decodeURIComponent(href),/שלום נועה, ההזמנה שלך לעיזה בר אושרה ✳\n22\.11\.2026 בשעה 19:30, שולחן ל-4\.\nנחכה עד 15 דקות משעת ההזמנה\. מחכים לך!\nלצפייה, שינוי או ביטול: http:\/\/localhost:\d+\/booking\.html#aaaaaaaa-2222-4333-8444-555555555555$/);
    assert.match(decodeURIComponent(await page.getAttribute('.pending-card .decline-link','href')),/מצטערים, לא נוכל לאשר את ההזמנה ל-22\.11\.2026 בשעה 19:30/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('approving opens WhatsApp and moves the request to the confirmed list',async()=>{
    const {page,ctx}=await openAdmin([pendingRow]);
    const [wa]=await Promise.all([ctx.waitForEvent('page'),page.click('.pending-card .approve-btn')]);   // WhatsApp opens (the address is checked above; the internet is off in tests)
    assert.ok(wa);
    await page.waitForFunction(()=>__db.reservations[0].status==='confirmed',null,{timeout:10000});
    await page.waitForFunction(()=>/^1 הזמנות/.test(document.getElementById('summary')?.textContent||''),null,{timeout:10000});
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.fn).map(o=>[o.fn,o.body])),[['notify-booking',{id:5,result:'confirmed'}]]);
    assert.equal(await text(page,'#summary'),'1 הזמנות · 4 סועדים');
    assert.equal(await page.isVisible('.pending-card'),false);await ctx.close();
  });
  test('a request can also be approved from its table on the plan',async()=>{
    const {page,ctx}=await openAdmin([pendingRow]);
    await page.click('#plan .tbl[data-table="4"]');await page.waitForSelector('#panel');
    assert.match(await text(page,'#panel'),/שולחן 4 · נועה ממתינה לאישור/);
    const opened=ctx.waitForEvent('page',{timeout:10000});
    await page.click('#panel .approve-btn');await opened;
    await page.waitForFunction(()=>__db.reservations[0].status==='confirmed',null,{timeout:10000});await ctx.close();
  });
  test('declining asks first; yes frees the table, no keeps the request',async()=>{
    for(const [dismiss,expected] of [[false,'declined'],[true,'pending']]){
      const {page,ctx,dialogs}=await openAdmin([pendingRow],{dismissDialogs:dismiss});
      const popups=[];ctx.on('page',p=>popups.push(p));
      // wait for the WhatsApp window when declining (slow machines need more than a fixed pause)
      const opened=dismiss?null:ctx.waitForEvent('page',{timeout:10000});
      await page.click('.pending-card .decline-link');
      if(opened)await opened;
      await page.waitForFunction(s=>__db.reservations[0].status===s,expected,{timeout:10000});
      await page.waitForTimeout(300);
      assert.deepEqual(dialogs,['לדחות את הבקשה? השולחן ישתחרר.']);
      assert.equal(popups.length,dismiss?0:1,'WhatsApp opens only when declining');await ctx.close();
    }
  });
  test('the manager page picks up new requests by itself',async()=>{
    const {page,ctx}=await openAdmin();
    assert.equal(await page.isVisible('.pending-card'),false);
    await page.evaluate(r=>{__db.reservations.push(r);document.dispatchEvent(new Event('visibilitychange'));},pendingRow);
    await page.waitForSelector('.pending-card');await ctx.close();
  });
  test('a change waiting for approval shows what changed; declining keeps the original',async()=>{
    const change={...pendingRow,arrival_time:'20:30:00',guests:5,prev:{reservation_date:'2026-11-22',arrival_time:'19:00:00',guests:2,assigned_table_id:1,assigned_kind:'table'}};
    const {page,ctx,dialogs}=await openAdmin([change]);
    assert.match(await text(page,'.pending-card'),/שינוי מבוקש: 19:00 · 2 סועדים ← 20:30 · 5 סועדים/);
    assert.match(decodeURIComponent(await page.getAttribute('.pending-card .approve-btn','href')),/השינוי בהזמנה שלך לעיזה בר אושר ✳\n22\.11\.2026 בשעה 20:30, שולחן ל-5/);
    assert.match(decodeURIComponent(await page.getAttribute('.pending-card .decline-link','href')),/לא נוכל לאשר את השינוי.*ההזמנה המקורית שלך בתוקף: 22\.11\.2026 בשעה 19:00, שולחן ל-2\./);
    const opened=ctx.waitForEvent('page',{timeout:10000});
    await page.click('.pending-card .decline-link');await opened;
    assert.deepEqual(dialogs,['לדחות את השינוי? ההזמנה המקורית תישאר בתוקף.']);
    await page.waitForFunction(()=>__db.reservations[0].status==='confirmed',null,{timeout:10000});
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='decide_request').map(o=>o.args)),[{p_id:5,p_approve:false}]);
    // the customer's phone is notified too (server function notify-booking)
    await page.waitForFunction(()=>__ops.some(o=>o.fn==='notify-booking'),null,{timeout:10000});
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.fn).map(o=>[o.fn,o.body])),[['notify-booking',{id:5,result:'reverted'}]]);
    assert.equal(await page.evaluate(()=>__db.reservations[0].arrival_time),'19:00:00');await ctx.close();
  });
  test('customer changes and cancellations are marked',async()=>{
    const rows=[{...reservations[0],changed_at:'2026-11-21T10:00:00Z'},
      {id:7,reservation_date:'2026-11-22',arrival_time:'20:00:00',customer_name:'יוסי',phone:'050-7777777',guests:2,note:null,assigned_table_id:2,assigned_kind:'table',status:'cancelled',cancelled_by:'customer'},
      {id:8,reservation_date:'2026-11-22',arrival_time:'20:00:00',customer_name:'מנהל ביטל',phone:'050-8888888',guests:2,note:null,assigned_table_id:3,assigned_kind:'table',status:'cancelled',cancelled_by:null}];
    const {page,ctx}=await openAdmin(rows);
    assert.equal(await text(page,'#summary'),'1 הזמנות · 2 סועדים');
    assert.equal((await sheetRows(page))[0],'1 רון שונתה ע״י הלקוח 19:00 2');
    assert.match(await text(page,'.cancelled-card'),/20:00 יוסי · שולחן 2/);
    assert.doesNotMatch(await text(page,'#listContent'),/מנהל ביטל/);await ctx.close();
  });
  test('Israeli phone numbers become WhatsApp numbers',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING});
    assert.deepEqual(await page.evaluate(()=>['052-3333333','+972 52-333-3333','(052) 333 3333'].map(waNumber)),['972523333333','972523333333','972523333333']);
    await ctx.close();
  });
  test('if the bookings cannot be loaded, a message and a retry button are shown',async()=>{
    const {page,ctx}=await openAdmin(reservations,{cfg:{reservations,failTables:['reservations']}});
    assert.match(await text(page,'#listContent'),/ההזמנות לא נטענו/);
    await page.evaluate(()=>{__cfg.failTables=[];});
    await page.click('#retryBtn');await page.waitForSelector('#summary');
    assert.equal(await text(page,'#summary'),'2 הזמנות · 5 סועדים');await ctx.close();
  });
});

describe('personal booking page (booking.html#secret)',()=>{
  // Owner, Nov 2026: the number of guests is never changed for the customer; a message explains the bar's limit
  test('a change can switch between table and bar; a group over 4 is told, and its number is kept',async()=>{
    const T='11111111-2222-4333-8444-555555555555';
    const {page,ctx,errors}=await open({time:MORNING,file:'booking.html#'+T,cfg:{bookings:[{access_token:T,id:7,status:'confirmed',
      reservation_date:'2026-11-25',arrival_time:'19:00:00',customer_name:'דנה',guests:6,note:null,can_change:true,can_cancel:true,seating:'table'}]}});
    await page.waitForSelector('#seatingInput');
    assert.equal(await page.inputValue('#seatingInput'),'table');
    assert.equal(await page.isVisible('#barLimit'),false);
    await page.selectOption('#seatingInput','bar');
    assert.equal(await page.inputValue('#guestsInput'),'6','the number is not changed');
    assert.equal(await text(page,'#barLimit'),'בבר אפשר עד 4 סועדים. הקטינו את מספר הסועדים או בחרו שולחן.');
    assert.equal(await page.isDisabled('#saveChange'),true);
    // choosing a table again, or fewer guests, clears the message
    await page.selectOption('#seatingInput','table');
    assert.equal(await page.isVisible('#barLimit'),false);assert.equal(await page.isEnabled('#saveChange'),true);
    await page.selectOption('#seatingInput','bar');await page.selectOption('#guestsInput','4');
    assert.equal(await page.isVisible('#barLimit'),false);
    await page.click('#saveChange');await page.waitForSelector('#msg');
    const [call]=await rpcCalls(page,'change_booking');
    assert.deepEqual(call.args,{p_token:T,p_date:'2026-11-25',p_time:'19:00',p_guests:4,p_seating:'bar'});
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.match(await page.getAttribute('#cardPreview','alt'),/דנה, בבר, ל-4 סועדים/);
    assert.equal(await page.inputValue('#seatingInput'),'bar');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('changing to a table when none is left says the bar has room',async()=>{
    const T='11111111-2222-4333-8444-555555555555';
    const {page,ctx}=await open({time:MORNING,file:'booking.html#'+T,cfg:{changeResult:'bar_available',bookings:[{access_token:T,id:7,status:'confirmed',
      reservation_date:'2026-11-25',arrival_time:'19:00:00',customer_name:'דנה',guests:2,note:null,can_change:true,can_cancel:true,seating:'bar'}]}});
    await page.waitForSelector('#seatingInput');
    await page.selectOption('#seatingInput','table');await page.click('#saveChange');await page.waitForSelector('#msg');
    assert.match(await text(page,'#msg'),/אין שולחן פנוי בשינוי הזה, אבל יש מקום בבר/);await ctx.close();
  });
  test('a bar booking says "בבר", and a change onto an evening already booked is explained',async()=>{
    const T='11111111-2222-4333-8444-555555555555';
    const {page,ctx,errors}=await open({time:MORNING,file:'booking.html#'+T,cfg:{changeResult:'duplicate',bookings:[{access_token:T,id:7,status:'confirmed',
      reservation_date:'2026-11-25',arrival_time:'19:00:00',customer_name:'דנה',guests:2,note:null,can_change:true,can_cancel:true,seating:'bar'}]}});
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.match(await page.getAttribute('#cardPreview','alt'),/דנה, בבר, ל-2 סועדים/);
    assert.equal(await page.inputValue('#seatingInput'),'bar');
    await page.fill('#dateInput','2026-11-26');await page.click('#saveChange');await page.waitForSelector('#msg');
    assert.match(await text(page,'#msg'),/כבר יש הזמנה אחרת על מספר הטלפון הזה בערב הזה/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  const TOKEN='11111111-2222-4333-8444-555555555555';
  const bk=(extra={})=>({access_token:TOKEN,id:101,status:'confirmed',reservation_date:'2026-11-25',arrival_time:'19:00:00',
    customer_name:'דנה כהן',guests:3,note:'יום הולדת',cancelled_by:null,can_change:true,can_cancel:true,...extra});
  const openBooking=(extra,opts={})=>open({file:'booking.html#'+(opts.token||TOKEN),time:MORNING,cfg:{bookings:[bk(extra)]},...opts});
  const BAR_WA='https://wa.me/972587460202';

  test('shows the booking card, its status and the comment',async()=>{
    const {page,ctx,errors}=await openBooking();
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.equal(await text(page,'#statusLabel'),'ההזמנה אושרה');
    assert.equal(await page.getAttribute('#cardPreview','alt'),'ההזמנה אושרה: דנה כהן, שולחן ל-3 סועדים, 25.11 בשעה 19:00');
    assert.equal(await page.inputValue('#noteInput'),'יום הולדת');
    assert.ok((await page.getAttribute('#barWa','href')).startsWith(BAR_WA+'?text='));
    assert.match(decodeURIComponent(await page.getAttribute('#sendLink','href')),/^https:\/\/wa\.me\/\?text=ההזמנה שלי לעיזה בר - 25\.11 בשעה 19:00\nלצפייה, שינוי או ביטול: http:\/\/localhost:\d+\/booking\.html#11111111-2222-4333-8444-555555555555$/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('opening the link once makes the phone remember the booking; cancelling forgets it',async()=>{
    const {page,ctx}=await openBooking({},{dismissDialogs:false});
    await page.waitForSelector('#cancelBtn');
    const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('izabar_my_bookings')||'[]'));
    assert.deepEqual(await saved(),[{token:TOKEN,date:'2026-11-25',time:'19:00',guests:3}]);
    await page.click('#cancelBtn');await page.waitForSelector('.closed-box');
    assert.deepEqual(await saved(),[]);await ctx.close();
  });
  test('date, time and guests can be changed (confirmed at once)',async()=>{
    const {page,ctx}=await openBooking();
    await page.waitForSelector('#saveChange');
    assert.deepEqual(await page.evaluate(()=>[dateInput.value,dateInput.min,dateInput.max,timeInput.value,guestsInput.value]),
      ['2026-11-25','2026-11-22','2026-12-22','19:00','3']);
    assert.deepEqual(await page.evaluate(()=>[...timeInput.options].map(o=>o.value).join(' ')),
      '17:00 17:15 17:30 17:45 18:00 18:15 18:30 18:45 19:00 19:15 19:30 19:45 20:00 20:15 20:30 20:45 21:00');
    await page.fill('#dateInput','2026-11-26');await page.dispatchEvent('#dateInput','change');
    await page.selectOption('#timeInput','20:30');await page.selectOption('#guestsInput','4');
    await page.click('#saveChange');await page.waitForSelector('#msg');
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='change_booking').map(o=>o.args)),[{p_token:TOKEN,p_date:'2026-11-26',p_time:'20:30',p_guests:4,p_seating:'table'}]);
    assert.match(await text(page,'#msg'),/השינוי נשמר ואושר/);
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.equal(await page.getAttribute('#cardPreview','alt'),'ההזמנה אושרה: דנה כהן, שולחן ל-4 סועדים, 26.11 בשעה 20:30');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('izabar_my_bookings'))[0].time),'20:30');await ctx.close();
  });
  test('a same-day change after 16:00 waits for approval and shows the kept original',async()=>{
    const {page,ctx}=await openBooking({},{cfg:{bookings:[bk()],changeResult:'pending'}});
    await page.waitForSelector('#saveChange');await page.selectOption('#guestsInput','5');await page.click('#saveChange');
    await page.waitForSelector('#pendingNote');
    assert.match(await text(page,'#msg'),/השינוי נשלח לאישור\. נעדכן אתכם בוואטסאפ\. עד אז ההזמנה המקורית שמורה לכם/);
    assert.match(await text(page,'#pendingNote'),/אם לא יאושר, נשארת ההזמנה המקורית: 25\.11 בשעה 19:00, 3 סועדים/);
    assert.equal(await text(page,'#statusLabel'),'ממתינה לאישור');await ctx.close();
  });
  test('if nothing fits, the change is refused and the booking stays as it was',async()=>{
    const {page,ctx}=await openBooking({},{cfg:{bookings:[bk()],changeResult:'full'}});
    await page.waitForSelector('#saveChange');await page.selectOption('#guestsInput','10');await page.click('#saveChange');
    await page.waitForSelector('#msg');
    assert.match(await text(page,'#msg'),/אין מקום מתאים בשינוי הזה\. ההזמנה נשארה כמו שהייתה/);
    assert.equal(await page.inputValue('#guestsInput'),'3');await ctx.close();
  });
  test('for today, only arrival times at least 30 minutes ahead are offered',async()=>{
    const {page,ctx}=await openBooking({reservation_date:'2026-11-22',arrival_time:'20:00:00'},{time:'2026-11-22T18:40:00+02:00'});
    await page.waitForSelector('#saveChange');
    assert.equal(await page.evaluate(()=>[...timeInput.options].map(o=>o.value).join(' ')),'19:15 19:30 19:45 20:00 20:15 20:30 20:45 21:00');
    await ctx.close();
  });
  // a phone that can receive notifications (Android): fake the browser's notification parts
  const fakePush=permission=>`(()=>{window.__subs=[];
    Object.defineProperty(window,'Notification',{value:{requestPermission:async()=>'${permission}'},configurable:true});
    const reg={pushManager:{getSubscription:async()=>null,subscribe:async o=>{window.__subs.push(o.applicationServerKey.length);
      return {toJSON:()=>({endpoint:'https://push.example/abc',keys:{p256dh:'p'.repeat(40),auth:'a'.repeat(16)}})};}}};
    Object.defineProperty(navigator,'serviceWorker',{value:{register:async f=>{window.__sw=f;return reg;},ready:Promise.resolve(reg)},configurable:true});
    window.PushManager=window.PushManager||function(){};})()`;
  test('while waiting for approval, the customer can turn on a notification',async()=>{
    const {page,ctx,errors}=await openBooking({status:'pending'},{init:fakePush('granted')});
    await page.waitForSelector('#pushBtn');await page.click('#pushBtn');
    await page.waitForSelector('#pushOn');
    assert.match(await text(page,'#msg'),/מעולה! תקבלו התראה כשנאשר/);
    assert.equal(await page.evaluate(()=>window.__sw),'sw.js');
    assert.deepEqual(await page.evaluate(()=>window.__subs),[65],'the public key is the 65-byte notification key');
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='save_push_subscription').map(o=>o.args)),
      [{p_token:TOKEN,p_endpoint:'https://push.example/abc',p_p256dh:'p'.repeat(40),p_auth:'a'.repeat(16)}]);
    await page.reload();await page.waitForSelector('#pushOn');     // remembered on this phone
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('if notifications are blocked, the customer is told WhatsApp still works',async()=>{
    const {page,ctx}=await openBooking({status:'pending'},{init:fakePush('denied')});
    await page.waitForSelector('#pushBtn');await page.click('#pushBtn');await page.waitForSelector('#msg');
    assert.match(await text(page,'#msg'),/ההתראות חסומות בטלפון.*נעדכן אתכם גם בוואטסאפ/);
    assert.equal(await page.evaluate(()=>__ops.filter(o=>o.rpc==='save_push_subscription').length),0);await ctx.close();
  });
  test('a confirmed booking offers a reminder 2 hours before; an iPhone without the home screen gets a hint',async()=>{
    const confirmed=await openBooking({},{init:fakePush('granted')});
    await confirmed.page.waitForSelector('#pushBtn');
    assert.equal(await text(confirmed.page,'#pushBtn'),'🔔 קבלו תזכורת שעתיים לפני');
    await confirmed.page.click('#pushBtn');await confirmed.page.waitForSelector('#pushOn');
    assert.match(await text(confirmed.page,'#msg'),/מעולה! תקבלו תזכורת בטלפון כשעתיים לפני ההגעה/);
    assert.equal(await text(confirmed.page,'#pushOn'),'🔔 תקבלו תזכורת בטלפון כשעתיים לפני ההגעה.');await confirmed.ctx.close();
    const past=await openBooking({can_change:false,can_cancel:false},{init:fakePush('granted')});      // the day is over: nothing to remind
    await past.page.waitForSelector('#statusLabel');
    assert.equal(await past.page.isVisible('#pushBtn'),false);await past.ctx.close();
    const iphone=await openBooking({status:'pending'},{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      init:()=>{delete window.PushManager;}});
    await iphone.page.waitForSelector('#pushIphone');
    assert.match(await text(iphone.page,'#pushIphone'),/מוסיפים את האתר למסך הבית/);await iphone.ctx.close();
  });
  test('the notification helper shows the bar\'s answer and opens the booking when tapped',async()=>{
    const {page,ctx}=await openBooking();
    const r=await page.evaluate(async()=>{
      const handlers={},shown=[],opened=[];
      const self={addEventListener:(n,f)=>handlers[n]=f,registration:{showNotification:async(t,o)=>shown.push([t,o])},clients:{openWindow:async u=>opened.push(u)}};
      new Function('self',await (await fetch('sw.js')).text())(self);
      let wait;handlers.push({data:{json:()=>({title:'ההזמנה שלך לעיזה בר אושרה ✳',body:'25.11 בשעה 19:00',url:'https://x/booking.html#t'})},waitUntil:p=>wait=p});await wait;
      handlers.notificationclick({notification:{close(){},data:{url:'https://x/booking.html#t'}},waitUntil:p=>wait=p});await wait;
      return {shown,opened};});
    assert.deepEqual(r,{shown:[['ההזמנה שלך לעיזה בר אושרה ✳',{body:'25.11 בשעה 19:00',dir:'rtl',lang:'he',data:{url:'https://x/booking.html#t'}}]],opened:['https://x/booking.html#t']});
    await ctx.close();
  });
  test('a request waiting for approval says so',async()=>{
    const {page,ctx}=await openBooking({status:'pending'});
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.equal(await text(page,'#statusLabel'),'ממתינה לאישור');await ctx.close();
  });
  test('the comment can be changed and saved',async()=>{
    const {page,ctx}=await openBooking();
    await page.fill('#noteInput','כיסא תינוק');await page.click('#saveNote');
    await page.waitForSelector('#msg');
    assert.match(await text(page,'#msg'),/ההערה נשמרה/);
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.rpc==='update_booking_note').map(o=>o.args)),[{p_token:TOKEN,p_note:'כיסא תינוק'}]);
    assert.equal(await page.inputValue('#noteInput'),'כיסא תינוק');await ctx.close();
  });
  test('cancelling asks first; yes cancels, no keeps the booking',async()=>{
    for(const [dismiss,status] of [[true,'confirmed'],[false,'cancelled']]){
      const {page,ctx,dialogs}=await openBooking({},{dismissDialogs:dismiss});
      await page.waitForSelector('#cancelBtn');await page.click('#cancelBtn');await page.waitForTimeout(300);
      assert.deepEqual(dialogs,['לבטל את ההזמנה? השולחן ישתחרר.']);
      assert.equal(await page.evaluate(()=>__db.bookings[0].status),status);
      if(!dismiss){
        assert.match(await text(page,'.page'),/ההזמנה בוטלה.*נשמח לראות אתכם בפעם אחרת/);
        assert.equal(await page.isVisible('#cancelBtn'),false);assert.equal(await page.isVisible('#noteInput'),false);
      }
      await ctx.close();
    }
  });
  test('less than an hour before arrival, changes are closed but cancelling still works',async()=>{
    const {page,ctx}=await openBooking({can_change:false});
    await page.waitForSelector('#cancelBtn');
    assert.equal(await page.isVisible('#noteInput'),false);
    assert.equal(await page.isVisible('#saveChange'),false);
    assert.match(await text(page,'.note-view'),/יום הולדת/);
    assert.match(await text(page,'.page'),/אפשר לשנות פרטים עד שעה לפני ההגעה\. לשינויים כתבו לנו בוואטסאפ/);await ctx.close();
  });
  test('a declined request shows a clear message and no buttons to change it',async()=>{
    const {page,ctx}=await openBooking({status:'declined',can_change:false,can_cancel:false});
    await page.waitForSelector('.closed-box');
    assert.match(await text(page,'.closed-box'),/הבקשה לא אושרה דנה כהן, שולחן ל-3 סועדים 25\.11 בשעה 19:00/);
    assert.equal(await page.isVisible('#cancelBtn'),false);assert.equal(await page.isVisible('#cardPreview'),false);await ctx.close();
  });
  test('a wrong or broken link shows "not found" and asks nothing of the database for nonsense',async()=>{
    const wrong=await openBooking({},{token:'99999999-2222-4333-8444-555555555555'});
    assert.match(await text(wrong.page,'.page'),/ההזמנה לא נמצאה/);await wrong.ctx.close();
    const broken=await openBooking({},{token:'abc'});
    assert.match(await text(broken.page,'.page'),/ההזמנה לא נמצאה/);
    assert.deepEqual(await broken.page.evaluate(()=>__ops.filter(o=>o.rpc)),[]);await broken.ctx.close();
  });
  test('the status updates by itself when the bar answers',async()=>{
    const {page,ctx}=await openBooking({status:'pending'});
    await page.waitForSelector('#statusLabel');
    await page.evaluate(()=>{__db.bookings[0].status='confirmed';document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>document.getElementById('statusLabel').textContent==='ההזמנה אושרה',null,{timeout:10000});
    await ctx.close();
  });
  test('names and comments with code are shown as plain text',async()=>{
    const {page,ctx,errors}=await openBooking({customer_name:'<img src=x onerror="window.__pwned=1">',note:'</textarea><img src=x onerror="window.__pwned=2">',can_change:false});
    await page.waitForSelector('.note-view');
    assert.equal(await page.evaluate(()=>[window.__pwned,document.querySelectorAll('img:not(#cardPreview):not(.venue-logo)').length].join()),',0');
    assert.deepEqual(errors,[]);await ctx.close();
  });
});
