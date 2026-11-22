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
    assert.match(await text(page,'.success'),/ההזמנה אושרה.*דנה כהן, שולחן ל-3 סועדים.*25\.11 בשעה 17:15/);
    assert.ok(await page.isVisible('.btn-whatsapp'));assert.ok(await page.isVisible('#icsBtn'));
    assert.equal((await page.evaluate(()=>__ops.filter(o=>o.fn))).length,0,'no email is requested');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  // a phone that can share files: record what would go to the share sheet
  const fakeShare=()=>{window.__shared=[];navigator.canShare=d=>!!(d&&d.files);
    navigator.share=async d=>{window.__shared.push((d.files||[]).map(f=>f.name+'|'+f.type+'|'+(f.size>10000)));};};
  test('on a phone, the WhatsApp button shares a picture of the booking',async()=>{
    const {page,ctx,errors}=await open({time:MORNING,init:fakeShare});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('.success');
    await page.waitForSelector('#cardPreview:not([hidden])');
    assert.deepEqual(await page.evaluate(()=>{const i=document.getElementById('cardPreview');return [i.naturalWidth,i.naturalHeight];}),[1080,1350]);
    const pages=ctx.pages().length;
    await page.click('#waLink');await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(()=>window.__shared),[['izabar-booking.png|image/png|true']]);
    assert.equal(ctx.pages().length,pages,'no WhatsApp text link opened');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('where pictures cannot be shared, the WhatsApp button sends the text as before',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);await page.click('#submitBtn');await page.waitForSelector('#cardPreview:not([hidden])');
    const href=await page.getAttribute('#waLink','href');
    assert.ok(href.startsWith('https://wa.me/?text='));
    assert.match(decodeURIComponent(href),/אישור הזמנה - עיזה בר\nדנה כהן, שולחן ל-3 סועדים\n25\.11 בשעה 17:15/);
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
    await page.click('#submitBtn');await page.waitForSelector('.success');await page.waitForTimeout(200);
    assert.ok((await text(page,'.success')).includes(evil));
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
  test('after the 17:00 cutoff, today can no longer be booked',async()=>{
    const {page,ctx}=await open({time:'2026-11-22T18:00:00+02:00'});
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
    // 18:00 in Israel is 11:00 in New York: today is already closed in Israel
    const {page,ctx}=await open({time:'2026-11-22T18:00:00+02:00',timezoneId:'America/New_York'});
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
