const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',account='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function setup(handler,storage=new Map()){
 const calls=[],ctx={service_id:id,operational_status:'in_progress',pricing_status:'finalized',total_amount:100,paid_amount:0,pending_amount:100,currency_code:'EUR',financial_close:'pending'};
 let role='conductor',actor='local-actor';const window={crypto,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},ElaraAuth:{getCurrentUser:()=>({id:actor}),getActiveContext:()=>role},ElaraSupabase:{client:{rpc:async(name,args)=>{
  calls.push({name,args:JSON.parse(JSON.stringify(args))});if(handler){const r=await handler(name,args,ctx);if(r)return r;}
  if(name==='get_service_financial_close_context')return {data:{...ctx}};
  if(name==='advance_driver_service_progress'){ctx.operational_status='completed';return {data:[{operational_status:'completed'}]};}
  ctx.paid_amount=args.p_amount_received;ctx.pending_amount=100-args.p_amount_received;ctx.financial_close='resolved';ctx.payments=args.p_amount_received?[{payment_id:pid,amount:args.p_amount_received,status:'completed'}]:[];
  return {data:{service_id:id,financial_close:'resolved',payment_result:args.p_payment_result,amount_received:args.p_amount_received,paid_amount:args.p_amount_received,pending_amount:100-args.p_amount_received,total_amount:100,currency_code:'EUR',payment_id:args.p_amount_received?pid:null,cash_movement_id:args.p_amount_received?pid:null}};
 }}}};
 const document={addEventListener(){}};const scope={window,document,Uint8Array,Map,console};vm.createContext(scope);vm.runInContext(fs.readFileSync('src/js/financial-close.js','utf8'),scope);
 return {api:window.ElaraFinancialClose,window,document,calls,ctx,storage,role:r=>{role=r;},actor:a=>{actor=a;}};
}
test('0050 UI: driver completion and financial RPC are separate, in order, cash account not caller-selectable',async()=>{
 const s=setup(),a=s.api.operation('driver',id);const r=await s.api.execute(a,{result:'partial',amount:'40',reason:'customer_shortfall'});
 assert.deepEqual(s.calls.map(c=>c.name),['get_service_financial_close_context','advance_driver_service_progress','close_driver_service_financial']);
 assert.equal(r.result.pending_amount,60);assert.equal('p_cash_account_id'in s.calls[2].args,false);assert.ok(a.operationalDone);
});
test('0050 UI: lost financial response retries same key/payload, never operational completion twice',async()=>{
 let fail=true;const s=setup((name)=>{if(name==='close_driver_service_financial'&&fail){fail=false;throw Error('Lost response');}}),a=s.api.operation('driver',id);
 await assert.rejects(s.api.execute(a,{result:'partial',amount:40,reason:'short'}));assert.equal(s.ctx.operational_status,'completed');assert.equal(a.result,null);
 await s.api.execute(a,{result:'full',amount:100});const payments=s.calls.filter(c=>c.name==='close_driver_service_financial');assert.deepEqual(payments[0],payments[1]);assert.equal(s.calls.filter(c=>c.name==='advance_driver_service_progress').length,1);
});
test('0050 UI: lost operational response recovers completed state before financial close',async()=>{
 const s=setup((name,args,c)=>{if(name==='advance_driver_service_progress'){c.operational_status='completed';throw Error('HTTP response lost');}}),a=s.api.operation('driver',id);
 await s.api.execute(a,{result:'unpaid',reason:'not_received'});assert.equal(s.calls.filter(c=>c.name==='close_driver_service_financial').length,1);
});
test('0050 UI: operational cache refresh runs even when financial recording fails',async()=>{
 let refreshed=false;const s=setup(name=>{if(name==='close_driver_service_financial'){assert.ok(refreshed);return {error:{code:'23503',message:'Account missing'}};}}),a=s.api.operation('driver',id);
 await assert.rejects(s.api.execute(a,{result:'full'},async()=>{},async()=>{assert.equal(s.ctx.operational_status,'completed');refreshed=true;}));
 assert.ok(refreshed);assert.ok(a.operationalDone);assert.ok(a.rejected);assert.equal(a.result,null);
});
test('0050 UI: busy guard blocks double submit before first await',async()=>{
 let release;const gate=new Promise(r=>release=r);const s=setup(async name=>{if(name==='get_service_financial_close_context')await gate;}),a=s.api.operation('driver',id);
 const first=s.api.execute(a,{result:'full'});await assert.rejects(s.api.execute(a,{result:'full'}),/curso/);release();await first;assert.equal(s.calls.filter(c=>c.name==='close_driver_service_financial').length,1);
});
test('0050 UI: confirmed mutation plus failed refresh retries only reads',async()=>{
 const s=setup(),a=s.api.operation('driver',id);let reads=0;const refresh=async()=>{if(!reads++)throw Error('refresh lost');};
 assert.equal((await s.api.execute(a,{result:'full'},refresh)).refreshPending,true);const n=s.calls.length;
 assert.equal((await s.api.execute(a,{result:'full'},refresh)).refreshPending,false);assert.equal(s.calls.length,n);
});
test('0050 UI: draft and invalid amounts never send mutations; changed actor/context cannot replay',async()=>{
 const s=setup(),a=s.api.operation('driver',id);s.ctx.pricing_status='draft';await assert.rejects(s.api.execute(a,{result:'full'}),/Precio/);assert.equal(s.calls.length,1);
 s.ctx.pricing_status='finalized';for(const v of [{result:'partial',amount:0,reason:'x'},{result:'partial',amount:100,reason:'x'},{result:'partial',amount:20},{result:'unpaid'}])await assert.rejects(s.api.execute(a,v));
 s.actor('other');await assert.rejects(s.api.execute(a,{result:'full'}),/sesión/);s.actor('local-actor');s.role('administrativo');await assert.rejects(s.api.execute(a,{result:'full'}),/sesión/);
 assert.equal(s.calls.some(c=>c.name==='advance_driver_service_progress'),false);
});
test('0050 UI: CxC uses shared contract with administrative account, no mock bookkeeping',async()=>{
 const s=setup();s.role('administrativo');s.ctx.operational_status='completed';const a=s.api.operation('receivable',id,pid);await s.api.execute(a,{result:'partial',amount:20,reason:'additional',account});
 assert.equal(s.calls.at(-1).name,'collect_receivable_cash');assert.equal(s.calls.at(-1).args.p_receivable_id,pid);assert.equal(s.calls.at(-1).args.p_cash_account_id,account);
});
test('0050 UI: malformed financial response never confirms success',async()=>{
 const s=setup(name=>name==='close_driver_service_financial'?{data:{service_id:id,pending_amount:0,financial_close:'resolved'}}:null),a=s.api.operation('driver',id);
 await assert.rejects(s.api.execute(a,{result:'full'}),/no confirmada/);assert.equal(a.result,null);assert.ok(a.sent);
});
test('0050 UI: static production wiring keeps completion legacy blocked and offers recovery from history',()=>{
 const html=fs.readFileSync('src/index.html','utf8');assert.ok(html.indexOf('js/financial-close.js')<html.indexOf('js/driver.js'));
 const driver=fs.readFileSync('src/js/driver.js','utf8'),module=fs.readFileSync('src/js/financial-close.js','utf8');
 assert.match(driver,/expectedStage === "finished"[\s\S]{0,120}ElaraFinancialClose.open/);assert.match(driver,/Consultar \/ reintentar cierre financiero/);
 assert.doesNotMatch(module,/localStorage\s*[.\[]|complete_service|\.from\([^)]*\)\.(insert|update)|\balert\s*\(|\bconfirm\s*\(/);
});

// Small DOM adapter to exercise the real open/form submit and recovery status.
function dom(s){
 let form,body,element;const nodes=[],appended=[];const status={textContent:''},pending={textContent:''},summary={textContent:''},payments={textContent:''};
 s.document.createElement=tag=>{if(tag==='button')return {tagName:'BUTTON',disabled:false,textContent:''};const close={tagName:'BUTTON',disabled:false};body={isConnected:true,removeAttribute(){},append(node){appended.push(node);},querySelector:q=>q==='form'?form:q==='[data-financial-summary]'?summary:q==='[data-financial-payments]'?payments:null,set innerHTML(html){
  const elements={};for(const m of html.matchAll(/<input\b([^>]*)>|<textarea\b([^>]*)>([^<]*)<\/textarea>|<select\b([^>]*)>([\s\S]*?)<\/select>/g)){const attrs=m[1]||m[2]||m[4],name=attrs.match(/name="([^"]+)"/)?.[1];if(!name)continue;const value=m[1]?attrs.match(/value="([^"]*)"/)?.[1]||'':m[2]?m[3]:m[5].match(/value="([^"]*)"/)?.[1]||'';const n={value,tagName:m[1]?'INPUT':m[2]?'TEXTAREA':'SELECT',disabled:false};elements[name]=n;nodes.push(n);}
  const submit={tagName:'BUTTON',disabled:false,textContent:''};nodes.push(submit,close);form={elements,querySelector:q=>q==='[data-financial-status]'?status:q==='[data-financial-pending]'?pending:submit,querySelectorAll:()=>nodes.filter(n=>n.tagName!=='BUTTON')};
 }};
 element={className:'',isConnected:true,innerHTML:'',remove(){this.isConnected=false;},querySelector:q=>q==='[data-financial-dismiss]'?close:body,querySelectorAll:()=>nodes};return element;};
 s.document.body={append(){}};return {get form(){return form;},get element(){return element;},get body(){return body;},status,nodes,appended,summary,payments};
}
test('0050 UI: actual modal freezes values after transport loss and exposes financial-only recovery',async()=>{
 let fail=true;const s=setup(name=>{if(name==='close_driver_service_financial'&&fail){fail=false;throw Error('lost');}}),ui=dom(s);
 await s.api.open('driver',id);ui.form.elements.result.value='partial';ui.form.elements.amount.value='40';ui.form.elements.reason.value='short';
 await ui.form.onsubmit({preventDefault(){}});assert.match(ui.status.textContent,/Servicio completado; cierre financiero pendiente/);assert.equal(ui.form.elements.amount.disabled,true);
 await ui.form.onsubmit({preventDefault(){}});assert.equal(s.calls.filter(c=>c.name==='advance_driver_service_progress').length,1);assert.match(ui.status.textContent,/Cierre confirmado/);
});

test('0050 UI: confirmed close refreshes the visible payment list and balance from remote context',async()=>{
 const s=setup(),ui=dom(s);await s.api.open('driver',id);await ui.form.onsubmit({preventDefault(){}});
 assert.match(ui.summary.textContent,/Ya pagado: 100/);assert.match(ui.summary.textContent,/Pendiente: 0/);assert.match(ui.payments.textContent,new RegExp(pid));assert.match(ui.payments.textContent,/completed/);
});

test('0050 UI: reload recovers the same administrative receipt without minting a key or resending payment',async()=>{
 const storage=new Map();let saved,fail=true;
 const handler=(name,args)=>{
  if(name==='close_admin_service_financial'){saved={service_id:id,financial_close:'resolved',payment_result:args.p_payment_result,amount_received:args.p_amount_received,paid_amount:25,pending_amount:75,total_amount:100,currency_code:'EUR',payment_id:pid,cash_movement_id:pid};if(fail){fail=false;throw Error('Lost response');}return {data:saved};}
  if(name==='get_financial_close_receipt')return {data:{status:'applied',result:saved}};
 };
 const first=setup(handler,storage);first.role('administrativo');first.ctx.operational_status='completed';const a=first.api.operation('admin',id);
 await assert.rejects(first.api.execute(a,{result:'partial',amount:25,reason:'short',account}));const originalKey=a.key;
 const afterReload=setup(handler,storage);afterReload.role('administrativo');afterReload.ctx.operational_status='completed';afterReload.ctx.pending_amount=75;
 const recovered=afterReload.api.operation('receivable',id,pid);assert.equal(recovered.key,originalKey);assert.equal(recovered.kind,'admin');
 const r=await afterReload.api.execute(recovered,{});assert.equal(r.result.pending_amount,75);assert.equal(afterReload.calls.filter(c=>c.name==='close_admin_service_financial').length,0);
 assert.equal(afterReload.calls.filter(c=>c.name==='get_financial_close_receipt').length,1);
});

test('0050 UI: acknowledged receipt across Services/CxC permits exactly one explicit new CxC attempt',async()=>{
 const storage=new Map(),oldKey=crypto.randomUUID(),payload={p_service_id:id,p_payment_result:'partial',p_amount_received:25,p_cash_account_id:account,p_request_key:oldKey,p_reason_code:'short',p_notes:null};
 storage.set('elara.0050.retry/local-actor/administrativo/'+id,JSON.stringify({kind:'admin',id,receivableId:null,actor:'local-actor',context:'administrativo',key:oldKey,sent:JSON.stringify(payload)}));
 const result={service_id:id,financial_close:'resolved',payment_result:'partial',amount_received:25,paid_amount:25,pending_amount:75,total_amount:100,currency_code:'EUR',payment_id:pid,cash_movement_id:pid};
 const s=setup((name,args,c)=>{
  if(name==='get_financial_close_receipt')return {data:{status:'applied',result}};
  if(name==='collect_receivable_cash'){c.paid_amount=35;c.pending_amount=65;return {data:{...result,amount_received:10,paid_amount:35,pending_amount:65}};}
 },storage);s.role('administrativo');s.ctx.operational_status='completed';s.ctx.paid_amount=25;s.ctx.pending_amount=75;s.ctx.financial_close='resolved';
 s.window.ElaraOperationalData={readAll:async()=>[{id:account,status:'active',account_type:'central',currency_code:'EUR',name:'Local central'}],indexRecords(){},getCollection:()=>[{id:account,status:'active',account_type:'central',currency_code:'EUR',name:'Local central'}],readRpc:async()=>[]};
 const ui=dom(s);await s.api.open('admin',id);await s.api.open('receivable',id,pid);assert.equal(ui.form,undefined);
 await ui.appended.at(-1).onclick();assert.ok(ui.form);ui.form.elements.result.value='partial';ui.form.elements.amount.value='10';ui.form.elements.reason.value='additional';ui.form.elements.account.value=account;
 await ui.form.onsubmit({preventDefault(){}});const writes=s.calls.filter(c=>c.name==='collect_receivable_cash');assert.equal(writes.length,1);assert.equal(writes[0].args.p_receivable_id,pid);assert.notEqual(writes[0].args.p_request_key,oldKey);assert.equal(s.calls.some(c=>c.name==='close_admin_service_financial'),false);
});

test('0050 UI: uncommitted restored attempt replays identical payload/key, ambiguous receipt blocks writes',async()=>{
 const storage=new Map(),first=setup(name=>name==='close_admin_service_financial'?Promise.reject(Error('offline')):null,storage);first.role('administrativo');first.ctx.operational_status='completed';const a=first.api.operation('admin',id);
 await assert.rejects(first.api.execute(a,{result:'partial',amount:25,reason:'short',account}));
 const next=setup(name=>name==='get_financial_close_receipt'?{data:{status:'not_found'}}:null,storage);next.role('administrativo');next.ctx.operational_status='completed';
 await next.api.execute(next.api.operation('admin',id),{result:'full',account});assert.equal(next.calls.at(-1).args.p_request_key,a.key);assert.equal(next.calls.at(-1).args.p_amount_received,25);
 const ambiguous=setup(name=>name==='get_financial_close_receipt'?{data:{status:'unknown'}}:null,storage);ambiguous.role('administrativo');ambiguous.ctx.operational_status='completed';
 await assert.rejects(ambiguous.api.execute(ambiguous.api.operation('admin',id),{}),/ambiguo/);assert.equal(ambiguous.calls.some(c=>c.name==='close_admin_service_financial'),false);
 storage.set([...storage.keys()][0],'{broken');assert.throws(()=>ambiguous.api.operation('admin',id),/ambiguo/);
});

test('0050 UI: zero price uses explicit no_charge, never full/partial/unpaid or a custody account',async()=>{
 const s=setup();s.ctx.total_amount=0;s.ctx.pending_amount=0;s.ctx.no_charge=true;const a=s.api.operation('driver',id);
 const payload=s.api.args(a,{},s.ctx);assert.equal(payload.p_payment_result,'no_charge');assert.equal(payload.p_amount_received,0);assert.equal('p_cash_account_id'in payload,false);
 const ui=dom(s);await s.api.open('driver',id);assert.equal(ui.form,undefined); // no collection-result selector is rendered
 assert.match(fs.readFileSync('src/js/financial-close.js','utf8'),/Sin importe a cobrar/);
});

test('0050 UI: corrupt retry envelope exposes read-only review and never creates a new charge',async()=>{
 const s=setup();s.role('administrativo');s.ctx.operational_status='completed';s.storage.set('elara.0050.retry/local-actor/administrativo/'+id,'{corrupt');const ui=dom(s);
 await s.api.open('admin',id);assert.equal(ui.form,undefined);assert.match(ui.body.textContent,/ambiguo/);
 const review=ui.appended.find(b=>b.textContent==='Revisar estado del cobro');assert.ok(review);await review.onclick();
 assert.match(ui.body.textContent,/no se habilita otro cobro/);assert.deepEqual(s.calls.map(c=>c.name),['get_service_financial_close_context']);
});

test('0050 UI: completed financial indicators and the dedicated filter use real context, never balances as a substitute',()=>{
 const s=fs.readFileSync('src/js/services.js','utf8');assert.match(s,/ElaraFinancialClose.context\(row.service_id\)/);assert.match(s,/financial_close==='pending'\?'Cierre financiero pendiente'/);assert.match(s,/c.no_charge\?'Sin importe a cobrar · resuelto'/);assert.match(s,/rowActions:[\s\S]*?Revisar cierre/);
});

function cashSetup(handler){
 let role='administrativo',current='submitted',verified=null,release;const calls=[];
 const row=()=>({remittance_id:id,status:current,verified_amount:verified,declared_amount:100,currency_code:'EUR'});
 const window={ElaraAuth:{getCurrentUser:()=>({id:'actor'}),getActiveContext:()=>role},ElaraOperationalData:{readDetail:async()=>row(),getCollection:()=>[]},ElaraSupabase:{client:{rpc:async(name,args)=>{calls.push({name,args});if(handler){const r=await handler(name,args,{set:s=>{current=s;verified=args.p_verified_amount;},gate:new Promise(r=>release=r)});if(r)return r;}current=name==='receive_cash_remittance'?'received':'verified';verified=args.p_verified_amount;return {data:[row()]};}}}};
 const scope={window,document:{addEventListener(){}},Intl,Set,console};vm.createContext(scope);const source=fs.readFileSync('src/js/cash.js','utf8');vm.runInContext(source.slice(source.indexOf('window.ElaraCashRemittance =')),scope);
 return {api:window.ElaraCashRemittance,calls,role:r=>role=r,state:s=>current=s,release:()=>release?.()};
}

test('0050 Caja UI: receive/verify and replay reread backend; no second mutation or customer payment',async()=>{
 const s=cashSetup();await s.api.execute('receive',id);assert.equal((await s.api.execute('receive',id)).replayed,true);await s.api.execute('verify',id,100);assert.equal((await s.api.execute('verify',id,100)).replayed,true);
 assert.deepEqual(s.calls.map(c=>c.name),['receive_cash_remittance','verify_cash_remittance']);await assert.rejects(s.api.execute('verify',id,90),/otro importe/);
});

test('0050 Caja UI: double submit, invalid state and non-admin do not send extra mutations',async()=>{
 const s=cashSetup(async(name,args,c)=>{await c.gate;return null;});const pending=s.api.execute('receive',id);await new Promise(r=>setImmediate(r));await assert.rejects(s.api.execute('receive',id),/curso/);s.release();await pending;assert.equal(s.calls.length,1);
 s.state('cancelled');await assert.rejects(s.api.execute('verify',id,100),/estado/);s.role('conductor');await assert.rejects(s.api.execute('receive',id),/administrativa/);assert.equal(s.calls.length,1);
});

test('0050 Caja UI: lost committed reply is resolved by authoritative state without another RPC',async()=>{
 const s=cashSetup((name,args,c)=>{c.set('received');throw Error('lost');});assert.equal((await s.api.execute('receive',id)).replayed,true);assert.equal((await s.api.execute('receive',id)).replayed,true);assert.equal(s.calls.length,1);
});
