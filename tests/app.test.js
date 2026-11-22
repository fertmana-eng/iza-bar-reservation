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

// Walk through the booking steps up to the summary screen
async function fillBooking(page,{date='2026-11-25',extraGuests=1,laterBy=1}={}){
  await page.click('#introNext');
  await page.click(`.cal-grid button[data-date="${date}"]`);
  await page.click('#dateNext');await page.waitForSelector('#guestsNext');
  for(let i=0;i<extraGuests;i++)await page.click('#guestsPlus');
  await page.click('#guestsNext');await page.waitForSelector('#timeNext');
  for(let i=0;i<laterBy;i++)await page.click('#timePlus');
  await page.click('#timeNext');
  await page.fill('#nameInput','דנה כהן');await page.fill('#phoneInput','050-1234567');
  await page.click('#detailsForm button[type=submit]');await page.waitForSelector('#submitBtn');
}

describe('customer booking page',()=>{
  test('opens on the welcome text with a start button',async()=>{
    const {page,ctx,errors}=await open({time:MORNING});
    assert.match(await text(page,'#stepArea'),/איזה כיף שחשבתם עלינו/);
    await page.click('#introNext');
    assert.match(await text(page,'#stepArea'),/מתי מגיעים\?/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a full booking sends the right details and shows the confirmation',async()=>{
    const {page,ctx,errors}=await open({time:MORNING});
    await fillBooking(page);
    assert.match(await text(page,'.summary-box'),/25\.11.*17:15.*3.*דנה כהן.*050-1234567/);
    await page.fill('#noteInput','יום הולדת');
    await page.click('#submitBtn');await page.waitForSelector('.success');
    const [call]=await rpcCalls(page,'book_reservation');
    assert.deepEqual(call.args,{p_date:'2026-11-25',p_time:'17:15',p_name:'דנה כהן',p_phone:'050-1234567',p_guests:3,p_note:'יום הולדת'});
    // the confirmation is the booking card picture only (owner's request), described for screen readers
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.equal(await page.getAttribute('#cardPreview','alt'),'ההזמנה אושרה: דנה כהן, שולחן ל-3 סועדים, 25.11 בשעה 17:15');
    assert.equal(await text(page,'.success'),'');
    assert.ok(await page.isVisible('.btn-whatsapp'));assert.ok(await page.isVisible('#icsBtn'));
    assert.equal((await page.evaluate(()=>__ops.filter(o=>o.fn))).length,0,'no email is requested');
    assert.deepEqual(errors,[]);await ctx.close();
  });
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
    assert.match(decodeURIComponent(href),/אישור הזמנה - עיזה בר\nדנה כהן, שולחן ל-3 סועדים\n25\.11 בשעה 17:15\nלצפייה, שינוי או ביטול: http:\/\/localhost:\d+\/booking\.html#11111111/);
    await ctx.close();
  });
  // Same-day rules by the hour of booking (owner, Nov 2026): before 16:00 confirmed,
  // 16:00-20:00 waits for approval, from 20:00 closed; arrivals at least 30 minutes ahead.
  test('the welcome text explains the same-day rules',async()=>{
    const {page,ctx}=await open({time:MORNING});
    assert.match(await text(page,'#stepArea'),/עד 16:00 ההזמנה מאושרת מיד\. בין 16:00 ל-20:00 נאשר אותה מולכם בוואטסאפ\. אחרי 20:00 כבר לא ניתן להזמין להיום/);
    await ctx.close();
  });
  test('for today, the earliest arrival is 30 minutes from now, rounded up to a quarter hour',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T18:40:00+02:00'});
    await page.click('#introNext');await page.click('.cal-grid button[data-date="2026-11-22"]');await page.click('#dateNext');
    await page.waitForSelector('#guestsNext');await page.click('#guestsNext');await page.waitForSelector('#timeNext');
    assert.equal(await text(page,'#timeValue'),'19:15');
    assert.equal(await page.isDisabled('#timeMinus'),true);
    assert.match(await text(page,'.hint'),/בין 19:15 ל-21:00/);
    // another day starts at the usual 17:00
    await page.click('.progress .step-chip.done[data-step="0"]');await page.click('.cal-grid button[data-date="2026-11-23"]');
    await page.click('#dateNext');await page.waitForSelector('#guestsNext');await page.click('#guestsNext');await page.waitForSelector('#timeNext');
    assert.equal(await text(page,'#timeValue'),'19:15','keeps the chosen time');
    await page.click('#timeMinus');await page.click('#timeMinus');await page.click('#timeMinus');await page.click('#timeMinus');await page.click('#timeMinus');await page.click('#timeMinus');await page.click('#timeMinus');await page.click('#timeMinus');await page.click('#timeMinus');
    assert.equal(await text(page,'#timeValue'),'17:00');await ctx.close();
  });
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
  test('the phone remembers its bookings: "my bookings" on the welcome screen',async()=>{
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
    assert.equal(url.searchParams.get('text'),'עיזה בר - שולחן ל-3');
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
    for(const line of ['BEGIN:VCALENDAR','PRODID:','UID:','DTSTAMP:','SUMMARY:עיזה בר - שולחן ל-3','LOCATION:עיזה בר','END:VCALENDAR'])assert.ok(ics.includes(line),line);
    // summer time: Israel is 3 hours ahead
    assert.equal(await page.evaluate(()=>israelToUtc('20260610T170000')),'20260610T140000Z');
    await ctx.close();
  });
  test('a name or note containing code is shown as plain text, never run',async()=>{
    const {page,ctx,errors}=await open({time:MORNING});
    const evil='"><img src=x onerror="window.__pwned=1">';
    await page.click('#introNext');await page.click('.cal-grid button[data-date="2026-11-25"]');
    await page.click('#dateNext');await page.waitForSelector('#guestsNext');await page.click('#guestsNext');
    await page.waitForSelector('#timeNext');await page.click('#timeNext');
    await page.fill('#nameInput',evil);await page.fill('#phoneInput','050-1234567');
    await page.click('#detailsForm button[type=submit]');await page.waitForSelector('#submitBtn');
    await page.fill('#noteInput','</textarea><img src=x onerror="window.__pwned=2">');
    await page.click('.summary-row[data-step="3"]');                 // back to the details step and forward again
    assert.equal(await page.inputValue('#nameInput'),evil);
    await page.click('#detailsForm button[type=submit]');await page.waitForSelector('#submitBtn');
    assert.ok((await text(page,'.summary-box')).includes(evil));
    await page.click('#submitBtn');await page.waitForSelector('#cardPreview:not([hidden])');
    assert.ok((await page.getAttribute('#cardPreview','alt')).includes(evil));
    assert.equal(await page.evaluate(()=>[window.__pwned,document.querySelectorAll('img:not(#cardPreview)').length].join()),',0');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('a wrong phone number is explained before anything is sent',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await page.click('#introNext');await page.click('.cal-grid button[data-date="2026-11-25"]');
    await page.click('#dateNext');await page.waitForSelector('#guestsNext');await page.click('#guestsNext');
    await page.waitForSelector('#timeNext');await page.click('#timeNext');
    await page.fill('#nameInput','דנה');await page.fill('#phoneInput','abc');
    await page.click('#detailsForm button[type=submit]');
    assert.match(await text(page,'#detailsError'),/מספר הטלפון לא תקין/);
    await page.fill('#phoneInput','+972 50-123-4567');await page.click('#detailsForm button[type=submit]');await page.waitForSelector('#submitBtn');
    await page.click('#submitBtn');await page.waitForSelector('.success');
    await ctx.close();
  });
  test('if the database refuses the details, the customer is told to check them',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{bookResult:'invalid'}});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForTimeout(200);
    assert.match(await text(page,'#submitError'),/אחד הפרטים לא תקין/);
    assert.ok(await page.isEnabled('#submitBtn'));await ctx.close();
  });
  test('a date with no free places shows a message and stays on the calendar',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{spots:0}});
    await page.click('#introNext');await page.click('.cal-grid button[data-date="2026-11-25"]');
    await page.click('#dateNext');await page.waitForTimeout(200);
    assert.match(await text(page,'#stepArea'),/אין מקומות פנויים בתאריך הזה/);
    assert.ok(await page.isVisible('.cal-grid'));await ctx.close();
  });
  test('a group with no fitting place shows a message on the guests step',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{available:false}});
    await page.click('#introNext');await page.click('.cal-grid button[data-date="2026-11-25"]');
    await page.click('#dateNext');await page.waitForSelector('#guestsNext');
    await page.click('#guestsNext');await page.waitForTimeout(200);
    assert.match(await text(page,'#stepArea'),/אין מקום מתאים לקבוצה/);await ctx.close();
  });
  test('if the date fills up while booking, the customer is sent back to pick another date',async()=>{
    const {page,ctx}=await open({time:MORNING,cfg:{bookResult:'full'}});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForTimeout(300);
    assert.match(await text(page,'#stepArea'),/התאריך הזה התמלא בדיוק עכשיו/);
    assert.ok(await page.isVisible('.cal-grid'));await ctx.close();
  });
  test('from 20:00, today can no longer be booked',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T20:05:00+02:00'});
    await page.click('#introNext');
    assert.equal(await page.evaluate(()=>document.querySelector('.cal-grid button.today')?.dataset.date),'2026-11-22');
    await page.click('.cal-grid button[data-date="2026-11-22"]');await page.click('#dateNext');await page.waitForTimeout(200);
    assert.match(await text(page,'#stepArea'),/ההזמנות המקוונות ליום זה נסגרו/);
    assert.equal((await rpcCalls(page,'available_spots')).length,0);await ctx.close();
  });
  // Bug found Nov 2026: every calendar day was linked to the day before it
  // (dates went through UTC), so tapping 26 booked the 25th.
  const calendarDays=page=>page.evaluate(()=>[...document.querySelectorAll('.cal-grid button')]
    .map(b=>({n:+b.textContent,date:b.dataset.date,today:b.classList.contains('today')})));
  for(const [label,time,today] of [['in the morning','2026-11-22T10:00:00+02:00','2026-11-22'],['just after midnight','2026-11-23T00:30:00+02:00','2026-11-23']]){
    test(`each calendar day books that same date, and today is marked correctly (${label})`,async()=>{
      const {page,ctx}=await open({time});
      await page.click('#introNext');
      const days=await calendarDays(page);
      assert.deepEqual(days.filter(d=>+d.date.slice(8)!==d.n),[]);
      assert.deepEqual(days.filter(d=>d.today).map(d=>d.date),[today]);
      await page.click('.cal-grid button:has-text("26")');await page.click('#dateNext');await page.waitForTimeout(200);
      assert.equal((await rpcCalls(page,'available_spots'))[0].args.p_date,'2026-11-26');
      await ctx.close();
    });
  }
  test('a phone in another time zone still uses Israel time for today and the cutoff',async()=>{
    // 20:30 in Israel is 13:30 in New York: today is already closed in Israel
    const {page,ctx}=await open({time:'2026-11-22T20:30:00+02:00',timezoneId:'America/New_York'});
    await page.click('#introNext');
    assert.deepEqual((await calendarDays(page)).filter(d=>d.today).map(d=>d.date),['2026-11-22']);
    await page.click('.cal-grid button[data-date="2026-11-22"]');await page.click('#dateNext');await page.waitForTimeout(200);
    assert.match(await text(page,'#stepArea'),/ההזמנות המקוונות ליום זה נסגרו/);
    await ctx.close();
  });
  test('tapping a finished step in the progress line goes back to it',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);
    await page.click('.progress .step-chip.done[data-step="0"]');
    assert.match(await text(page,'#stepArea'),/מתי מגיעים\?/);
    assert.equal(await page.evaluate(()=>document.querySelector('.cal-grid button.selected')?.dataset.date),'2026-11-25');
    await ctx.close();
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
    await page.click('#loginBtn');await page.waitForSelector('#listContent .summary');
    assert.deepEqual(await page.evaluate(()=>__ops.filter(o=>o.auth)),[{auth:'signIn',email:'izabar@izabar.local'}]);
    assert.match(await text(page,'#listContent'),/הזמנות ל-22\.11\.2026/);
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

describe('manager page',()=>{
  const reservations=[
    {id:1,reservation_date:'2026-11-22',arrival_time:'19:00:00',customer_name:'רון',phone:'052-1111111',guests:2,note:null,assigned_table_id:1,assigned_kind:'table',status:'confirmed'},
    {id:2,reservation_date:'2026-11-22',arrival_time:'18:00:00',customer_name:'מאיה',phone:'054-2222222',guests:3,note:'כיסא תינוק',assigned_table_id:8,assigned_kind:'bar_pool',status:'confirmed'}];
  test('lists the day\'s bookings by area with totals',async()=>{
    const {page,ctx,errors}=await open({file:'admin.html',time:MORNING,cfg:{reservations}});
    const t=await text(page,'#listContent');
    assert.match(t,/הזמנות ל-22\.11\.2026/);assert.match(t,/2 הזמנות · 5 סועדים/);
    assert.match(t,/שולחנות גבוהים.*רון · שולחן 1.*בר.*מאיה · בר.*כיסא תינוק/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('just after midnight, the manager page opens on the new day (Israel time)',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:'2026-11-23T00:30:00+02:00'});
    assert.match(await text(page,'#listContent'),/הזמנות ל-23\.11\.2026/);
    assert.equal(await page.inputValue('#dateInput'),'2026-11-23');await ctx.close();
  });
  test('cancelling asks first and then marks the booking cancelled',async()=>{
    const {page,ctx,dialogs}=await open({file:'admin.html',time:MORNING,cfg:{reservations}});
    await page.click('.cancel-link[data-id="1"]');await page.waitForTimeout(200);
    assert.deepEqual(dialogs,['לבטל את ההזמנה הזו?']);
    assert.equal(await page.evaluate(()=>__db.reservations.find(r=>r.id===1).status),'cancelled');
    await ctx.close();
  });
  test('a booking whose name or note contains code is shown as plain text, never run',async()=>{
    const evil=[{id:9,reservation_date:'2026-11-22',arrival_time:'20:00:00',customer_name:'<img src=x onerror="window.__pwned=1">',
      phone:'<b>050</b>',guests:2,note:'<script>window.__pwned=2</script>',assigned_table_id:1,assigned_kind:'table',status:'confirmed'}];
    const {page,ctx,errors}=await open({file:'admin.html',time:MORNING,cfg:{reservations:evil}});
    const t=await text(page,'#listContent');
    assert.ok(t.includes('<img src=x onerror="window.__pwned=1">')&&t.includes('<script>window.__pwned=2</script>')&&t.includes('<b>050</b>'));
    assert.equal(await page.evaluate(()=>[window.__pwned,document.querySelectorAll('#listContent img,#listContent script,#listContent b').length].join()),',0');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  const pendingRow={id:5,reservation_date:'2026-11-22',arrival_time:'19:30:00',customer_name:'נועה',phone:'052-3333333',guests:4,note:null,assigned_table_id:4,assigned_kind:'table',status:'pending',access_token:'aaaaaaaa-2222-4333-8444-555555555555'};
  test('requests waiting for approval are listed first, with approve and decline',async()=>{
    const {page,ctx,errors}=await open({file:'admin.html',time:MORNING,cfg:{reservations:[...reservations,pendingRow]}});
    const t=await text(page,'#listContent');
    assert.match(t,/2 הזמנות · 5 סועדים · 1 ממתינות לאישור/);
    assert.match(t,/ממתינות לאישור 19:30 נועה · שולחן 4 4 · 052-3333333 אישור דחייה/);
    const href=await page.getAttribute('.approve-btn','href');
    assert.ok(href.startsWith('https://wa.me/972523333333?text='));
    assert.match(decodeURIComponent(href),/שלום נועה, ההזמנה שלך לעיזה בר אושרה ✳\n22\.11\.2026 בשעה 19:30, שולחן ל-4\.\nנחכה עד 15 דקות משעת ההזמנה\. מחכים לך!\nלצפייה, שינוי או ביטול: http:\/\/localhost:\d+\/booking\.html#aaaaaaaa-2222-4333-8444-555555555555$/);
    assert.match(decodeURIComponent(await page.getAttribute('.decline-link','href')),/מצטערים, לא נוכל לאשר את ההזמנה ל-22\.11\.2026 בשעה 19:30/);
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('approving opens WhatsApp and moves the request to the confirmed list',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING,cfg:{reservations:[{...pendingRow}]}});
    const [wa]=await Promise.all([ctx.waitForEvent('page'),page.click('.approve-btn')]);   // WhatsApp opens (the address is checked above; the internet is off in tests)
    assert.ok(wa);
    await page.waitForFunction(()=>__db.reservations[0].status==='confirmed',null,{timeout:10000});
    await page.waitForFunction(()=>/1 הזמנות/.test(document.getElementById('listContent').innerText),null,{timeout:10000});
    assert.match(await text(page,'#listContent'),/1 הזמנות · 4 סועדים/);
    assert.equal(await page.isVisible('.pending-card'),false);await ctx.close();
  });
  test('declining asks first; yes frees the table, no keeps the request',async()=>{
    for(const [dismiss,expected] of [[false,'declined'],[true,'pending']]){
      const {page,ctx,dialogs}=await open({file:'admin.html',time:MORNING,cfg:{reservations:[{...pendingRow}]},dismissDialogs:dismiss});
      const popups=[];ctx.on('page',p=>popups.push(p));
      // wait for the WhatsApp window when declining (slow machines need more than a fixed pause)
      const opened=dismiss?null:ctx.waitForEvent('page',{timeout:10000});
      await page.click('.decline-link');
      if(opened)await opened;
      await page.waitForFunction(s=>__db.reservations[0].status===s,expected,{timeout:10000});
      await page.waitForTimeout(300);
      assert.deepEqual(dialogs,['לדחות את הבקשה? השולחן ישתחרר.']);
      assert.equal(popups.length,dismiss?0:1,'WhatsApp opens only when declining');await ctx.close();
    }
  });
  test('the manager page picks up new requests by itself',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING,cfg:{reservations}});
    assert.equal(await page.isVisible('.pending-card'),false);
    await page.evaluate(r=>{__db.reservations.push(r);document.dispatchEvent(new Event('visibilitychange'));},pendingRow);
    await page.waitForSelector('.pending-card');await ctx.close();
  });
  test('Israeli phone numbers become WhatsApp numbers',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING});
    assert.deepEqual(await page.evaluate(()=>['052-3333333','+972 52-333-3333','(052) 333 3333'].map(waNumber)),['972523333333','972523333333','972523333333']);
    await ctx.close();
  });
  test('if the bookings cannot be loaded, a message and a retry button are shown',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING,cfg:{reservations,failTables:['reservations']}});
    assert.match(await text(page,'#listContent'),/ההזמנות לא נטענו/);
    await page.evaluate(()=>{__cfg.failTables=[];});
    await page.click('#retryBtn');await page.waitForTimeout(200);
    assert.match(await text(page,'#listContent'),/2 הזמנות · 5 סועדים/);await ctx.close();
  });
  test('saying no to the cancel question keeps the booking',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING,cfg:{reservations},dismissDialogs:true});
    await page.click('.cancel-link[data-id="1"]');await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>__db.reservations.find(r=>r.id===1).status),'confirmed');
    await ctx.close();
  });
});

describe('personal booking page (booking.html#secret)',()=>{
  const TOKEN='11111111-2222-4333-8444-555555555555';
  const bk=(extra={})=>({access_token:TOKEN,id:101,status:'confirmed',reservation_date:'2026-11-25',arrival_time:'19:00:00',
    customer_name:'דנה כהן',guests:3,note:'יום הולדת',cancelled_by:null,can_change:true,can_cancel:true,...extra});
  const openBooking=(extra,opts={})=>open({file:'booking.html#'+(opts.token||TOKEN),time:MORNING,cfg:{bookings:[bk(extra)]},...opts});
  const BAR_WA='https://wa.me/972545904470';

  test('shows the booking card, its status and the comment',async()=>{
    const {page,ctx,errors}=await openBooking();
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.equal(await text(page,'#statusLabel'),'ההזמנה אושרה');
    assert.equal(await page.getAttribute('#cardPreview','alt'),'ההזמנה אושרה: דנה כהן, שולחן ל-3 סועדים, 25.11 בשעה 19:00');
    assert.equal(await page.inputValue('#noteInput'),'יום הולדת');
    assert.ok((await page.getAttribute('#barWa','href')).startsWith(BAR_WA+'?text='));
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
    assert.equal(await page.evaluate(()=>[window.__pwned,document.querySelectorAll('img:not(#cardPreview)').length].join()),',0');
    assert.deepEqual(errors,[]);await ctx.close();
  });
});
