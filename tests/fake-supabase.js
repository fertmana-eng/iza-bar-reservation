// Fake Supabase client used by the tests instead of the real database.
// It keeps a small in-memory database (window.__db) and records every call (window.__ops).
// Options are read from window.__cfg:
//   spots (number returned by available_spots, default 10),
//   available (result of check_availability, default true),
//   bookResult ('confirmed' by default; 'full', 'closed', 'invalid_time'),
//   rpcError (name of an RPC that should fail), reservations (rows for the manager page),
//   noSession (manager not logged in), loginError ('wrong' or 'network'), failTables[] (reads that fail).
// NOTE: this fake has no access rules, so it cannot catch a database rule that
// refuses the page's own requests. Those are checked on the real database.
(function(){
  const cfg=window.__cfg||{};
  const db={
    settings:[{key:'arrival_start',value:'17:00'},{key:'arrival_end',value:'21:00'},{key:'booking_cutoff',value:'17:00'}],
    venue_tables:[
      {id:1,name:'שולחן 1',area:'high',kind:'table',sort_order:1},
      {id:4,name:'שולחן 4',area:'low',kind:'table',sort_order:5},
      {id:8,name:'בר',area:'bar',kind:'bar_pool',sort_order:8}],
    reservations:cfg.reservations||[]
  };
  window.__db=db;window.__ops=[];
  function q(table){
    const st={op:'select',filters:[],payload:null};
    const b={
      select(){return b},order(){return b},limit(){return b},
      eq(k,v){st.filters.push([k,v]);return b},
      in(k,v){st.inF=[k,v];return b},
      update(p){st.op='update';st.payload=p;return b},
      then(res,rej){
        window.__ops.push({table,op:st.op,payload:st.payload,filters:st.filters});
        if((cfg.failTables||[]).includes(table))return Promise.resolve({data:null,error:{message:'Failed to fetch'}}).then(res,rej);
        const rows=db[table]||[];
        const match=r=>st.filters.every(([k,v])=>String(r[k])===String(v))&&(!st.inF||st.inF[1].map(String).includes(String(r[st.inF[0]])));
        const out=rows.filter(match);
        if(st.op==='update')out.forEach(r=>Object.assign(r,st.payload));
        return Promise.resolve({data:out,error:null}).then(res,rej);
      }
    };
    return b;
  }
  let session=cfg.noSession?null:{user:{id:'u1',email:'izabar@izabar.local'}};
  window.supabase={createClient(){return {
    auth:{
      getSession:async()=>({data:{session},error:null}),
      signInWithPassword:async({email,password})=>{
        window.__ops.push({auth:'signIn',email});
        if(cfg.loginError==='wrong')return {data:{},error:{status:400,message:'Invalid login credentials'}};
        if(cfg.loginError==='network')return {data:{},error:{status:0,message:'Failed to fetch'}};
        session={user:{id:'u1',email}};return {data:{session},error:null};
      },
      signOut:async()=>{window.__ops.push({auth:'signOut'});session=null;return {error:null};}
    },
    from:q,
    rpc:async(name,args)=>{
      window.__ops.push({rpc:name,args});
      if(cfg.rpcError===name)return {data:null,error:{message:'failed'}};
      if(name==='available_spots')return {data:cfg.spots??10,error:null};
      if(name==='check_availability')return {data:cfg.available??true,error:null};
      if(name==='book_reservation')return {data:[{result:cfg.bookResult||'confirmed',reservation_id:(cfg.bookResult||'confirmed')==='confirmed'?101:null}],error:null};
      return {data:null,error:{message:'unknown function '+name}};
    },
    functions:{invoke:async(n,o)=>{window.__ops.push({fn:n,body:o.body});return {data:{},error:null}}}
  }}};
})();
