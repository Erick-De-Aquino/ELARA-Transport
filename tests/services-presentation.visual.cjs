const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os'),{spawn}=require('node:child_process');
const {fixtureRows,fixtureTables,readClient,uuid}=require('./services-presentation-harness.cjs');
(async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'elara-phase1a-')),tables=fixtureTables(fixtureRows());
 tables.service_passengers=[{id:uuid(800),service_id:uuid(1),display_name:'Pasajero de prueba',phone:'+34000000000',is_primary:true}];
 tables.service_locations[0].address='Dirección de origen de prueba larga, avenida principal 123';tables.service_locations[1].address='Dirección de destino de prueba larga, calle secundaria 456';
 tables.service_assignments=[{id:uuid(801),service_id:uuid(1),driver_id:uuid(600),vehicle_id:uuid(700),assignment_status:'accepted'}];
 tables.service_financials=[{id:uuid(802),service_id:uuid(1),pricing_status:'finalized',financial_status:'partial',currency_code:'EUR',taxable_base_amount:18.18,tax_rate:10,tax_amount:1.82,total_amount:20,paid_amount:7,pending_amount:13}];
 tables.service_payments=[{id:uuid(803),human_code:'PAY-000001',service_id:uuid(1),amount:7,currency_code:'EUR',payment_status:'completed',payment_method:'cash',registered_at:'2026-11-14T14:39:00Z'}];
 tables.persons=[{id:uuid(810),first_name:'Responsable',last_name:'de prueba'}];tables.drivers[0].person_id=uuid(810);
 tables.service_status_history=[
 {id:uuid(811),service_id:uuid(1),from_status:'pending',to_status:'confirmed',changed_at:'2026-11-14T13:00:00Z',changed_by_driver_id:uuid(600),metadata:{active_context:'conductor'}},
 {id:uuid(812),service_id:uuid(1),from_status:'confirmed',to_status:'in_progress',changed_at:'2026-11-14T14:00:00Z',changed_by_driver_id:uuid(600),metadata:{driver_stage:'on_way'}},
 {id:uuid(813),service_id:uuid(1),from_status:'in_progress',to_status:'completed',changed_at:'2026-11-14T15:00:00Z',changed_by_driver_id:uuid(600),metadata:{driver_stage:'finished'}}];
 let html=fs.readFileSync('src/index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link[^>]+(?:https:|manifest)[^>]*>/gi,'');
 const bootstrap=`document.body.className='';document.querySelector('.app-shell').hidden=false;for(const e of document.body.children)if(!e.classList.contains('app-shell')&&e.tagName!=='SCRIPT')e.hidden=true;for(const v of document.querySelectorAll('.view'))v.hidden=v.id!=='servicios';window.ElaraAuth={getCurrentUser:()=>({id:'visual'}),getActiveContext:()=> 'administrativo'};const tables=${JSON.stringify(tables)};window.ElaraSupabase={client:(${readClient.toString()})(tables,[])};window.ElaraFinancialClose={context:async()=>({financial_close:'pending'})};window.ElaraServicesMock={};Object.defineProperty(window.ElaraServicesMock,'services',{get(){throw Error('Mock accessed')}});`;
 html=html.replace('</body>',`<script>${bootstrap}</script><script src="js/operational-data.js"></script><script src="js/services.js"></script><script>showOperationalServices().then(()=>window.ready=true)</script></body>`);
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
 const metrics=await evaluate(`(()=>{const p=document.querySelector('[data-operational-panel]'),list=p.querySelector('.services-list-wrapper'),card=p.querySelector('.operation-card'),view=document.getElementById('servicios');const bounds=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflowY:getComputedStyle(e).overflowY}};return {viewport:innerWidth,panel:bounds(p),view:bounds(view),list:bounds(list),card:bounds(card),buttons:[...card.querySelectorAll('button')].map(bounds),clientDisplay:getComputedStyle(card.querySelector('.operation-card__client')).display,bodyWidth:document.documentElement.scrollWidth,cardCount:p.querySelectorAll('.operation-card').length}})()`);if(metrics.panel.scrollWidth>metrics.panel.clientWidth+1||metrics.card.scrollWidth>metrics.card.clientWidth+1||metrics.clientDisplay==='none')throw Error('Responsive overflow/hidden client at '+width);results.push({width,...metrics});
 const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,width+'.png'),Buffer.from(shot.data,'base64'));
 await evaluate("document.querySelector('.operation-card').scrollIntoView({block:'start'})");
 const cardShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,width+'-cards.png'),Buffer.from(cardShot.data,'base64'));
 await evaluate("document.querySelector('[data-operational-next]').scrollIntoView({block:'center'})");
 const bottom=await evaluate("(()=>{const e=document.querySelector('[data-operational-next]'),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight}})()");if(bottom.top<0||bottom.bottom>bottom.viewport)throw Error('Pagination unreachable '+width);results[results.length-1].paginationReachable=true;
 const bottomShot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,width+'-bottom.png'),Buffer.from(bottomShot.data,'base64'));

 await evaluate(`openOperationalServiceDetail('${uuid(1)}')`);
 const detail=await evaluate("(()=>{const m=document.getElementById('service-summary-modal'),body=document.getElementById('service-detail-view'),r=m.querySelector('.modal').getBoundingClientRect(),ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,viewport:innerHeight,width:body.clientWidth,scrollWidth:body.scrollWidth,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,uuid:m.dataset.serviceId,passenger:document.getElementById('summary-service-passenger').textContent,unique:new Set(ids).size===ids.length}})()");
 if(detail.left<0||detail.right>width+1||detail.top<0||detail.bottom>detail.viewport+1||detail.scrollWidth>detail.width+1||!detail.unique||!detail.passenger.includes('Pasajero'))throw Error('Service detail layout '+JSON.stringify({width,detail}));
 const detailShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-detail.png'),Buffer.from(detailShot.data,'base64'));
 await evaluate("const b=document.getElementById('service-detail-view');b.scrollTop=b.scrollHeight");
 const finance=await evaluate("(()=>{const b=document.getElementById('service-detail-view'),e=document.getElementById('summary-service-payment-history'),r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight,scrollTop:b.scrollTop,total:document.getElementById('summary-service-financial-total').textContent}})()");
 if(finance.bottom>finance.viewport+1||finance.top<0||!finance.total.includes('20,00'))throw Error('Finance unreachable '+JSON.stringify({width,finance}));
 const financeShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-detail-finance.png'),Buffer.from(financeShot.data,'base64'));
 results[results.length-1].detail={...detail,finance};
 await evaluate("document.getElementById('service-operational-history').open=true");
 for(let i=0;i<100;i++){if(await evaluate("document.querySelectorAll('[data-service-history-event]').length===3"))break;await new Promise(r=>setTimeout(r,30));}
 await evaluate("const body=document.getElementById('service-detail-view');body.scrollTop=body.scrollHeight");
 const history=await evaluate("(()=>{const e=document.getElementById('service-operational-history-content'),r=e.getBoundingClientRect(),ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return {top:r.top,bottom:r.bottom,width:e.clientWidth,scroll:e.scrollWidth,viewport:innerHeight,events:e.querySelectorAll('[data-service-history-event]').length,unique:new Set(ids).size===ids.length,bodyWidth:document.getElementById('service-detail-view').clientWidth,bodyScroll:document.getElementById('service-detail-view').scrollWidth}})()");
 if(history.events!==3||!history.unique||history.scroll>history.width+1||history.bodyScroll>history.bodyWidth+1||history.bottom>history.viewport+1)throw Error('Operational history layout '+JSON.stringify({width,history}));
 const historyShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-operational-history.png'),Buffer.from(historyShot.data,'base64'));
 results[results.length-1].detail.history=history;
 await evaluate("document.querySelector('#service-summary-modal [data-modal-close]').click()");
 await evaluate("document.getElementById('services-history-action').click();document.getElementById('services-history-panel').scrollIntoView({block:'start'})");
 const archive=await evaluate("(()=>{const p=document.getElementById('services-history-panel'),cards=[...p.querySelectorAll('[data-historical-service-id]')],r=p.getBoundingClientRect(),ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return {width:p.clientWidth,scroll:p.scrollWidth,left:r.left,right:r.right,visible:!p.hidden,mainHidden:document.querySelector('[data-operational-panel]').hidden,count:cards.length,cardOverflow:cards.some(e=>e.scrollWidth>e.clientWidth+1),unique:new Set(ids).size===ids.length}})()");
 if(!archive.visible||!archive.mainHidden||!archive.count||archive.scroll>archive.width+1||archive.cardOverflow||!archive.unique)throw Error('Archive responsive '+JSON.stringify({width,archive}));
 const archiveShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-closed-history.png'),Buffer.from(archiveShot.data,'base64'));
 await evaluate("document.getElementById('services-history-next').scrollIntoView({block:'center'})");
 const archiveBottom=await evaluate("(()=>{const r=document.getElementById('services-history-next').getBoundingClientRect();return {top:r.top,bottom:r.bottom,viewport:innerHeight}})()");
 if(archiveBottom.top<0||archiveBottom.bottom>archiveBottom.viewport)throw Error('Archive pagination unreachable '+width);
 await evaluate("document.querySelector('[data-history-service-detail]').click()");
 for(let i=0;i<100;i++){if(await evaluate("Boolean(operationalServiceDetail?.loaded)"))break;await new Promise(r=>setTimeout(r,30));}
 const archiveDetail=await evaluate("(()=>{const m=document.getElementById('service-summary-modal');return {visible:!m.hidden,uuid:m.dataset.serviceId,expected:document.querySelector('[data-history-service-detail]').dataset.historyServiceDetail,actionsHidden:['assign','reassign','edit','cancel-service'].every(k=>document.getElementById('service-detail-'+k).hidden)}})()");
 if(!archiveDetail.visible||archiveDetail.uuid!==archiveDetail.expected||!archiveDetail.actionsHidden)throw Error('Archive detail '+JSON.stringify(archiveDetail));
 await evaluate("document.getElementById('service-operational-history').open=true");
 for(let i=0;i<100;i++){if(await evaluate("operationalServiceDetail?.historyStatus==='loaded'"))break;await new Promise(r=>setTimeout(r,30));}
 const archiveDetailShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,width+'-closed-detail.png'),Buffer.from(archiveDetailShot.data,'base64'));
 await evaluate("document.querySelector('#service-summary-modal [data-modal-close]').click();document.getElementById('services-history-action').click()");
 if(!await evaluate("document.getElementById('services-history-panel').hidden&&!document.querySelector('[data-operational-panel]').hidden"))throw Error('Archive return failed');
 results[results.length-1].archive={...archive,pagination:archiveBottom,detail:archiveDetail};

 }
 fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({out,results},null,2));
 }finally{chrome.kill();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
