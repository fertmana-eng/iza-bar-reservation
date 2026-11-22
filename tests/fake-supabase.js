// Fake Supabase client used by the tests instead of the real database.
// It keeps a small in-memory database (window.__db) and records every call (window.__ops).
// Options are read from window.__cfg:
//   spots (number returned by available_spots, default 10),
//   available (result of check_availability, default true),
//   bookResult ('confirmed' by default; 'pending', 'full', 'closed', 'invalid', 'invalid_time'),
//   rpcError (name of an RPC that should fail), reservations (rows for the manager page),
//   token (secret returned with a new booking), bookings (rows for booking.html, with access_token),
//   changeResult (answer of change_booking; 'confirmed' by default),
//   noSession (manager not logged in), loginError ('wrong' or 'network'), failTables[] (reads that fail).
// NOTE: this fake has no access rules, so it cannot catch a database rule that
// refuses the page's own requests. Those are checked on the real database.
(function(){
  const cfg=window.__cfg||{};
  const db={
    settings:[{key:'arrival_start',value:'17:00'},{key:'arrival_end',value:'21:00'},{key:'booking_cutoff',value:'20:00'}],
    // the bar's real tables (ids here = table numbers; the bar is 8)
    venue_tables:[
      {id:1,name:'שולחן 1',area:'high',kind:'table',min_guests:1,max_guests:2,sort_order:1},
      {id:2,name:'שולחן 2',area:'high',kind:'table',min_guests:1,max_guests:2,sort_order:2},
      {id:3,name:'שולחן 3',area:'high',kind:'table',min_guests:2,max_guests:5,sort_order:3},
      {id:18,name:'שולחן 18',area:'high',kind:'table',min_guests:4,max_guests:6,sort_order:4},
      {id:4,name:'שולחן 4',area:'low',kind:'table',min_guests:3,max_guests:6,sort_order:5},
      {id:6,name:'שולחן 6',area:'low',kind:'table',min_guests:3,max_guests:5,sort_order:6},
      {id:7,name:'שולחן 7',area:'low',kind:'table',min_guests:5,max_guests:10,sort_order:7},
      {id:8,name:'בר',area:'bar',kind:'bar_pool',min_guests:1,max_guests:4,pool_capacity:12,sort_order:8}],
    reservations:cfg.reservations||[],
    bookings:cfg.bookings||[]
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
      if(name==='book_reservation'){const ok=['confirmed','pending'].includes(cfg.bookResult||'confirmed');
        return {data:[{result:cfg.bookResult||'confirmed',reservation_id:ok?101:null,booking_token:ok?(cfg.token===undefined?'11111111-2222-4333-8444-555555555555':cfg.token):null}],error:null};}
      // the personal booking link's functions (10_booking_link.sql)
      const bk=(db.bookings||[]).find(b=>b.access_token===args?.p_token);
      if(name==='get_booking'){if(!bk)return {data:[],error:null};const {access_token,...row}=bk;return {data:[row],error:null};}
      if(name==='update_booking_note'){if(!bk)return {data:'not_found',error:null};if(!bk.can_change)return {data:'locked',error:null};bk.note=args.p_note||null;return {data:'saved',error:null};}
      if(name==='change_booking'){if(!bk)return {data:'not_found',error:null};const res=cfg.changeResult||'confirmed';
        if(res==='confirmed'||res==='pending'){
          if(res==='pending'&&bk.status==='confirmed')Object.assign(bk,{prev_date:bk.reservation_date,prev_time:bk.arrival_time,prev_guests:bk.guests});
          if(res==='confirmed')Object.assign(bk,{prev_date:null,prev_time:null,prev_guests:null});
          Object.assign(bk,{reservation_date:args.p_date,arrival_time:args.p_time+':00',guests:args.p_guests,status:res});}
        return {data:res,error:null};}
      if(name==='save_push_subscription'){if(!bk)return {data:'not_found',error:null};(db.push=db.push||[]).push(args);return {data:'saved',error:null};}
      // the manager's floor actions (13_manager_floor.sql)
      const live=r=>['confirmed','pending'].includes(r.status);
      const tableTaken=(t,date,except)=>db.reservations.some(r=>live(r)&&r.assigned_table_id===t&&r.reservation_date===date&&r.id!==except);
      if(name==='set_arrived'){const r=db.reservations.find(x=>x.id===args.p_id);if(!r)return {data:'not_found',error:null};
        r.arrived_at=args.p_arrived?new Date().toISOString():null;return {data:'saved',error:null};}
      if(name==='move_booking'){const r=db.reservations.find(x=>x.id===args.p_id),t=db.venue_tables.find(x=>x.id===args.p_table);
        if(!r||!t)return {data:'not_found',error:null};if(t.id===r.assigned_table_id)return {data:'unchanged',error:null};
        if(t.kind==='table'&&tableTaken(t.id,r.reservation_date,r.id))return {data:'taken',error:null};
        Object.assign(r,{assigned_table_id:t.id,assigned_kind:t.kind});
        return {data:r.guests>=t.min_guests&&r.guests<=t.max_guests?'moved':'moved_size',error:null};}
      if(name==='manager_add_booking'){const t=args.p_table;
        if(t&&db.venue_tables.find(x=>x.id===t).kind==='table'&&tableTaken(t,args.p_date,null))return {data:[{result:'taken'}],error:null};
        const id=900+db.reservations.length;
        db.reservations.push({id,reservation_date:args.p_date,arrival_time:args.p_time+':00',customer_name:(args.p_name||'').trim()||'ללא שם',
          phone:args.p_phone||'',guests:args.p_guests,note:args.p_note||null,assigned_table_id:t||3,assigned_kind:'table',status:'confirmed'});
        return {data:[{result:'confirmed',reservation_id:id,booking_token:'t'+id}],error:null};}
      if(name==='decide_request'){const r=db.reservations.find(x=>x.id===args.p_id);if(!r)return {data:'not_found',error:null};
        if(args.p_approve){Object.assign(r,{status:'confirmed',prev:null});return {data:'confirmed',error:null};}
        if(r.prev){Object.assign(r,{...r.prev,status:'confirmed',prev:null});return {data:'reverted',error:null};}
        r.status='declined';return {data:'declined',error:null};}
      if(name==='cancel_booking'){if(!bk)return {data:'not_found',error:null};if(!['confirmed','pending'].includes(bk.status))return {data:bk.status,error:null};
        Object.assign(bk,{status:'cancelled',cancelled_by:'customer',can_change:false,can_cancel:false});return {data:'cancelled',error:null};}
      return {data:null,error:{message:'unknown function '+name}};
    },
    functions:{invoke:async(n,o)=>{window.__ops.push({fn:n,body:o.body});return {data:{},error:null}}}
  }}};
})();
