const{test}=require('node:test'),assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto'),path=require('path');
if(!process.env.ELARA_PGLITE_ROOT)throw Error('Local DOM runtime required');
const{parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',old='60000000-0000-4000-8000-000000000100',identity='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',newId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function setup(storage=new Map()){
 const{document,HTMLElement}=parseHTML('<html><body><section id="caja"><div data-operational-panel></div></section></body></html>');
 // Linkedom omits these standard browser form/focus APIs; business code remains real.
 if(!Object.getOwnPropertyDescriptor(HTMLElement.prototype,'elements'))Object.defineProperty(HTMLElement.prototype,'elements',{get(){if(this.tagName!=='FORM')return undefined;return Object.fromEntries([...this.querySelectorAll('[name]')].map(x=>[x.getAttribute('name'),x]));}});
 HTMLElement.prototype.focus=function(){document._focused=this};Object.defineProperty(document,'activeElement',{get:()=>document._focused});
 let actor='operator',role='superadmin',edgeHandler;const calls=[],ctx={driver_id:id,state:'none',attempt:null},central={eligible:true,old_id:old,snapshot:{account:{id:old,name:'Historical QA',currency_code:'EUR',opening_balance:0},movements:[],remittances:[{id:'one',status:'submitted',declared_amount:0,currency_code:'EUR'},{id:'two',status:'submitted',declared_amount:75,currency_code:'EUR'}]}};
 let applied=null;
 const window={crypto,sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},ElaraAuth:{getCurrentUser:()=>({id:actor}),getActiveContext:()=>role},ElaraSupabase:{client:{rpc:async(name,args)=>{
  calls.push({name,args:structuredClone(args)});
  if(name==='get_admin_driver_portal_access_context')return{data:structuredClone(ctx)};
  if(name==='get_admin_operational_central_context')return{data:structuredClone(central)};
  if(name==='get_admin_control_receipt')return{data:applied?{status:'applied',result:applied,audit_id:identity}:{status:'not_found'}};
  if(name==='admin_initialize_operational_central'){applied={state:'initialized',old_status:'suspended',new_status:'active',new_id:newId};return{data:applied};}
  if(name==='admin_revoke_driver_portal_access'){ctx.state='revoked';return{data:{state:'revoked',driver_id:id}};}
  throw Error('Unexpected RPC');
 },functions:{invoke:async(name,{body})=>{calls.push({name,args:structuredClone(body)});if(edgeHandler)return edgeHandler(body);ctx.state='pending';return{data:{state:'linked'}}}}}}};
 const scope={window,document,Map,console,URL,URLSearchParams};vm.createContext(scope);vm.runInContext(fs.readFileSync('src/js/admin-controls.js','utf8'),scope);
 return{api:window.ElaraAdminControls,document,window,storage,calls,ctx,central,setRole:v=>role=v,setActor:v=>actor=v,edge:fn=>edgeHandler=fn,setApplied:v=>applied=v};
}
const submit=form=>form.onsubmit({preventDefault(){}}),payload={driver_id:id,email:'driver@example.invalid',email_confirmation:'driver@example.invalid',reason:'Local UI test',confirm_existing:false};
test('0051 UI: actions require superadmin, handler is delegated once and no mutation runs on load',async()=>{
 const s=setup();assert.equal(s.calls.length,0);s.setRole('administrativo');assert.equal(await s.api.driverActions(id),'');s.api.attachCash();assert.equal(s.document.querySelector('[data-admin-control]'),null);assert.throws(()=>s.api.prepare('access',id,payload));
 s.setRole('superadmin');assert.match(await s.api.driverActions(id),/Sin acceso/);s.api.attachCash();s.api.attachCash();assert.equal(s.document.querySelectorAll('[data-admin-control="central"]').length,1);
});
test('0051 UI: immutable retry envelope survives reload, corruption and changed actor fail closed',async()=>{
 const s=setup(),a=s.api.prepare('access',id,payload);assert.equal(s.api.prepare('access',id,{...payload,email:'changed'}).payload.email,payload.email);
 const reload=setup(s.storage);assert.equal(reload.api.restore('access',id).payload.request_id,a.payload.request_id);s.setActor('other');await assert.rejects(s.api.run(a));
 const key=[...s.storage.keys()][0];s.storage.set(key,'broken');const corrupt=setup(s.storage);assert.throws(()=>corrupt.api.restore('access',id));assert.equal(corrupt.calls.length,0);
});
test('0051 UI: double submit and lost reply preserve key; no optimistic success',async()=>{
 const s=setup(),a=s.api.prepare('access',id,payload);let release;s.edge(()=>new Promise(r=>release=r));const pending=s.api.run(a);await new Promise(r=>setImmediate(r));await assert.rejects(s.api.run(a));release({error:{message:'lost'}});await assert.rejects(pending);
 s.edge(()=>({data:{state:'pending'}}));assert.equal((await s.api.run(a)).state,'pending');const sent=s.calls.filter(x=>x.name==='driver-portal-access');assert.deepEqual(sent[0].args,sent[1].args);
});
test('0051 UI: actual access modal confirms email, freezes payload and displays backend state',async()=>{
 const s=setup();await s.api.openDriver(id);assert.equal(s.document.querySelector('[role="dialog"]').getAttribute('aria-modal'),'true');const form=s.document.querySelector('[data-access-form]');
 form.elements.email.value=payload.email;form.elements.email_confirmation.value='different@example.invalid';form.elements.reason.value='Local';await submit(form);assert.equal(s.calls.some(x=>x.name==='driver-portal-access'),false);
 form.elements.email_confirmation.value=payload.email;await submit(form);assert.match(form.querySelector('[role="status"]').textContent,/Invitación pendiente/);assert.equal(form.elements.email.disabled,true);
});
test('0051 UI: reload restores server attempt without dispatching an invitation',async()=>{
 const s=setup();s.ctx.state='pending';s.ctx.attempt={request_id:crypto.randomUUID(),email:payload.email,reason:'Restored',confirm_existing:false,owned:true};await s.api.openDriver(id);const form=s.document.querySelector('[data-access-form]');assert.equal(form.elements.email.value,payload.email);assert.equal(form.elements.email.disabled,true);assert.equal(s.calls.some(x=>x.name==='driver-portal-access'),false);assert.equal(s.api.restore('access',id).payload.request_id,s.ctx.attempt.request_id);
});
test('0051 UI: existing identity requires checkbox and exact reviewed ID; revoked access cannot submit',async()=>{
 const s=setup();s.ctx.state='pending';s.ctx.candidate_auth_user_id=identity;s.edge(body=>{if(!body.approve_existing)return{data:{state:'requires_review',expected_auth_user_id:identity}};s.ctx.state='active';return{data:{state:'linked'}}});await s.api.openDriver(id);const form=s.document.querySelector('[data-access-form]');Object.assign(form.elements.email,{value:payload.email});form.elements.email_confirmation.value=payload.email;form.elements.reason.value='review';await submit(form);assert.match(form.querySelector('[role="status"]').textContent,/Requiere revisión/);form.elements.approve.checked=true;await submit(form);assert.equal(s.calls.filter(x=>x.name==='driver-portal-access').at(-1).args.expected_auth_user_id,identity);assert.match(form.querySelector('[role="status"]').textContent,/Acceso activo/);
 s.ctx.state='revoked';await s.api.openDriver(id);assert.equal(s.document.querySelector('[data-access-form]'),null);assert.match(s.document.body.textContent,/Revocado/);
});
test('0051 UI: central modal presents snapshot and requires explicit acknowledgement',async()=>{
 const s=setup();await s.api.openCentral();assert.match(s.document.body.textContent,/75/);assert.match(s.document.body.textContent,/conservarán su destino/);const form=s.document.querySelector('form');form.elements.name.value='Operational';form.elements.reason.value='Reviewed';form.elements.ack.checked=false;await submit(form);assert.equal(s.calls.some(x=>x.name==='admin_initialize_operational_central'),false);
});
test('0051 UI: central success/reload reads receipt and never repeats mutation',async()=>{
 const s=setup();await s.api.openCentral();const form=s.document.querySelector('form');form.elements.name.value='Operational';form.elements.reason.value='Reviewed';form.elements.ack.checked=true;await submit(form);assert.match(form.querySelector('[role="status"]').textContent,/suspended.*active/);
 const reload=setup(s.storage);reload.setApplied({state:'initialized',old_status:'suspended',new_status:'active',new_id:newId});await reload.api.openCentral();assert.match(reload.document.body.textContent,/Confirmado por recibo/);assert.equal(reload.calls.some(x=>x.name==='admin_initialize_operational_central'),false);
});
test('0051 UI: changed snapshot blocks central mutation',async()=>{
 const s=setup(),a=s.api.prepare('central','initialize',{p_expected_old_id:old,p_expected_snapshot:structuredClone(s.central.snapshot),p_new_name:'Operational',p_reason:'Reviewed',p_acknowledge_frozen_qa:true,p_currency_code:'EUR'});s.central.snapshot.account.opening_balance=1;await assert.rejects(s.api.run(a),e=>e.code==='40001');assert.equal(s.calls.some(x=>x.name==='admin_initialize_operational_central'),false);
});
test('0051 UI: production wiring uses real RPCs and no native dialogs/business mocks/secrets',()=>{
 const s=fs.readFileSync('src/js/admin-controls.js','utf8');assert.doesNotMatch(s,/\balert\s*\(|\bconfirm\s*\(|localStorage|service_role|SERVICE_ROLE|\.from\([^)]*\)\.(insert|update)|Mock/);assert.match(fs.readFileSync('src/js/catalog-admin.js','utf8'),/ElaraAdminControls\?\.driverActions/);assert.match(fs.readFileSync('src/js/cash.js','utf8'),/ElaraAdminControls\?\.attachCash/);assert.match(s,/aria-modal="true"/);assert.match(s,/e.key==='Tab'/);
});

function inviteApi(){const window={},document={addEventListener(){}};vm.runInNewContext(fs.readFileSync('src/js/accept-invite.js','utf8'),{window,document,URL,URLSearchParams});return window.ElaraInviteAcceptance;}
test('0051 invitation: an existing admin session is never treated as an invitation',async()=>{
 const api=inviteApi(),client={auth:{getSession:async()=>({data:{session:{access_token:'admin-session',user:{id}}}})}};
 await assert.rejects(api.verifyCallback(client,new URL('https://example.invalid/accept-invite.html')));await assert.rejects(api.verifyCallback(client,new URL('https://example.invalid/accept-invite.html#type=invite&access_token=invalid&refresh_token=invalid')));
});
test('0051 invitation: validated callback checks user and does not expose tokens in page/logs',async()=>{
 const api=inviteApi(),client={auth:{getSession:async()=>({data:{session:{access_token:'local-invite',user:{id}}}}),getUser:async()=>({data:{user:{id}}})}};assert.equal(await api.verifyCallback(client,new URL('https://example.invalid/accept-invite.html#type=invite&access_token=local-invite&refresh_token=local-only')),id);
 const source=fs.readFileSync('src/js/accept-invite.js','utf8');assert.doesNotMatch(source,/console\.|localStorage|service_role/);assert.match(source,/history.replaceState/);const html=fs.readFileSync('src/accept-invite.html','utf8');assert.match(html,/no-referrer/);for(const match of html.matchAll(/href="(css\/[^"?]+)"/g))assert.ok(fs.existsSync('src/'+match[1]));
});
async function acceptance(client){
 const{document,HTMLElement}=parseHTML(fs.readFileSync('src/accept-invite.html','utf8'));if(!Object.getOwnPropertyDescriptor(HTMLElement.prototype,'elements'))Object.defineProperty(HTMLElement.prototype,'elements',{get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(x=>[x.getAttribute('name'),x]));}});
 const form=document.getElementById('invite-form');form.reset=()=>form.querySelectorAll('input').forEach(x=>x.value='');let destination,cleaned;
 const window={ElaraSupabase:{client},location:{href:'https://example.invalid/accept-invite.html#type=invite&access_token=local-invite&refresh_token=local-only',pathname:'/accept-invite.html',replace:v=>destination=v},history:{replaceState:(a,b,url)=>cleaned=url}};
 vm.runInNewContext(fs.readFileSync('src/js/accept-invite.js','utf8'),{window,document,URL,URLSearchParams});await window.ElaraInviteAcceptance.start();return{form,document,get destination(){return destination},get cleaned(){return cleaned}};
}
function acceptanceClient(){let updates=0,rpcs=0;const client={auth:{getSession:async()=>({data:{session:{access_token:'local-invite',user:{id}}}}),getUser:async()=>({data:{user:{id}}}),updateUser:async()=>{updates++;return{data:{user:{id}}}}},rpc:async()=>{rpcs++;return{data:[{active_context:'conductor'}]}}};return{client,get updates(){return updates},get rpcs(){return rpcs}};}
test('0051 invitation: actual page validates passwords, cleans URL and opens the conductor context',async()=>{
 const c=acceptanceClient(),s=await acceptance(c.client);assert.equal(s.form.hidden,false);assert.equal(s.cleaned,'/accept-invite.html');s.form.elements.password.value='Local-password-123';s.form.elements.confirmation.value='wrong';await submit(s.form);assert.equal(c.updates,0);s.form.elements.confirmation.value='Local-password-123';await submit(s.form);assert.equal(c.updates,1);assert.equal(c.rpcs,1);assert.equal(s.destination,'index.html#mis-servicios');assert.equal(s.form.elements.password.value,'');
});
test('0051 invitation: pending functional access retries bootstrap without another password update',async()=>{
 const c=acceptanceClient();let fail=true;c.client.rpc=async()=>fail?{error:{code:'28000'}}:{data:[{active_context:'conductor'}]};const s=await acceptance(c.client);s.form.elements.password.value=s.form.elements.confirmation.value='Local-password-123';await submit(s.form);const button=s.document.getElementById('invite-retry');assert.equal(button.hidden,false);assert.match(s.document.getElementById('invite-status').textContent,/Administración/);fail=false;await button.onclick();assert.equal(c.updates,1);assert.equal(s.destination,'index.html#mis-servicios');
});
test('0051 invitation: changed identity before submit cannot change a password',async()=>{
 const c=acceptanceClient(),s=await acceptance(c.client);c.client.auth.getUser=async()=>({data:{user:{id:identity}}});s.form.elements.password.value=s.form.elements.confirmation.value='Local-password-123';await submit(s.form);assert.equal(c.updates,0);assert.equal(s.destination,undefined);
});
