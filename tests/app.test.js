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
    assert.deepEqual(call.args,{p_date:'2026-11-25',p_time:'17:15',p_name:'דנה כהן',p_phone:'050-1234567',p_guests:3,p_note:'יום הולדת',p_email:null});
    assert.match(await text(page,'.success'),/ההזמנה אושרה.*דנה כהן, שולחן ל-3 סועדים.*25\.11 בשעה 17:15/);
    assert.ok(await page.isVisible('.btn-whatsapp'));assert.ok(await page.isVisible('#icsBtn'));
    assert.equal((await page.evaluate(()=>__ops.filter(o=>o.fn))).length,0,'no email without an address');
    assert.deepEqual(errors,[]);await ctx.close();
  });
  test('with an email address, a confirmation email is requested',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);
    await page.fill('#emailInput','dana@example.com');
    await page.click('#submitBtn');await page.waitForSelector('.success');
    const fns=await page.evaluate(()=>__ops.filter(o=>o.fn));
    assert.deepEqual(fns,[{fn:'send-confirmation',body:{email:'dana@example.com',name:'דנה כהן',date:'2026-11-25',time:'17:15',guests:3}}]);
    await ctx.close();
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
  test('tapping a finished step in the progress line goes back to it',async()=>{
    const {page,ctx}=await open({time:MORNING});
    await fillBooking(page);
    await page.click('.progress .step-chip.done[data-step="0"]');
    assert.match(await text(page,'#stepArea'),/מתי מגיעים\?/);
    assert.equal(await page.evaluate(()=>document.querySelector('.cal-grid button.selected')?.dataset.date),'2026-11-25');
    await ctx.close();
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
  test('cancelling asks first and then marks the booking cancelled',async()=>{
    const {page,ctx,dialogs}=await open({file:'admin.html',time:MORNING,cfg:{reservations}});
    await page.click('.cancel-link[data-id="1"]');await page.waitForTimeout(200);
    assert.deepEqual(dialogs,['לבטל את ההזמנה הזו?']);
    assert.equal(await page.evaluate(()=>__db.reservations.find(r=>r.id===1).status),'cancelled');
    await ctx.close();
  });
  test('saying no to the cancel question keeps the booking',async()=>{
    const {page,ctx}=await open({file:'admin.html',time:MORNING,cfg:{reservations},dismissDialogs:true});
    await page.click('.cancel-link[data-id="1"]');await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>__db.reservations.find(r=>r.id===1).status),'confirmed');
    await ctx.close();
  });
});
