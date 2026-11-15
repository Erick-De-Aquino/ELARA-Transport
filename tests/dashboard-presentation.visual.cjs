// Local fixture-only visual verification. No Auth or Supabase requests.
﻿const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process');
const {fixtureRows,fixtureTables,readClient,uuid}=require('./services-presentation-harness.cjs');
(async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'elara-dashboard-')),tables=fixtureTables(fixtureRows()); for(const [i,row] of tables.v_admin_service_overview.entries()){row.scheduled_start_at=new Date(Date.now()+3600000+i*60000).toISOString();}
 tables.incident_categories=[{id:uuid(801),name_es:'Operativa',requires_resolution:true}];
 tables.incidents=[{id:uuid(800),human_code:'INC-000001',category_id:uuid(801),title:'Revisar servicio',description:'Incidencia de prueba aislada para comprobar lectura y acciones administrativas.',severity:'high',status:'open',reported_at:new Date().toISOString(),service_id:uuid(1),driver_id:uuid(600),reported_by_user_id:uuid(900)},
 {id:uuid(810),human_code:'INC-000002',category_id:uuid(801),title:'Incidencia resuelta',severity:'medium',status:'resolved',reported_at:new Date().toISOString(),resolved_at:new Date().toISOString()}];
 tables.app_users=[{id:uuid(900),person_id:uuid(901)}];tables.persons=[{id:uuid(901),first_name:'Operador',last_name:'de prueba'}];
 tables.incident_events=[{id:uuid(802),incident_id:uuid(800),event_type:'incident_created',occurred_at:new Date().toISOString()}];
 tables.incident_comments=[{id:uuid(803),incident_id:uuid(800),content:'Comentario de prueba aislada',is_private:true,created_at:new Date().toISOString()}];
 tables.service_status_history=[{id:uuid(804),service_id:uuid(1),from_status:'pending',to_status:'confirmed',changed_at:new Date().toISOString()}];
 let html=fs.readFileSync('src/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link[^>]+(?:https:|manifest)[^>]*>/gi,'');
 const bootstrap=`document.body.className='';document.querySelector('.app-shell').hidden=false;for(const e of document.body.children)if(!e.classList.contains('app-shell')&&e.tagName!=='SCRIPT')e.hidden=true;for(const v of document.querySelectorAll('.view'))v.hidden=v.id!=='dashboard';window.ElaraAuth={getCurrentUser:()=>({id:'visual',name:'Operador de prueba'}),getActiveContext:()=> 'administrativo'};const tables=${JSON.stringify(tables)};window.ElaraSupabase={client:(${readClient.toString()})(tables,[])};window.ElaraFinancialClose={context:async()=>({financial_close:'pending'})};window.ElaraServicesMock={};Object.defineProperty(window.ElaraServicesMock,'services',{get(){throw Error('Mock accessed')}});`;
 html=html.replace('</body>',`<script>${bootstrap}</script><script src="js/operational-data.js"></script><script src="js/services.js"></script><script src="js/dashboard.js"></script><script>showOperationalDashboard().then(()=>window.ready=true)</script></body>`);
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;if(p==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}const f=path.join(process.cwd(),'src',p);if(!f.startsWith(path.join(process.cwd(),'src'))||!fs.existsSync(f)){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')?'text/javascript':'image/svg+xml');res.end(fs.readFileSync(f));});await new Promise(r=>server.listen(0,'127.0.0.1',r));

 const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-sandbox','--remote-debugging-pipe',`--user-data-dir=${path.join(out,'profile')}`,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe','pipe','pipe']});
 let id=0,sessionId;const pending=new Map();let buffer='';chrome.stdio[4].on('data',d=>{buffer+=d.toString();let i;while((i=buffer.indexOf('\0'))>=0){const m=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}}});
 const send=(method,params={},root=false)=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject});chrome.stdio[3].write(JSON.stringify({id:n,method,params,...(!root&&sessionId?{sessionId}:{})})+'\0');});
 const {targetInfos}=await send('Target.getTargets',{},true);({sessionId}=await send('Target.attachToTarget',{targetId:targetInfos.find(t=>t.type==='page').targetId,flatten:true},true));
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 try{
 await send('Page.enable');const results=[];
 for(const width of [390,640,768,1024,1440]){
 await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});for(let i=0;i<100;i++){if(await evaluate('Boolean(window.ready)'))break;await new Promise(r=>setTimeout(r,50));}

 const metrics=await evaluate(`(()=>{const p=document.querySelector('#dashboard [data-operational-panel]'),card=p.querySelector('.service-item'),grid=p.querySelector('.dashboard-grid'),view=document.getElementById('dashboard');const bounds=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflowY:getComputedStyle(e).overflowY}};return {viewport:innerWidth,panel:bounds(p),view:bounds(view),grid:bounds(grid),card:bounds(card),bodyWidth:document.documentElement.scrollWidth,metrics:p.querySelectorAll('.summary-card').length,upcoming:p.querySelectorAll('.service-item').length,idsUnique:['summary-cards','alerts-list','upcoming-services','incidents-list','recent-activity-list'].every(id=>document.querySelectorAll('#'+id).length===1)}})()`);if(metrics.panel.scrollWidth>metrics.panel.clientWidth+1||metrics.card.scrollWidth>metrics.card.clientWidth+1||!metrics.idsUnique||metrics.metrics!==5||metrics.upcoming!==4||metrics.view.overflowY==='hidden')throw Error('Dashboard responsive/layout failure '+width);results.push({width,...metrics});
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,width+'.png'),Buffer.from(shot.data,'base64'));
 await evaluate("document.querySelector('.service-item').scrollIntoView({block:'start'})");
 const cardShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,width+'-cards.png'),Buffer.from(cardShot.data,'base64'));
 await evaluate("document.querySelector('#dashboard details').open=true;document.querySelector('[data-operational-next]').scrollIntoView({block:'center'})");
 const bottom=await evaluate("(()=>{const e=document.querySelector('[data-operational-next]'),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight}})()");if(bottom.top<0||bottom.bottom>bottom.viewport)throw Error('Pagination unreachable '+width);results[results.length-1].paginationReachable=true;
 const bottomShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,width+'-bottom.png'),Buffer.from(bottomShot.data,'base64'));

 await evaluate("document.getElementById('incidents-list').scrollIntoView({block:'center'})");
 const panels=await evaluate("(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return {unique:new Set(ids).size===ids.length,panels:['alerts-list','incidents-list','recent-activity-list'].map(id=>{const e=document.getElementById(id);return {id,width:e.clientWidth,scroll:e.scrollWidth}})}})()");
 if(!panels.unique||panels.panels.some(p=>p.scroll>p.width+1))throw Error('Panel overflow '+JSON.stringify({width,panels}));
 const panelShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-panels.png'),Buffer.from(panelShot.data,'base64'));
 await evaluate(`openOperationalIncident('${uuid(800)}')`);
 const detail=await evaluate("(()=>{const m=document.getElementById('admin-incident-detail-modal'),body=m.querySelector('.modal__body'),r=m.querySelector('.modal').getBoundingClientRect();return {left:r.left,right:r.right,width:body.clientWidth,scroll:body.scrollWidth,events:document.getElementById('admin-incident-operational-events').textContent.includes('Comentario')}})()");
 if(detail.left<0||detail.right>width+1||detail.scroll>detail.width+1||!detail.events)throw Error('Detail overflow '+JSON.stringify({width,detail}));
 const detailShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-incident.png'),Buffer.from(detailShot.data,'base64'));
 await evaluate("document.querySelector('#admin-incident-detail-modal [data-modal-close]').click();document.getElementById('incidents-history-action').click()");
 const history=await evaluate("(()=>{const e=document.getElementById('incidents-history-list');return {width:e.clientWidth,scroll:e.scrollWidth,visible:!document.getElementById('admin-incident-history-modal').hidden}})()");
 if(!history.visible||history.scroll>history.width+1)throw Error('History overflow '+JSON.stringify({width,history}));
 const historyShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-history.png'),Buffer.from(historyShot.data,'base64'));
 results[results.length-1].phase1B={panels,detail,history};

 // Content-sized incident card, plus empty/long history: isolated DOM fixtures only.
 const contentSizing=await evaluate(`(()=>{
   document.getElementById('admin-incident-history-modal').hidden=true;
   const state=operationalIncidentState,original=state.rows,base=original.find(r=>r.status==='open');
   const card=document.getElementById('incidents-list').closest('article'),activity=document.getElementById('recent-activity-list').closest('article');
   const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   const otherBefore=[...document.querySelectorAll('.dashboard-grid > article')].map(rect);
   const cards=[];
   for(const count of [0,1,12]){
     state.rows=Array.from({length:count},(_,i)=>({...base,id:'sizing-'+i,human_code:'INC-'+String(i+1).padStart(6,'0')}));renderOperationalIncidents(state);
     const header=card.querySelector('.panel__header'),list=document.getElementById('incidents-list'),css=getComputedStyle(card),stack=getComputedStyle(card.parentElement);
     const expected=header.getBoundingClientRect().height+list.getBoundingClientRect().height+parseFloat(css.rowGap)+parseFloat(css.paddingTop)+parseFloat(css.paddingBottom)+parseFloat(css.borderTopWidth)+parseFloat(css.borderBottomWidth);
     cards.push({count,height:card.getBoundingClientRect().height,expected,activityGap:activity.getBoundingClientRect().top-card.getBoundingClientRect().bottom,stackGap:parseFloat(stack.rowGap),overflow:list.scrollWidth>list.clientWidth});
   }
   const historyCases=[];
   for(const count of [0,1,40]){
     state.rows=Array.from({length:count},(_,i)=>({...base,id:'history-sizing-'+i,human_code:'INC-'+String(i+1).padStart(6,'0'),status:'resolved',resolved_at:base.reported_at}));renderOperationalIncidentHistory(state);
     const modal=document.getElementById('admin-incident-history-modal');modal.hidden=false;
     const list=document.getElementById('incidents-history-list'),box=modal.querySelector('.modal'),r=rect(box);
     list.scrollTop=list.scrollHeight;
     historyCases.push({count,height:r.height,top:r.y,bottom:r.bottom,viewport:innerHeight,scroll:list.scrollHeight,client:list.clientHeight,scrollTop:list.scrollTop,horizontal:list.scrollWidth>list.clientWidth,emptyText:count===0?list.textContent:null,padding:getComputedStyle(modal.querySelector('.admin-incident-history')).padding});
     modal.hidden=true;
   }
   state.rows=original;renderOperationalIncidents(state);
   const otherAfter=[...document.querySelectorAll('.dashboard-grid > article')].map(rect);
   return {cards,historyCases,otherBefore,otherAfter};
 })()`);
 if(contentSizing.cards.some(c=>Math.abs(c.height-c.expected)>2||Math.abs(c.activityGap-c.stackGap)>2||c.overflow))throw Error('Incident content sizing '+JSON.stringify({width,contentSizing}));
 if(contentSizing.historyCases.some(c=>c.top<0||c.bottom>c.viewport+1||c.horizontal)||contentSizing.historyCases[2].scroll<=contentSizing.historyCases[2].client||contentSizing.historyCases[2].scrollTop<=0||contentSizing.historyCases[0].height>contentSizing.historyCases[1].height||!contentSizing.historyCases[0].emptyText.includes('No hay incidencias'))throw Error('History content sizing '+JSON.stringify({width,contentSizing}));
 if(JSON.stringify(contentSizing.otherBefore)!==JSON.stringify(contentSizing.otherAfter))throw Error('Other cards changed '+width);
 results[results.length-1].contentSizing=contentSizing;
 await evaluate("window.historySizingBase=operationalIncidentState.rows.find(r=>r.status==='resolved');operationalIncidentState.rows=[];renderOperationalIncidents(operationalIncidentState);document.getElementById('incidents-list').scrollIntoView({block:'center'})");
 const emptyCardShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-empty-incidents.png'),Buffer.from(emptyCardShot.data,'base64'));
 await evaluate("document.getElementById('incidents-history-action').click()");
 const emptyHistoryShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-empty-history.png'),Buffer.from(emptyHistoryShot.data,'base64'));
 await evaluate("operationalIncidentState.rows=Array.from({length:40},(_,i)=>({...window.historySizingBase,id:'scroll-'+i,human_code:'INC-'+String(i+1).padStart(6,'0')}));renderOperationalIncidentHistory(operationalIncidentState);document.getElementById('incidents-history-list').scrollTop=document.getElementById('incidents-history-list').scrollHeight");
 const longHistoryShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-long-history.png'),Buffer.from(longHistoryShot.data,'base64'));

 }
 fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,results},null,2));
 }finally{chrome.kill();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
