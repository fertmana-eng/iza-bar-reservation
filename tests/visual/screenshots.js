// Take full-page phone-size screenshots of every step of both pages (fake database, fixed clock).
// Usage (from the project folder):  node tests/visual/screenshots.js tests/visual/out/before
// Then change the code, run again into .../after, and compare with compare.js.
// Fonts from the internet are blocked, so the pages use the phone's fallback font here.
const path=require('path'),fs=require('fs');
const {chromium,startServer,openPage}=require('../helpers');
const OUT=path.resolve(process.argv[2]||path.join(__dirname,'out/shots'));fs.mkdirSync(OUT,{recursive:true});
const TIME='2026-11-22T10:00:00+02:00';
const toDetails=async p=>{await p.click('#introNext');await p.click('.cal-grid button[data-date="2026-11-25"]');await p.click('#dateNext');
  await p.waitForSelector('#guestsNext');await p.click('#guestsNext');await p.waitForSelector('#timeNext');await p.click('#timeNext');};
const toSummary=async p=>{await toDetails(p);await p.fill('#nameInput','דנה כהן');await p.fill('#phoneInput','050-1234567');
  await p.click('#detailsForm button[type=submit]');await p.waitForSelector('#submitBtn');};
const RES=[{id:1,reservation_date:'2026-11-22',arrival_time:'19:00:00',customer_name:'רון',phone:'052-1111111',guests:2,note:null,assigned_table_id:1,status:'confirmed'},
  {id:2,reservation_date:'2026-11-22',arrival_time:'18:00:00',customer_name:'מאיה',phone:'054-2222222',guests:3,note:'כיסא תינוק',assigned_table_id:8,status:'confirmed'}];
const TOK='11111111-2222-4333-8444-555555555555';
const BK=(x={})=>({access_token:TOK,id:101,status:'confirmed',reservation_date:'2026-11-25',arrival_time:'19:00:00',customer_name:'דנה כהן',guests:3,note:'יום הולדת',cancelled_by:null,can_change:true,can_cancel:true,...x});
const STATES=[
 ['intro',async p=>{}],
 ['date',async p=>{await p.click('#introNext');await p.click('.cal-grid button[data-date="2026-11-25"]');}],
 ['date-full',async p=>{await p.click('#introNext');await p.click('.cal-grid button[data-date="2026-11-25"]');await p.click('#dateNext');await p.waitForTimeout(200);},{spots:0}],
 ['guests',async p=>{await p.click('#introNext');await p.click('.cal-grid button[data-date="2026-11-25"]');await p.click('#dateNext');await p.waitForSelector('#guestsNext');}],
 ['time',async p=>{await toDetails(p);await p.click('.progress .step-chip.done[data-step="2"]');}],
 ['details',toDetails],
 ['summary',toSummary],
 ['success',async p=>{await toSummary(p);await p.click('#submitBtn');await p.waitForSelector('.success');}],
 ['success-android',async p=>{await toSummary(p);await p.click('#submitBtn');await p.waitForSelector('.success');},{},undefined,{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'}],
 ['success-pending',async p=>{await toSummary(p);await p.click('#submitBtn');await p.waitForSelector('.success');},{bookResult:'pending'}],
 ['booking',async p=>{await p.waitForSelector('#cardPreview:not([hidden])');},{bookings:[BK()]},'booking.html#'+TOK],
 ['booking-late',async p=>{await p.waitForSelector('#cardPreview:not([hidden])');},{bookings:[BK({can_change:false})]},'booking.html#'+TOK],
 ['booking-cancelled',async p=>{},{bookings:[BK({status:'cancelled',cancelled_by:'customer',can_change:false,can_cancel:false})]},'booking.html#'+TOK],
 ['admin',async p=>{},{reservations:RES},'admin.html'],
 ['admin-pending',async p=>{},{reservations:[...RES,{id:5,reservation_date:'2026-11-22',arrival_time:'19:30:00',customer_name:'נועה',phone:'052-3333333',guests:4,note:'יום הולדת',assigned_table_id:4,status:'pending'}]},'admin.html'],
 ['admin-empty',async p=>{},{},'admin.html'],
 ['admin-login',async p=>{},{noSession:true},'admin.html'],
 ['admin-login-wrong',async p=>{await p.fill('#userInput','izabar');await p.fill('#passInput','x');await p.click('#loginBtn');},{noSession:true,loginError:'wrong'},'admin.html'],
];
const ONLY=process.env.ONLY?new RegExp(process.env.ONLY):null;
(async()=>{
  const browser=await chromium.launch(),server=await startServer();
  for(const [name,go,cfg,file,extra] of STATES.filter(s=>!ONLY||ONLY.test(s[0]))){
    const {page,ctx}=await openPage(browser,server.url,{time:TIME,cfg:cfg||{},file,...(extra||{})});
    await go(page);await page.waitForTimeout(200);
    await page.screenshot({path:path.join(OUT,name+'.png'),fullPage:true});await ctx.close();
  }
  await browser.close();await server.close();console.log(`${STATES.length} screenshots in ${OUT}`);
})();
