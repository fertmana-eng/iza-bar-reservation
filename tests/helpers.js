// Shared helpers for the reservation tests: a tiny web server for the project
// folder and a way to open a page in headless Chromium with the fake database.
const {chromium}=require('playwright');
const fs=require('fs'),http=require('http'),path=require('path');

const ROOT=path.resolve(__dirname,'..');
const FAKE=fs.readFileSync(path.join(__dirname,'fake-supabase.js'),'utf8');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml'};

function startServer(root=ROOT){
  const srv=http.createServer((req,res)=>{
    let f=decodeURIComponent(req.url.split('?')[0]);if(f==='/')f='/index.html';
    const p=path.join(root,f);
    if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'content-type':TYPES[path.extname(p)]||'application/octet-stream'});res.end(fs.readFileSync(p));
  });
  return new Promise(r=>srv.listen(0,()=>r({url:`http://localhost:${srv.address().port}/`,close:()=>new Promise(c=>srv.close(c))})));
}

const PHONE={width:390,height:844};

// Open a page (default: the customer booking page). opts: file ('admin.html'),
// cfg (fake database options), time (fixed clock), timezoneId (the phone's
// time zone; default Israel).
// Every outside request (fonts etc.) is blocked so the tests never touch the internet;
// the database library is replaced by the fake.
async function openPage(browser,url,opts={}){
  const ctx=await browser.newContext({viewport:PHONE,timezoneId:opts.timezoneId||'Asia/Jerusalem',locale:'he-IL'});
  const page=await ctx.newPage();const errors=[],dialogs=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('dialog',d=>{dialogs.push(d.message());opts.dismissDialogs?d.dismiss():d.accept();});
  if(opts.time)await page.clock.setFixedTime(new Date(opts.time));
  await page.addInitScript(c=>{window.__cfg=c;},opts.cfg||{});
  await page.route(u=>!u.href.startsWith(url),r=>/supabase-js/.test(r.request().url())
    ?r.fulfill({contentType:'text/javascript',body:FAKE}):r.abort());
  await page.goto(url+(opts.file||''));await page.waitForTimeout(opts.wait??300);
  return {page,ctx,errors,dialogs};
}

const text=(page,sel='body')=>page.evaluate(s=>document.querySelector(s).innerText.replace(/\s+/g,' ').trim(),sel);

module.exports={chromium,startServer,openPage,text,PHONE,ROOT};
