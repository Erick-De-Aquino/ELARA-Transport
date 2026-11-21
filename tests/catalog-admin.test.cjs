const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const root=require('node:path').resolve(__dirname,'..');
const ids={person:'10000000-0000-4000-8000-000000000011',customer:'20000000-0000-4000-8000-000000000011',driver:'30000000-0000-4000-8000-000000000011',vehicle:'40000000-0000-4000-8000-000000000011',document:'50000000-0000-4000-8000-000000000011',link:'60000000-0000-4000-8000-000000000011'};
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(handler) {
 const calls=[];let reads=0;
 const tables={persons:[{id:ids.person,status:'active'}],customers:[{id:ids.customer,customer_type:'individual',status:'new'}],drivers:[{id:ids.driver,person_id:ids.person,administrative_status:'active'}],vehicles:[{id:ids.vehicle,ownership_type:'owned',manual_operational_status:'available',elara_approval_status:'not_required'}],driver_vehicle_assignments:[],vehicle_documents:[],vehicle_document_types:[{key:'insurance',is_active:true,required_for_owned:true,expires_required:true}],vehicle_technical_incidents:[],vehicle_maintenance_records:[],vehicle_status_reasons:[]};
 const window={crypto,ElaraAuth:{getCurrentUser:()=>({id:'actor'}),getActiveContext:()=> 'administrativo'},ElaraSupabase:{client:{rpc:async(name,args)=>{calls.push({name,args:plain(args)});return handler?handler(name,args):{data:[result(name,args)],error:null};}}}};
 window.ElaraSupabase.client.supabaseUrl='http://127.0.0.1:54421';window.ElaraSupabase.getPublicConfig=()=>({url:'http://127.0.0.1:54421'});
 const {parseHTML}=require(require('path').join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
 const {document,HTMLElement,HTMLSelectElement}=parseHTML(fs.readFileSync(root+'/src/index.html','utf8'));
 Object.defineProperty(HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===v);}});
 if(!Object.getOwnPropertyDescriptor(HTMLElement.prototype,'elements'))Object.defineProperty(HTMLElement.prototype,'elements',{get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(e=>{if(e.tagName==='SELECT'&&!Object.hasOwn(e,'value'))Object.defineProperty(e,'value',{configurable:true,writable:true,value:e.querySelector('option[selected]')?.value||''});return [e.name,e];}));}});
 HTMLElement.prototype.checkValidity=()=>true;HTMLElement.prototype.reportValidity=()=>{};
 const events=new Map();window.addEventListener=(name,handler)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(handler);};window.dispatchEvent=event=>{for(const f of events.get(event.type)||[])f(event);};window.location={hash:'#clientes'};
 const context={window,console,document,Intl,Date,Set,Map};vm.createContext(context);
 vm.runInContext(fs.readFileSync(root+'/src/js/operational-data.js','utf8'),context);
 const real=window.ElaraOperationalData;real.indexRecords(tables);
 window.ElaraOperationalData={...real,loadIdentity:async()=>{reads++;real.indexRecords(tables);},getCollection:n=>(tables[n]||[]).filter(real.isOperationalRecord),readAll:async n=>tables[n]||[],related:async(n,k,id)=>(tables[n]||[]).filter(r=>r[k]===id&&real.isOperationalRecord(r))};
 vm.runInContext(fs.readFileSync(root+'/src/js/catalog-admin.js','utf8'),context);
 return {api:window.ElaraCatalogAdmin,calls,tables,window,context,reads:()=>reads};
}
function result(name,a) {
 switch(name){
 case 'admin_create_individual_customer':return {person_id:ids.person,customer_id:ids.customer,customer_human_code:'CUS-000011',status:'new'};
 case 'admin_set_customer_status':return {customer_id:a.p_customer_id,status:a.p_status,inactive_at:a.p_status==='inactive'?'2026-10-22T10:00:00Z':null};
 case 'admin_create_driver':return {person_id:ids.person,driver_id:ids.driver,driver_human_code:'DRV-000011',administrative_status:'active',availability_preference:'unavailable'};
 case 'admin_update_driver':return {driver_id:a.p_driver_id,administrative_status:a.p_administrative_status||'active',inactive_at:null};
 case 'admin_create_vehicle':return {vehicle_id:ids.vehicle,human_code:'VEH-000011',plate_normalized:'1234ABC',manual_operational_status:a.p_manual_status,elara_approval_status:'not_required',inactive_at:null};
 case 'admin_inactivate_vehicle':return {vehicle_id:a.p_vehicle_id,inactive_at:'2026-10-22T10:00:00Z',manual_operational_status:'unavailable'};
 case 'admin_register_vehicle_document':return {document_id:ids.document,vehicle_id:a.p_vehicle_id,document_type_key:a.p_document_type,status:a.p_status,replaced_document_id:a.p_replaces_document_id};
 case 'admin_assign_driver_vehicle':return {assignment_id:ids.link,driver_id:a.p_driver_id,vehicle_id:a.p_vehicle_id,status:'active',started_at:'2026-10-22T10:00:00Z'};
 case 'admin_close_driver_vehicle_assignment':return {assignment_id:a.p_assignment_id,status:'ended',started_at:'2026-10-22T10:00:00Z',ended_at:'2026-10-22T11:00:00Z'};
 }
}
const cases=[
 ['customerCreate','admin_create_individual_customer',{firstName:' Ana ',lastName:' Ruiz ',internalNotes:' interna ',needs:'ignored',company:'ignored',email:'',countryCode:'+34'}, {p_first_name:'Ana',p_last_name:'Ruiz',p_phone:null,p_email:null,p_notes:null,p_internal_notes:'interna'}],
 ['customerStatus','admin_set_customer_status',{customerId:ids.customer,status:'active',reason:' alta '},{p_customer_id:ids.customer,p_status:'active',p_reason:'alta'}],
 ['driverCreate','admin_create_driver',{firstName:'Ana',lastName:'Ruiz',driverType:'Chofer',baseCity:'ignored',password:'ignored',administrativeStatus:'inactive'},{p_first_name:'Ana',p_last_name:'Ruiz',p_driver_type:'internal_driver',p_phone:null,p_email:null,p_license_expiration:null,p_observations:null,p_administrative_status:'active'}],
 ['driverUpdate','admin_update_driver',{driverId:ids.driver,status:'pending_documents',license:null,observations:'',reason:'documentación'},{p_driver_id:ids.driver,p_reason:'documentación',p_administrative_status:'pending_documents',p_license_expiration:null,p_observations:''}],
 ['vehicleCreate','admin_create_vehicle',{plate:'1234ABC',brand:'Marca',model:'Modelo',ownership:'external',color:'ignored',year:2026,manualStatus:'unavailable'},{p_plate:'1234ABC',p_brand:'Marca',p_model:'Modelo',p_ownership_type:'owned',p_manual_status:'unavailable',p_notes:null}],
 ['vehicleInactive','admin_inactivate_vehicle',{vehicleId:ids.vehicle,reason:'baja'},{p_vehicle_id:ids.vehicle,p_reason:'baja'}],
 ['document','admin_register_vehicle_document',{vehicleId:ids.vehicle,documentType:'insurance',status:'pending',issued:'2026-01-01',expires:null,reference:'POL',notes:'metadata',upload:'ignored'},{p_vehicle_id:ids.vehicle,p_document_type:'insurance',p_status:'pending',p_issued_at:'2026-01-01',p_expires_at:null,p_reference_number:'POL',p_notes:'metadata',p_replaces_document_id:null,p_reason:null}],
 ['assign','admin_assign_driver_vehicle',{driverId:ids.driver,vehicleId:ids.vehicle,startedAt:'ignored'},{p_driver_id:ids.driver,p_vehicle_id:ids.vehicle,p_started_at:null,p_notes:null}],
 ['close','admin_close_driver_vehicle_assignment',{assignmentId:ids.link,reason:'fin',endedAt:'ignored'},{p_assignment_id:ids.link,p_reason:'fin',p_ended_at:null}],
];
for(const [action,rpc,values,expected] of cases)test(`${action}: exact payload, RPC, TABLE result and reload`,async()=>{
 const {api,calls,tables,reads}=setup();if(action==='close')tables.driver_vehicle_assignments.push({id:ids.link,driver_id:ids.driver,vehicle_id:ids.vehicle,status:'active'});
 if(action==='assign')tables.vehicle_documents.push({id:ids.document,vehicle_id:ids.vehicle,document_type_key:'insurance',status:'valid',expires_at:'2099-01-01'});
 const attempt=api.operation(action);let refreshed=0;const r=await api.execute(attempt,values,async row=>{assert.ok(row);refreshed++;});
 assert.equal(calls.length,1);assert.equal(calls[0].name,rpc);assert.deepEqual(calls[0].args,{...expected,...(attempt.requestId?{p_request_id:attempt.requestId}:{})});assert.equal(r.refreshPending,false);assert.equal(refreshed,1);assert.ok(reads()>0);
});
test('customer active/inactive only, reason and required names',()=>{const {api}=setup();for(const status of ['new','blocked'])assert.throws(()=>api.payload('customerStatus',{customerId:ids.customer,status,reason:'x'}));assert.throws(()=>api.payload('customerStatus',{customerId:ids.customer,status:'inactive'}));assert.equal(api.payload('customerStatus',{customerId:ids.customer,status:'inactive',reason:'x'}).p_status,'inactive');assert.throws(()=>api.payload('customerCreate',{firstName:' ',lastName:'R'}));assert.throws(()=>api.payload('customerCreate',{firstName:'A'}));});
test('driver normalization, optional license and preservation semantics',()=>{const {api}=setup();let p=api.payload('driverCreate',{firstName:'A',lastName:'B',driverType:'Colaborador',license:'2099-01-01',countryCode:'+34',phone:'123',email:' A@B.ES '});assert.equal(p.p_driver_type,'external_collaborator');assert.equal(p.p_license_expiration,'2099-01-01');assert.equal(p.p_email,'a@b.es');assert.equal(p.p_phone,'+34 123');p=api.payload('driverUpdate',{driverId:ids.driver,reason:'x'});assert.equal(p.p_administrative_status,null);assert.equal(p.p_license_expiration,null);assert.equal(p.p_observations,null);assert.throws(()=>api.payload('driverUpdate',{driverId:ids.driver,status:'suspended',reason:'x'}));});
test('replacement uses current pending document without invented expiry',async()=>{const {api,tables,calls}=setup();tables.vehicle_documents.push({id:ids.document,vehicle_id:ids.vehicle,document_type_key:'insurance',status:'pending',expires_at:null,replaced_at:null});await api.execute(api.operation('document'),{vehicleId:ids.vehicle,documentType:'insurance',status:'pending',replaces:ids.document,reason:'nuevo'});assert.equal(calls[0].args.p_replaces_document_id,ids.document);assert.equal(calls[0].args.p_expires_at,null);assert.throws(()=>api.payload('document',{vehicleId:ids.vehicle,documentType:'insurance',status:'pending',replaces:ids.document}));assert.equal(api.currentDocument({status:'pending',replaced_at:'2026-01-01'}),false);});
test('stale replacement and invalid dates are rejected before RPC',async()=>{const {api,calls}=setup();await assert.rejects(api.execute(api.operation('document'),{vehicleId:ids.vehicle,documentType:'insurance',status:'pending',replaces:ids.document,reason:'x'}));assert.equal(calls.length,0);assert.throws(()=>api.payload('document',{vehicleId:ids.vehicle,documentType:'itv',status:'valid',issued:'2026-03-02',expires:'2026-03-01'}));assert.throws(()=>api.payload('driverCreate',{firstName:'A',lastName:'B',driverType:'Chofer',license:'2026-02-30'}));});
test('uncertain retry retains request and payload; new operation gets new UUID',async()=>{let n=0;const {api,calls}=setup((name,a)=>{if(!n++)throw Error('secret transport details');return {data:[result(name,a)]};});const attempt=api.operation('customerCreate'),v={firstName:'A',lastName:'B'};await assert.rejects(api.execute(attempt,v),/incierto/);await assert.rejects(api.execute(attempt,{...v,lastName:'C'}),/ya fue enviado/);await api.execute(attempt,v);assert.deepEqual(calls[0],calls[1]);assert.notEqual(api.operation('customerCreate').requestId,attempt.requestId);});
test('retry after lost committed link response bypasses changed preconditions',async()=>{let n=0;const s=setup((name,a)=>{if(!n++){s.tables.driver_vehicle_assignments.push({id:ids.link,driver_id:ids.driver,vehicle_id:ids.vehicle,status:'active'});throw Error('lost');}return {data:[result(name,a)]};});s.tables.vehicle_documents.push({id:ids.document,vehicle_id:ids.vehicle,document_type_key:'insurance',status:'valid',expires_at:'2099-01-01'});const attempt=s.api.operation('assign'),v={driverId:ids.driver,vehicleId:ids.vehicle};await assert.rejects(s.api.execute(attempt,v));await s.api.execute(attempt,v);assert.equal(s.calls.length,2);assert.deepEqual(s.calls[0],s.calls[1]);});
test('second submit and cross-form submit blocked before awaiting',async()=>{let release;const {api,calls}=setup(async(name,a)=>{await new Promise(r=>release=r);return {data:[result(name,a)]};});const a=api.operation('customerCreate'),v={firstName:'A',lastName:'B'};const pending=api.execute(a,v);await assert.rejects(api.execute(a,v),/curso/);await assert.rejects(api.execute(api.operation('vehicleCreate'),{}),/curso/);await new Promise(setImmediate);assert.equal(calls.length,1);release();await pending;assert.equal(a.busy,false);});
for(const code of ['28000','42501','23503','23505','23514','22023','0A000'])test(`safe backend error ${code}`,async()=>{const {api}=setup(()=>({error:{code,message:'private sql',details:'secret',hint:'private',stack:'private'}}));await assert.rejects(api.execute(api.operation('customerCreate'),{firstName:'A',lastName:'B'}),e=>e.message.includes(code)&&!/(private|secret)/.test(e.message)&&!e.uncertain);});
test('invalid TABLE result is uncertain; refresh failure never resends mutation',async()=>{const bad=setup(()=>({data:[]}));await assert.rejects(bad.api.execute(bad.api.operation('customerCreate'),{firstName:'A',lastName:'B'}),/incierto/);const {api,calls}=setup(),attempt=api.operation('customerCreate'),v={firstName:'A',lastName:'B'};let r=await api.execute(attempt,v,async()=>{throw Error('read');});assert.equal(r.refreshPending,true);r=await api.execute(attempt,v,async()=>{});assert.equal(r.refreshPending,false);assert.equal(calls.length,1);});
test('session/context change cannot send or replay another actor receipt',async()=>{const {api,window,calls}=setup();window.ElaraAuth.getActiveContext=()=> 'conductor';await assert.rejects(api.execute(api.operation('customerCreate'),{firstName:'A',lastName:'B'}),/42501/);assert.equal(calls.length,0);});
test('QA/legacy candidates excluded and no QA notes allowed',async()=>{const {api,tables,window,calls}=setup();tables.drivers.push({id:'11000000-0000-4000-8000-000000000001',person_id:ids.person,administrative_status:'active'},{id:crypto.randomUUID(),person_id:ids.person,administrative_status:'active',observations:'qa_run=fixture'});await window.ElaraOperationalData.loadIdentity();const c={...tables,drivers:window.ElaraOperationalData.getCollection('drivers'),vehicles:window.ElaraOperationalData.getCollection('vehicles'),persons:window.ElaraOperationalData.getCollection('persons')};assert.equal(api.candidates(c).drivers.length,1);await assert.rejects(api.execute(api.operation('customerCreate'),{firstName:'A',lastName:'B',notes:'qa_case=C1'}));assert.equal(calls.length,0);assert.equal(api.payload('customerCreate',{firstName:'A',lastName:'B',notes:'operational-test'}).p_notes,'operational-test');});
test('DOM wiring loaded before modules and routes attach real detail actions',()=>{const html=fs.readFileSync(root+'/src/index.html','utf8');assert.ok(html.indexOf('js/catalog-admin.js')<html.indexOf('js/customers.js'));for(const [file,module]of [['customers','customers'],['collaborators','drivers'],['vehicles','vehicles']]){const source=fs.readFileSync(`${root}/src/js/${file}.js`,'utf8');assert.ok(source.includes(`ElaraCatalogAdmin.attach('${module}'`));assert.ok(source.includes(`ElaraCatalogAdmin.detailActions('${module}'`));}const helper=fs.readFileSync(root+'/src/js/catalog-admin.js','utf8');assert.doesNotMatch(helper,/\b(?:alert|confirm|fetch)\s*\(|localStorage|client\.from\(/);});

// Small DOM adapter: exercises the actual open/onsubmit handlers, disabled
// controls and FormData semantics without opening a browser or making HTTP calls.
function dom(s,module) {
 if(module==='customers') {
  const document=s.context.document,modal=document.getElementById('new-customer-modal'),view=document.getElementById('clientes');view.hidden=false;
  Object.defineProperty(modal,'html',{get(){return this.innerHTML;}});
  let reloads=0;s.api.attach(module,async()=>{reloads++;return true;});
  s.context.FormData=class {constructor(form){this.entries=[...form.querySelectorAll('[name]')].filter(e=>!e.disabled&&(e.type!=='radio'||e.checked)).map(e=>[e.name,e.value]);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
  return {modal,get form(){const f=modal.querySelector('form');if(f&&!f.elements)Object.defineProperty(f,'elements',{value:Object.fromEntries([...f.querySelectorAll('[name]')].map(e=>[e.name,e]))});return f;},get status(){return modal.querySelector('[data-catalog-status]');},get controls(){return [...modal.querySelectorAll('form input,form select,form textarea,form button')];},reloads:()=>reloads};
 }

 const status={textContent:''},replacement={textContent:''};let form;
 const controls=[];
 const modal={hidden:true,setAttribute(name,value){this[name]=value;},set innerHTML(html){this.html=html;if(!html.includes('<form'))return;controls.length=0;
  const elements={};
  for(const m of html.matchAll(/<input\b([^>]*)>|<textarea\b([^>]*)>([^<]*)<\/textarea>|<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
   const attrs=m[1]||m[2]||m[4],name=attrs.match(/name="([^"]+)"/)?.[1];if(!name)continue;
   let value=m[1]?attrs.match(/value="([^"]*)"/)?.[1]||'':m[2]?m[3]:[...m[5].matchAll(/<option value="([^"]*)"([^>]*)>/g)].find(x=>x[2].includes('selected'))?.[1]||'';
   const node={name,value,tagName:m[1]?'INPUT':m[2]?'TEXTAREA':'SELECT',disabled:false,addEventListener(){}};elements[name]=node;controls.push(node);
  }
  const submit={tagName:'BUTTON',disabled:false,textContent:'Confirmar'},close={tagName:'BUTTON',disabled:false};controls.push(submit,close);
  form={elements,checkValidity:()=>true,reportValidity(){},querySelector:q=>q==='[data-catalog-status]'?status:q==='[data-catalog-replacement]'?replacement:submit,querySelectorAll:()=>controls};
 },querySelector:()=>form};
 const panel={dataset:{},querySelector:q=>q==='[data-catalog-toolbar]'?{}:null,querySelectorAll:()=>[]};
 const view={hidden:false,querySelector:()=>panel};
 s.context.document.getElementById=id=>id===({customers:'clientes',drivers:'colaboradores',vehicles:'vehiculos'})[module]?view:id===({customers:'new-customer-modal',drivers:'new-collaborator-modal',vehicles:'new-vehicle-modal'})[module]?modal:null;
 s.context.FormData=class {constructor(f){this.entries=Object.values(f.elements).filter(e=>!e.disabled).map(e=>[e.name,e.value]);}[Symbol.iterator](){return this.entries[Symbol.iterator]();}};
 let reloads=0;s.api.attach(module,async()=>{reloads++;return true;});
 return {modal,status,get form(){return form;},controls,reloads:()=>reloads};
}
for(const [action,rpc,values]of cases)test(`${action}: actual modal submit dispatches RPC and freezes committed form`,async()=>{
 const s=setup();s.window.ElaraOperationalData.personName=()=> 'Persona';
 const module=action.startsWith('customer')?'customers':action.startsWith('driver')?'drivers':'vehicles';
 if(action==='close')s.tables.driver_vehicle_assignments.push({id:ids.link,driver_id:ids.driver,vehicle_id:ids.vehicle,status:'active'});
 if(action==='assign')s.tables.vehicle_documents.push({id:ids.document,vehicle_id:ids.vehicle,document_type_key:'insurance',status:'valid',expires_at:'2099-01-01'});
 const ui=dom(s,module),entity=action.endsWith('Create')?'':action==='customerStatus'?ids.customer:action==='driverUpdate'?ids.driver:action==='close'?ids.link:ids.vehicle;
 await s.api.open(module,action,entity);assert.ok(ui.form,ui.modal.html);
 for(const [k,v]of Object.entries(values))if(ui.form.elements[k])ui.form.elements[k].value=v??'';
 if(action==='assign'){ui.form.elements.driverId.value=ids.driver;ui.form.elements.vehicleId.value=ids.vehicle;}
 await ui.form.onsubmit({preventDefault(){}});assert.equal(s.calls.length,1,ui.status.textContent);assert.equal(s.calls[0].name,rpc);assert.equal(ui.reloads(),1);assert.equal(ui.status.textContent,'Guardado correctamente. Listado actualizado.');assert.ok(ui.controls.filter(e=>e.tagName!=='BUTTON').every(e=>e.disabled));
 await ui.form.onsubmit({preventDefault(){}});assert.equal(s.calls.length,1);assert.equal(ui.reloads(),2);
});
test('actual modal retry reads saved payload although disabled fields are omitted by FormData',async()=>{
 let n=0;const s=setup((name,a)=>{if(!n++)throw Error('lost');return {data:[result(name,a)]};});const ui=dom(s,'customers');await s.api.open('customers','customerCreate');ui.form.elements.firstName.value='Ana';ui.form.elements.lastName.value='Ruiz';
 await ui.form.onsubmit({preventDefault(){}});assert.match(ui.status.textContent,/incierto/);assert.ok(ui.controls.filter(e=>e.tagName!=='BUTTON').every(e=>e.disabled));await ui.form.onsubmit({preventDefault(){}});assert.equal(s.calls.length,2);assert.deepEqual(s.calls[0],s.calls[1]);
});
test('modal busy state disables inputs and submit before RPC completion',async()=>{
 let release;const s=setup(async(name,a)=>{await new Promise(r=>release=r);return {data:[result(name,a)]};});const ui=dom(s,'customers');await s.api.open('customers','customerCreate');ui.form.elements.firstName.value='A';ui.form.elements.lastName.value='B';const first=ui.form.onsubmit({preventDefault(){}});assert.ok(ui.controls.every(e=>e.disabled));await ui.form.onsubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(s.calls.length,1);release();await first;assert.ok([...ui.form.querySelectorAll('[data-catalog-close],[type=submit]')].every(e=>!e.disabled));
});
test('refresh failure in actual form shows saved pending and retries only reads',async()=>{
 const s=setup(),ui=dom(s,'customers');s.api.attach('customers',async()=>false);await s.api.open('customers','customerCreate');ui.form.elements.firstName.value='A';ui.form.elements.lastName.value='B';await ui.form.onsubmit({preventDefault(){}});assert.equal(ui.status.textContent,'Guardado; actualización pendiente.');await ui.form.onsubmit({preventDefault(){}});assert.equal(s.calls.length,1);
});
test('different actor cannot replay an uncertain operation',async()=>{
 const s=setup(()=>{throw Error('lost');}),attempt=s.api.operation('customerCreate'),v={firstName:'A',lastName:'B'};await assert.rejects(s.api.execute(attempt,v));s.window.ElaraAuth.getCurrentUser=()=>({id:'other'});await assert.rejects(s.api.execute(attempt,v),/sesión cambió/);assert.equal(s.calls.length,1);
});
test('UUID prefers native randomUUID and never calls fallback when available',()=>{
 const s=setup();let native=0;
 s.window.crypto={randomUUID(){assert.equal(this,s.window.crypto);native++;return ids.document;},getRandomValues(){throw Error('fallback must not run');}};
 assert.equal(s.api.operation('customerCreate').requestId,ids.document);assert.equal(native,1);
 for(const action of ['customerStatus','driverUpdate','vehicleInactive','close'])assert.equal(s.api.operation(action).requestId,null);
 assert.equal(native,1);
});
test('LAN fallback sets version/variant bits, preserves random bits and opens modal',async()=>{
 const s=setup();let calls=0;
 s.window.crypto={getRandomValues(bytes){assert.equal(this,s.window.crypto);assert.equal(bytes.length,16);calls++;bytes.fill(255);return bytes;}};
 const attempt=s.api.operation('customerCreate');assert.equal(attempt.requestId,'ffffffff-ffff-4fff-bfff-ffffffffffff');
 const bytes=Buffer.from(attempt.requestId.replaceAll('-',''),'hex');assert.equal(bytes[6]>>>4,4);assert.equal(bytes[8]>>>6,2);assert.equal(bytes[6]&15,15);assert.equal(bytes[8]&63,63);
 const ui=dom(s,'customers');await s.api.open('customers','customerCreate');assert.ok(ui.form);assert.equal(calls,2);assert.equal(s.calls.length,0);
});
test('fallback UUID uses real getRandomValues and remains stable through uncertain retry',async()=>{
 let tries=0;const s=setup((name,a)=>{if(!tries++)throw Error('lost');return {data:[result(name,a)]};});let generations=0;
 s.window.crypto={getRandomValues(bytes){generations++;return crypto.getRandomValues(bytes);}};
 const attempt=s.api.operation('customerCreate'),v={firstName:'A',lastName:'B'};assert.match(attempt.requestId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 await assert.rejects(s.api.execute(attempt,v),/incierto/);await assert.rejects(s.api.execute(attempt,{...v,lastName:'C'}),/ya fue enviado/);await s.api.execute(attempt,v);assert.deepEqual(s.calls[0],s.calls[1]);assert.equal(generations,1);
 assert.notEqual(s.api.operation('customerCreate').requestId,attempt.requestId);assert.equal(generations,2);
});
for(const available of [{},undefined])test(`missing crypto APIs produce controlled modal error (${available?'empty':'absent'})`,async()=>{
 const s=setup();s.window.crypto=available;
 assert.throws(()=>s.api.operation('customerCreate'),e=>e.name==='Error'&&e.message==='No hay un generador criptográfico de UUID disponible en este navegador.');
 const ui=dom(s,'customers');await assert.doesNotReject(s.api.open('customers','customerCreate'));assert.match(ui.modal.html,/role="alert"/);assert.match(ui.modal.html,/No hay un generador criptográfico/);assert.doesNotMatch(ui.modal.html,/TypeError/);assert.equal(s.calls.length,0);
 for(const action of ['customerStatus','driverUpdate','vehicleInactive','close'])assert.equal(s.api.operation(action).requestId,null);
});

const tick=()=>new Promise(setImmediate);
function fillCustomer(ui,values={firstName:'Ana',lastName:'Ruiz'}){for(const [k,v]of Object.entries(values)){const field=ui.form.elements[k];field.value=v;ui.form.oninput?.({target:field});}}
const submitCustomer=ui=>ui.form.onsubmit({preventDefault(){}});
const closeCustomer=ui=>ui.modal.onclick({target:ui.modal.querySelector('[data-catalog-close]'),stopPropagation(){}});
test('individual form preserves seven fields and sections inside the shared type selector',async()=>{
 const s=setup(),ui=dom(s,'customers');await s.api.open('customers','customerCreate');
 assert.equal(ui.modal.querySelectorAll('[data-customer-fields=individual] .new-customer-form__section').length,3);
 assert.deepEqual([...ui.form.querySelectorAll('[data-customer-fields=individual] [name]')].map(e=>e.name),['firstName','lastName','countryCode','phone','email','notes','internalNotes']);
 const all=[...s.context.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(all).size,all.length);
 assert.equal(ui.modal.querySelectorAll('[data-customer-type]').length,2);assert.equal(ui.modal.querySelector('[data-customer-fields=company]').hidden,true);closeCustomer(ui);assert.equal(ui.modal.hidden,true);
});
test('required fields and optional email have visual errors, optional contacts and separate notes normalize',async()=>{
 const s=setup(),ui=dom(s,'customers');await s.api.open('customers','customerCreate');await submitCustomer(ui);assert.equal(s.calls.length,0);assert.equal(ui.form.querySelectorAll('.field--invalid').length,2);
 fillCustomer(ui,{firstName:' Ana ',lastName:' Ruiz ',email:'invalid'});await submitCustomer(ui);assert.equal(s.calls.length,0);assert.equal(ui.form.elements.email.getAttribute('aria-invalid'),'true');
 fillCustomer(ui,{email:' ANA@EXAMPLE.TEST ',countryCode:' +34 ',phone:' 123 ',notes:' person ',internalNotes:' internal '});await submitCustomer(ui);
 const a=s.calls[0].args;assert.equal(a.p_first_name,'Ana');assert.equal(a.p_last_name,'Ruiz');assert.equal(a.p_email,'ana@example.test');assert.equal(a.p_phone,'+34 123');assert.equal(a.p_notes,'person');assert.equal(a.p_internal_notes,'internal');
});
test('duplicate rejection shows safe error; closing permits a corrected independent attempt',async()=>{
 const s=setup(()=>({error:{code:'23505',message:'private'}})),ui=dom(s,'customers');await s.api.open('customers','customerCreate');fillCustomer(ui);await submitCustomer(ui);assert.match(ui.status.textContent,/23505/);assert.doesNotMatch(ui.status.textContent,/private/);const id=s.calls[0].args.p_request_id;closeCustomer(ui);await s.api.open('customers','customerCreate');fillCustomer(ui);await submitCustomer(ui);assert.notEqual(s.calls[1].args.p_request_id,id);
});
test('close during initial read invalidates late form and permits a fresh opening',async()=>{
 const s=setup(),ui=dom(s,'customers');let release;s.window.ElaraOperationalData.loadIdentity=()=>new Promise(r=>release=r);
 const pending=s.api.open('customers','customerCreate');closeCustomer(ui);release();await pending;assert.equal(ui.modal.hidden,true);assert.equal(ui.form,null);assert.equal(s.calls.length,0);
});
for(const change of ['session','navigation','close'])test('pending write survives '+change+' without stale display or refresh; same actor resumes immutable receipt',async()=>{
 let release;const s=setup(async(name,args)=>{await new Promise(r=>release=r);return {data:[result(name,args)]};}),ui=dom(s,'customers');await s.api.open('customers','customerCreate');fillCustomer(ui);const pending=submitCustomer(ui);await tick();
 if(change==='session'){s.window.ElaraAuth.getCurrentUser=()=>({id:'other'});s.window.dispatchEvent({type:'elara:auth-session-updated'});}
 else if(change==='navigation'){s.window.location.hash='#servicios';s.window.dispatchEvent({type:'hashchange'});}else closeCustomer(ui);
 release();await pending;assert.equal(ui.modal.hidden,true);assert.equal(ui.reloads(),0);assert.equal(ui.form,null);assert.equal(s.calls.length,1);
 if(change==='session'){await s.api.open('customers','customerCreate');assert.equal(ui.form.elements.firstName.value,'');closeCustomer(ui);s.window.ElaraAuth.getCurrentUser=()=>({id:'actor'});s.window.dispatchEvent({type:'elara:auth-session-updated'});}
 s.window.location.hash='#clientes';await s.api.open('customers','customerCreate');assert.equal(ui.form.elements.firstName.value,'Ana');assert.ok(ui.form.elements.firstName.disabled);await submitCustomer(ui);assert.equal(s.calls.length,1);assert.equal(ui.reloads(),1);
});
test('closed uncertain attempt reopens with original request and payload, even after another actor uses the form',async()=>{
 let count=0;const s=setup((name,args)=>{if(!count++)throw Error('lost');return {data:[result(name,args)]};}),ui=dom(s,'customers');await s.api.open('customers','customerCreate');fillCustomer(ui);await submitCustomer(ui);closeCustomer(ui);
 s.window.ElaraAuth.getCurrentUser=()=>({id:'other'});await s.api.open('customers','customerCreate');assert.equal(ui.form.elements.firstName.value,'');closeCustomer(ui);
 s.window.ElaraAuth.getCurrentUser=()=>({id:'actor'});await s.api.open('customers','customerCreate');await submitCustomer(ui);assert.deepEqual(s.calls[0],s.calls[1]);
});
test('permission and session changes during initial read never render a form',async()=>{
 for(const type of ['actor','context']){const s=setup(),ui=dom(s,'customers');let release;s.window.ElaraOperationalData.loadIdentity=()=>new Promise(r=>release=r);const pending=s.api.open('customers','customerCreate');if(type==='actor')s.window.ElaraAuth.getCurrentUser=()=>({id:'other'});else s.window.ElaraAuth.getActiveContext=()=> 'conductor';s.window.dispatchEvent({type:'elara:auth-session-updated'});release();await pending;assert.equal(ui.modal.hidden,true);assert.equal(ui.form,null);assert.equal(s.calls.length,0);}
});
test('same actor session replacement during write suppresses refresh; request result is retained',async()=>{
 let release;const s=setup(async(name,args)=>{await new Promise(r=>release=r);return {data:[result(name,args)]};}),attempt=s.api.operation('customerCreate');let refresh=0;const pending=s.api.execute(attempt,{firstName:'A',lastName:'B'},async()=>refresh++);await tick();s.window.ElaraAuth.getCurrentUser=()=>({id:'actor',appSessionId:'replacement'});release();await assert.rejects(pending,/sesi/);assert.equal(refresh,0);assert.ok(attempt.result);assert.equal(s.calls.length,1);
});
test('repeated openings replace submit handlers and closing has one owner',async()=>{
 const s=setup(),ui=dom(s,'customers');for(let i=0;i<8;i++){await s.api.open('customers','customerCreate');assert.equal(ui.modal.querySelectorAll('form').length,1);closeCustomer(ui);}await s.api.open('customers','customerCreate');fillCustomer(ui);await submitCustomer(ui);assert.equal(s.calls.length,1);assert.equal(ui.reloads(),1);
});

for(const change of ['close','navigation','session'])test('invalidation during pre-send identity read prevents the RPC: '+change,async()=>{
 const s=setup(),ui=dom(s,'customers');await s.api.open('customers','customerCreate');fillCustomer(ui);let release;s.window.ElaraOperationalData.loadIdentity=()=>new Promise(r=>release=r);const pending=submitCustomer(ui);
 if(change==='close')closeCustomer(ui);else if(change==='navigation'){s.window.location.hash='#servicios';s.window.dispatchEvent({type:'hashchange'});}else{s.window.ElaraAuth.getCurrentUser=()=>({id:'actor',appSessionId:'other'});s.window.dispatchEvent({type:'elara:auth-session-updated'});}
 release();await pending;assert.equal(s.calls.length,0);assert.equal(ui.modal.hidden,true);
});
test('navigation during confirmed refresh read suppresses list reload without losing confirmed result',async()=>{
 const s=setup(),ui=dom(s,'customers');await s.api.open('customers','customerCreate');fillCustomer(ui);let count=0,release;s.window.ElaraOperationalData.loadIdentity=async()=>{if(++count===2)await new Promise(r=>release=r);};const pending=submitCustomer(ui);await tick();assert.equal(s.calls.length,1);s.window.location.hash='#servicios';s.window.dispatchEvent({type:'hashchange'});release();await pending;assert.equal(ui.reloads(),0);s.window.location.hash='#clientes';await s.api.open('customers','customerCreate');await submitCustomer(ui);assert.equal(s.calls.length,1);assert.equal(ui.reloads(),1);
});
test('administrative context denied before opening issues neither reads nor writes',async()=>{
 const s=setup(),ui=dom(s,'customers');s.window.ElaraAuth.getActiveContext=()=> 'conductor';await s.api.open('customers','customerCreate');assert.equal(ui.modal.hidden,true);assert.equal(s.calls.length,0);assert.equal(s.reads(),0);
});

const companyValues={legalName:' Local company ',taxId:' local-123 ',billingEmail:' BILLING@EXAMPLE.INVALID ',companyNotes:' company ',customerInternalNotes:' internal ',customerBillingNotes:' billing '};
const changeType=(ui,type)=>ui.form.querySelector(`[data-customer-type=${type}]`).onclick();
function localCompany(s){s.window.ElaraConfig={environment:'local',companyCustomerCreation:true};s.window.ElaraSupabase.getPublicConfig=()=>({url:'http://127.0.0.1:54421'});s.window.ElaraSupabase.client.supabaseUrl='http://127.0.0.1:54421';}

test('company Save is operational without the temporary opt-in, after valid input for either admin role',async()=>{
 for(const role of ['administrativo','superadmin']){
  const s=setup();s.window.ElaraAuth.getActiveContext=()=>role;
  // Only endpoint metadata: this test has no network transport and performs no write.
  s.window.ElaraSupabase.client.supabaseUrl='https://pfdvehcyauoncxeolcjc.supabase.co';s.window.ElaraSupabase.getPublicConfig=()=>({url:s.window.ElaraSupabase.client.supabaseUrl});
  const ui=dom(s,'customers');await s.api.open('customers','customerCreate');changeType(ui,'company');
  assert.equal(ui.form.querySelector('[data-company-notice]'),null);assert.equal(ui.form.querySelector('[type=submit]').disabled,true);
  await ui.form.querySelector('[data-company-validate]').onclick();assert.match(ui.status.textContent,/obligatorios/);
  fillCustomer(ui,{legalName:'Operational company',taxId:' b-12 3 '});assert.equal(ui.form.querySelector('[type=submit]').disabled,false);
  assert.equal(ui.status.textContent,'');
  assert.equal(s.api.payload('companyCreate',{legalName:'Company',taxId:' b-12 3 '}).p_tax_id,'B-12 3');
  fillCustomer(ui,{billingEmail:'bad'});assert.equal(ui.form.querySelector('[type=submit]').disabled,true);
  fillCustomer(ui,{billingEmail:''});assert.equal(ui.form.querySelector('[type=submit]').disabled,false);
  fillCustomer(ui,{contactMode:'new'});ui.form.elements.contactMode.onchange();assert.equal(ui.form.querySelector('[type=submit]').disabled,true);
  fillCustomer(ui,{contactFirstName:'Local',contactLastName:'Contact',contactRole:'Manager'});assert.equal(ui.form.querySelector('[type=submit]').disabled,true);
  fillCustomer(ui,{contactPhone:'123'});assert.equal(ui.form.querySelector('[type=submit]').disabled,false);
  fillCustomer(ui,{contactEmail:'bad'});assert.equal(ui.form.querySelector('[type=submit]').disabled,true);
  fillCustomer(ui,{contactMode:'none'});ui.form.elements.contactMode.onchange();assert.equal(ui.form.querySelector('[type=submit]').disabled,false);assert.equal(s.calls.length,0);
 }
});
test('company writes denied for absent identity, conductor and an admin role lost before send',async()=>{
 for(const mode of ['absent','conductor','lost']){
  const s=setup();if(mode==='absent')s.window.ElaraAuth.getCurrentUser=()=>null;
  if(mode==='conductor')s.window.ElaraAuth.getActiveContext=()=> 'conductor';
  if(mode==='lost')s.window.ElaraOperationalData.loadIdentity=async()=>{s.window.ElaraAuth.getActiveContext=()=> 'conductor';};
  await assert.rejects(s.api.execute(s.api.operation('companyCreate'),companyValues),e=>['28000','42501'].includes(e.code));assert.equal(s.calls.length,0);
 }
});
test('company adapter maps exact 0055 fields, normalizes and keeps notes separate',()=>{
 const s=setup(),a=plain(s.api.payload('companyCreate',companyValues));
 assert.deepEqual(a,{p_legal_name:'Local company',p_tax_id:'LOCAL-123',p_trade_name:null,p_billing_phone:null,p_billing_email:'billing@example.invalid',p_billing_address:null,p_company_notes:'company',p_customer_internal_notes:'internal',p_customer_billing_notes:'billing',p_contact:null});
 for(const v of [{...companyValues,legalName:' '},{...companyValues,taxId:' '},{...companyValues,billingEmail:'bad'}])assert.throws(()=>s.api.payload('companyCreate',v));
});
test('new contact requires full identity and phone or email; existing selection cannot be forged',()=>{
 const s=setup(),v={...companyValues,contactMode:'new',contactFirstName:' Local ',contactLastName:' Contact ',contactEmail:' CONTACT@EXAMPLE.INVALID ',contactRole:' Manager '};
 assert.deepEqual(plain(s.api.payload('companyCreate',v).p_contact),{mode:'new',first_name:'Local',last_name:'Contact',phone:null,email:'contact@example.invalid',role_label:'Manager'});
 for(const patch of [{contactFirstName:''},{contactLastName:''},{contactEmail:''},{contactEmail:'bad'},{contactMode:'existing',personId:ids.person}])assert.throws(()=>s.api.payload('companyCreate',{...v,...patch}));
 assert.equal(s.api.payload('companyCreate',{...companyValues,contactMode:'none',contactEmail:'bad'}).p_contact,null);
});
test('selector confirms dirty discard, cancels safely and resets to individual on fresh opening',async()=>{
 const s=setup(),ui=dom(s,'customers');await s.api.open('customers','customerCreate');fillCustomer(ui);changeType(ui,'company');
 assert.equal(ui.form.querySelector('[data-type-confirm]').hidden,false);assert.equal(ui.form.querySelector('[data-customer-fields=individual]').hidden,false);
 ui.form.querySelector('[data-type-keep]').onclick();assert.equal(ui.form.elements.firstName.value,'Ana');changeType(ui,'company');ui.form.querySelector('[data-type-discard]').onclick();
 assert.equal(ui.form.elements.firstName.value,'');assert.equal(ui.form.querySelector('[data-customer-fields=company]').hidden,false);assert.equal(ui.form.querySelector('[type=submit]').disabled,true);
 assert.equal(ui.form.elements.contactMode.querySelector('[value=existing]').hasAttribute('disabled'),true);assert.equal(ui.form.querySelector('[name=personId]'),null);
 fillCustomer(ui,companyValues);assert.equal(ui.form.querySelector('[type=submit]').disabled,false);assert.equal(s.calls.length,0);
 closeCustomer(ui);await s.api.open('customers','customerCreate');assert.equal(ui.form.querySelector('[data-customer-fields=individual]').hidden,false);
});
test('company UI permits local validation without sending to remote',async()=>{
 const s=setup(),ui=dom(s,'customers');await s.api.open('customers','customerCreate');changeType(ui,'company');await submitCustomer(ui);
 assert.equal(ui.form.querySelectorAll('.field--invalid').length,2);fillCustomer(ui,companyValues);
 ui.form.elements.contactMode.value='new';ui.form.elements.contactMode.onchange();await submitCustomer(ui);assert.equal(ui.form.querySelectorAll('.field--invalid').length,2);
 fillCustomer(ui,{contactFirstName:'Local',contactLastName:'Contact'});await submitCustomer(ui);assert.match(ui.status.textContent,/teléfono o correo/);assert.equal(s.calls.length,0);
 fillCustomer(ui,{contactEmail:'local@example.invalid'});await ui.form.querySelector('[data-company-validate]').onclick();assert.match(ui.status.textContent,/Validación local correcta/);assert.equal(s.calls.length,0);
});
test('company guard still rejects missing or mismatched SDK/configuration binding',async()=>{
 for(const mode of ['missing','remote','mismatch','https']){
  const s=setup(()=>{throw Error('must never reach transport');});localCompany(s);
  if(mode==='missing')delete s.window.ElaraSupabase.getPublicConfig;
  if(mode==='remote')s.window.ElaraSupabase.client.supabaseUrl='https://remote.supabase.co';
  if(mode==='mismatch')s.window.ElaraSupabase.client.supabaseUrl='http://localhost:54422';
  if(mode==='https')s.window.ElaraSupabase.getPublicConfig=()=>({url:'https://remote.supabase.co'});
  await assert.rejects(s.api.execute(s.api.operation('companyCreate'),companyValues),/conexión/);assert.equal(s.calls.length,0);assert.equal(s.reads(),0);
 }
});
test('company binding is checked again after asynchronous context read',async()=>{
 const s=setup();localCompany(s);s.window.ElaraOperationalData.loadIdentity=async()=>{s.window.ElaraSupabase.client.supabaseUrl='https://remote.supabase.co';};
 await assert.rejects(s.api.execute(s.api.operation('companyCreate'),companyValues),/conexión/);assert.equal(s.calls.length,0);
});
test('individual uncertain receipt prevents switching types even through a direct handler call',async()=>{
 const s=setup(()=>{throw Error('lost');}),ui=dom(s,'customers');await s.api.open('customers','customerCreate');fillCustomer(ui);await submitCustomer(ui);changeType(ui,'company');
 assert.equal(ui.form.querySelector('[data-customer-fields=company]').hidden,true);assert.equal(ui.form.querySelector('[data-customer-type=company]').disabled,true);assert.equal(s.calls.length,1);
});

test('company adapter submits only to isolated PostgreSQL: confirmation, immutable retry, late reply and actual form',async()=>{
 const path=require('path'),runtime=process.env.ELARA_PGLITE_ROOT;
 const {PGlite}=require(path.join(runtime,'@electric-sql/pglite')),{pgcrypto}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/pgcrypto.cjs')),{btree_gist}=require(path.join(runtime,'@electric-sql/pglite/dist/contrib/btree_gist.cjs'));
 const {bootstrap,api}=require('./control-0051-harness.cjs'),db=new PGlite({extensions:{pgcrypto,btree_gist}});
 try{
  await bootstrap(db);for(const name of ['0052_initial_superadmin_bootstrap.sql','0053_app_session_concurrency.sql','0054_driver_accept_confirms_service.sql','0055_admin_create_company_customer.sql'])await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',name),'utf8'));
  await db.exec('begin');const backend=api(db),admin=await backend.identity('administrativo');await backend.claims(admin);await backend.checkpoint();
  const rpc=async(name,a)=>{assert.equal(name,'admin_create_company_customer');const keys=['p_request_id','p_legal_name','p_tax_id','p_trade_name','p_billing_phone','p_billing_email','p_billing_address','p_company_notes','p_customer_internal_notes','p_customer_billing_notes','p_contact'];await db.exec('savepoint company_call');try{const data=(await db.query(`select * from public.admin_create_company_customer(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>k==='p_contact'&&a[k]?JSON.stringify(a[k]):a[k]))).rows;await db.exec('release savepoint company_call');return {data};}catch(e){await db.exec('rollback to savepoint company_call; release savepoint company_call');return {error:{code:e.code}};}};
  for(const contact of [false,true]){
   let lost=true;const s=setup(async(n,a)=>{const response=await rpc(n,a);if(lost){lost=false;throw Error('lost committed response');}return response;});localCompany(s);
   const ui=dom(s,'customers');await s.api.open('customers','customerCreate');changeType(ui,'company');
   fillCustomer(ui,{...companyValues,taxId:crypto.randomUUID(),...(contact?{contactMode:'new',contactFirstName:'Local',contactLastName:'Contact',contactPhone:'+34 123'}:{})});ui.form.elements.contactMode.onchange();
   await submitCustomer(ui);assert.match(ui.status.textContent,/incierto/);changeType(ui,'individual');assert.equal(ui.form.querySelector('[data-customer-fields=company]').hidden,false);
   const sent=s.calls[0];closeCustomer(ui);await s.api.open('customers','customerCreate');assert.equal(ui.form.querySelector('[data-customer-fields=company]').hidden,false);await submitCustomer(ui);
   assert.equal(s.calls.length,2);assert.deepEqual(sent,s.calls[1]);assert.match(ui.status.textContent,/Guardado correctamente/);
   const rows=(await db.query('select * from public.companies where upper(tax_id)=$1',[sent.args.p_tax_id])).rows;assert.equal(rows.length,1);assert.equal(rows[0].notes,'company');
  }
  {
   let release;const s=setup(async(n,a)=>{const r=await rpc(n,a);await new Promise(resolve=>release=resolve);return r;}),ui=dom(s,'customers');
   await s.api.open('customers','customerCreate');changeType(ui,'company');fillCustomer(ui,{...companyValues,taxId:crypto.randomUUID()});
   const first=submitCustomer(ui);await submitCustomer(ui);await assert.rejects(s.api.execute(s.api.operation('companyCreate'),companyValues),/curso/);
   while(!release)await tick();assert.equal(s.calls.length,1);assert.equal(ui.form.querySelector('[type=submit]').disabled,true);release();await first;assert.match(ui.status.textContent,/Guardado correctamente/);
   const count=Number((await db.query('select count(*) n from companies')).rows[0].n);
   const duplicate=setup(rpc),attempt=duplicate.api.operation('companyCreate');await assert.rejects(duplicate.api.execute(attempt,{...companyValues,taxId:s.calls[0].args.p_tax_id}),e=>e.code==='23505'&&!e.uncertain);assert.equal(duplicate.calls.length,1);assert.equal(Number((await db.query('select count(*) n from companies')).rows[0].n),count);
  }
  {
   const s=setup(rpc),ui=dom(s,'customers');s.api.attach('customers',async()=>false);await s.api.open('customers','customerCreate');changeType(ui,'company');fillCustomer(ui,{...companyValues,taxId:crypto.randomUUID()});await submitCustomer(ui);assert.match(ui.status.textContent,/Guardado; actualización pendiente/);s.api.attach('customers',async()=>true);await submitCustomer(ui);assert.equal(s.calls.length,1);assert.match(ui.status.textContent,/Guardado correctamente/);
  }
  {
   const s=setup(async(n,a)=>{const r=await rpc(n,a);return {data:[{...r.data[0],customer_status:'invalid'}]};});const attempt=s.api.operation('companyCreate');await assert.rejects(s.api.execute(attempt,{...companyValues,taxId:crypto.randomUUID()}),e=>e.uncertain);assert.equal(attempt.result,null);
  }
  {
   const s=setup(rpc),attempt=s.api.operation('companyCreate'),v={...companyValues,taxId:crypto.randomUUID()};
   await s.api.execute(attempt,v);s.window.ElaraSupabase.getPublicConfig=()=>({url:'http://localhost:54421'});s.window.ElaraSupabase.client.supabaseUrl='http://localhost:54421';await assert.rejects(s.api.execute(attempt,v),/conexión/);assert.equal(s.calls.length,1);
  }
  for(const change of ['close','navigation','session']){
   let release;const s=setup(async(n,a)=>{const r=await rpc(n,a);await new Promise(resolve=>release=resolve);return r;});localCompany(s);const ui=dom(s,'customers');await s.api.open('customers','customerCreate');changeType(ui,'company');fillCustomer(ui,{...companyValues,taxId:crypto.randomUUID()});const pending=submitCustomer(ui);
   while(!release)await tick();changeType(ui,'individual');assert.equal(ui.form.querySelector('[data-customer-fields=company]').hidden,false);
   if(change==='close')closeCustomer(ui);else if(change==='navigation'){s.window.location.hash='#servicios';s.window.dispatchEvent({type:'hashchange'});}else{s.window.ElaraAuth.getCurrentUser=()=>({id:'actor',appSessionId:'new'});s.window.dispatchEvent({type:'elara:auth-session-updated'});}
   release();await pending;assert.equal(ui.modal.hidden,true);assert.equal(ui.reloads(),0);assert.equal(s.calls.length,1);
  }
 }finally{await db.close();}
});

// 0056 frontend: shared RPC machinery, real DOM, no network transport.
const contactCompany='71000000-0000-4000-8000-000000000056';
function contactReply(name,a){return {customer_id:a.p_customer_id,company_id:contactCompany,company_contact_id:a.p_company_contact_id||ids.link,person_id:a.p_contact?.person_id||ids.person,status:a.p_patch?.status||'active',is_primary:name==='admin_set_company_primary_contact'||Boolean(a.p_is_primary),version:name==='admin_add_company_contact'?1:Number(a.p_expected_version)+1,...(name==='admin_set_company_primary_contact'?{previous_primary_contact_id:a.p_expected_primary_contact_id}:{}),...(a.p_patch?.status?{ended_at:'2026-11-17T12:00:00Z'}:{})};}
function contactsSetup(handler){const s=setup((n,a)=>handler?handler(n,a):{data:contactReply(n,a)});s.tables.customers[0]={id:ids.customer,customer_type:'company',company_id:contactCompany,status:'new'};s.tables.companies=[{id:contactCompany,legal_name:'Local contacts',status:'active'}];Object.assign(s.tables.persons[0],{first_name:'Shared',last_name:'Person'});s.tables.company_contacts=[];const ui=dom(s,'customers');return {...s,ui};}
const contactValues={customerId:ids.customer,contactMode:'new',contactFirstName:' Ana ',contactLastName:' Ruiz ',contactEmail:' ANA@EXAMPLE.INVALID ',contactRole:' Office ',notes:' Link ',primary:'no'};
const manageClick=(s,selector)=>s.ui.modal.onclick({target:s.ui.modal.querySelector(selector),stopPropagation(){}});
function contactFill(s,values={contactFirstName:'Ana',contactLastName:'Ruiz',contactEmail:'ana@example.invalid'}){for(const [name,value]of Object.entries(values))s.ui.modal.querySelector(`[name=${name}]`).value=value;s.ui.form.onchange?.();}
const contactSubmit=s=>s.ui.form.onsubmit({preventDefault(){}});
test('0056 exact payloads and JSON receipt validation; no personal changes in link patches',()=>{
 const s=contactsSetup();assert.deepEqual(plain(s.api.payload('contactAdd',contactValues)),{p_customer_id:ids.customer,p_contact:{mode:'new',first_name:'Ana',last_name:'Ruiz',phone:null,email:'ana@example.invalid',role_label:'Office'},p_is_primary:false,p_notes:'Link'});
 assert.throws(()=>s.api.payload('contactAdd',{...contactValues,contactEmail:'bad'}),/correo/);assert.throws(()=>s.api.payload('contactAdd',{...contactValues,contactEmail:''}),/teléfono/);
 const update=s.api.payload('contactUpdate',{customerId:ids.customer,contactId:ids.link,version:2,contactRole:' Role ',notes:' ',reason:' Change '});assert.deepEqual(plain(update),{p_customer_id:ids.customer,p_company_contact_id:ids.link,p_expected_version:2,p_patch:{role_label:'Role',notes:null},p_reason:'Change'});
 const args=s.api.payload('contactAdd',contactValues),reply=contactReply('admin_add_company_contact',args);assert(s.api.validateResult('contactAdd',args,reply));for(const bad of [[reply],{...reply,customer_id:ids.person},{...reply,version:0},{...reply,is_primary:true}])assert.equal(s.api.validateResult('contactAdd',args,bad),false);
});
test('0056 lost response preserves UUID/payload, serializes double click and never resends confirmed receipt',async()=>{
 let tries=0,release;const s=contactsSetup(async(n,a)=>{if(!tries++){await new Promise(r=>release=r);throw Error('lost');}return {data:contactReply(n,a)};});const attempt=s.api.operation('contactAdd');const pending=s.api.execute(attempt,contactValues);while(!release)await tick();await assert.rejects(s.api.execute(attempt,contactValues),/curso/);release();await assert.rejects(pending,/incierto/);await assert.rejects(s.api.execute(attempt,{...contactValues,notes:'Other'}),/ya fue enviado/);const r=await s.api.execute(attempt,contactValues,async()=>{throw Error('read failed');});assert(r.refreshPending);assert.deepEqual(s.calls[0],s.calls[1]);await s.api.execute(attempt,contactValues);assert.equal(s.calls.length,2);
});
test('0056 manager selects only active accessible unlinked persons and preserves retry through close/reopen',async()=>{
 let calls=0;const s=contactsSetup((n,a)=>{if(!calls++)throw Error('lost');return {data:contactReply(n,a)};});s.tables.persons.push({id:ids.vehicle,first_name:'Inactive',last_name:'Person',status:'inactive'},{id:ids.driver,first_name:'Hidden',last_name:'Person',status:'active',notes:'qa_run=local0056'});
 await s.api.openContacts(ids.customer,{isCurrent:()=>true});await manageClick(s,'[data-contact-add]');contactFill(s,{contactMode:'existing'});assert.equal(s.ui.modal.querySelectorAll('[name=personId] option[value]').length,2);assert(s.ui.modal.querySelector(`[name=personId] option[value="${ids.person}"]`));assert.equal(s.ui.modal.querySelector(`[name=personId] option[value="${ids.vehicle}"]`),null);
 contactFill(s,{personId:ids.person});await contactSubmit(s);assert.match(s.ui.modal.querySelector('[data-contact-form-status]').textContent,/incierto/);assert.equal(s.ui.form.querySelector('[name=personId]').disabled,true);assert.equal(s.ui.modal.querySelector('[data-contact-add]').disabled,true);
 await manageClick(s,'[data-contacts-close]');assert(s.ui.modal.hidden);await s.api.openContacts(ids.customer,{isCurrent:()=>true});assert.match(s.ui.form.textContent,/Reintentar/);await contactSubmit(s);assert.equal(s.calls.length,2);assert.deepEqual(s.calls[0],s.calls[1]);assert.match(s.ui.modal.textContent,/Guardado correctamente/);
});
test('0056 stale version is definitive and requires explicit read before a fresh request',async()=>{
 const s=contactsSetup(()=>({error:{code:'40001',message:'private payload'}}));s.tables.company_contacts=[{id:ids.link,company_id:contactCompany,person_id:ids.person,status:'active',is_primary:false,version:1}];await s.api.openContacts(ids.customer,{isCurrent:()=>true});await manageClick(s,'[data-contact-action=primary]');contactFill(s,{reason:'Set primary'});await contactSubmit(s);assert.match(s.ui.modal.textContent,/40001/);assert.doesNotMatch(s.ui.modal.textContent,/private payload/);assert(s.ui.form.querySelector('[type=submit]').disabled);await manageClick(s,'[data-contact-reload]');assert.equal(s.ui.form,null);assert.equal(s.calls.length,1);await manageClick(s,'[data-contact-action=primary]');contactFill(s,{reason:'Fresh read'});await contactSubmit(s);assert.notEqual(s.calls[0].args.p_request_id,s.calls[1].args.p_request_id);
});
for(const change of ['close','navigation','session'])test('0056 late contact response cannot refresh after '+change,async()=>{
 let release,reads=0;const s=contactsSetup(async(n,a)=>{await new Promise(r=>release=r);return {data:contactReply(n,a)};});await s.api.openContacts(ids.customer,{isCurrent:()=>true,refreshDetail:async()=>{reads++;}});await manageClick(s,'[data-contact-add]');contactFill(s);const pending=contactSubmit(s);while(!release)await tick();
 if(change==='close')await manageClick(s,'[data-contacts-close]');else if(change==='navigation'){s.window.location.hash='#servicios';s.window.dispatchEvent({type:'hashchange'});}else{s.window.ElaraAuth.getCurrentUser=()=>({id:'actor',appSessionId:'changed'});s.window.dispatchEvent({type:'elara:auth-session-updated'});}release();await pending;assert(s.ui.modal.hidden);assert.equal(reads,0);assert.equal(s.calls.length,1);
});
test('0056 authorization, endpoint drift and close during validation all fail before write',async()=>{
 const s=contactsSetup();for(const role of ['conductor',null]){s.window.ElaraAuth.getActiveContext=()=>role;await assert.rejects(s.api.execute(s.api.operation('contactAdd'),contactValues),e=>e.code==='42501');}s.window.ElaraAuth.getActiveContext=()=> 'administrativo';
 await s.api.openContacts(ids.customer,{isCurrent:()=>true});await manageClick(s,'[data-contact-add]');contactFill(s);let release;s.window.ElaraOperationalData.loadIdentity=()=>new Promise(r=>release=r);const pending=contactSubmit(s);while(!release)await tick();await manageClick(s,'[data-contacts-close]');release();await pending;assert.equal(s.calls.length,0);
 s.window.ElaraSupabase.client.supabaseUrl='http://localhost:54421';await assert.rejects(s.api.execute(s.api.operation('contactAdd'),contactValues),/conexión/);assert.equal(s.calls.length,0);
});

// 1C.4: inline status UI, no immutable receipt is claimed for 0048 status.
function statusSetup(handler){const s=setup(handler),ui=dom(s,'customers'),d=s.context.document;Object.assign(s.tables.customers[0],{person_id:ids.person});const modal=d.getElementById('customer-detail-modal');modal.hidden=false;const container=d.getElementById('customer-detail-content');return {...s,ui,modal,container,current:()=>!modal.hidden&&s.window.location.hash==='#clientes'};}
const statusClick=(s,sel)=>s.container.querySelector('[data-customer-status-panel]').onclick({target:s.container.querySelector(sel),stopPropagation(){}});
const statusSubmit=s=>s.container.querySelector('form').onsubmit({preventDefault(){},stopPropagation(){}});
const statusOpen=(s,refresh=async()=>{})=>s.api.openCustomerStatus(ids.customer,{container:s.container,isCurrent:s.current,refresh});
for(const [state,targets]of [['new',['active','inactive']],['active',['inactive']],['inactive',['active']],['blocked',[]]])test('1C4 inline status choices for '+state,async()=>{const s=statusSetup();s.tables.customers[0].status=state;await statusOpen(s);assert.deepEqual([...s.container.querySelectorAll('[data-status-target]')].map(b=>b.dataset.statusTarget),targets);assert.equal(s.ui.modal.hidden,true);assert.equal(s.container.querySelector('select'),null);assert.equal(s.calls.length,0);});
test('1C4 company/permission restrictions, mandatory reason and fresh-state/person/service validation',async()=>{
 const company=statusSetup();Object.assign(company.tables.customers[0],{customer_type:'company',company_id:contactCompany});await statusOpen(company);assert.equal(company.container.querySelector('form'),null);assert.match(company.container.textContent,/no permite/);
 const denied=statusSetup();denied.window.ElaraAuth.getActiveContext=()=> 'conductor';await statusOpen(denied);assert.equal(denied.container.querySelector('form'),null);
 const s=statusSetup();await statusOpen(s);await statusClick(s,'[data-status-target=inactive]');await statusSubmit(s);assert.equal(s.calls.length,0);assert.match(s.container.textContent,/motivo/);
 s.container.querySelector('[name=reason]').value='End relationship';s.tables.services=[{id:ids.vehicle,customer_id:ids.customer,operational_status:'pending'}];await statusSubmit(s);assert.equal(s.calls.length,0);assert.match(s.container.textContent,/servicios pendientes/);
 s.tables.services=[];await statusClick(s,'[data-status-target=inactive]');s.container.querySelector('[name=reason]').value='End';s.tables.customers[0].status='active';await statusSubmit(s);assert.equal(s.calls.length,0);assert.match(s.container.textContent,/estado.*cambió/);
 await statusClick(s,'[data-status-target=inactive]');s.container.querySelector('[name=reason]').value='End';s.tables.persons[0].status='inactive';await statusSubmit(s);assert.equal(s.calls.length,0);assert.match(s.container.textContent,/persona asociada/);
});
test('1C4 uncertain status never replays an RPC; confirmed refresh retry is read-only',async()=>{
 const s=statusSetup(()=>{throw Error('lost');});await statusOpen(s);await statusClick(s,'[data-status-target=active]');s.container.querySelector('[name=reason]').value='Activate';await statusSubmit(s);assert.match(s.container.textContent,/Respuesta incierta/);assert.equal(s.container.querySelector('form'),null);let reads=0;await statusOpen(s,async()=>{reads++;});await statusClick(s,'[data-status-read]');assert.equal(reads,1);assert.equal(s.calls.length,1);
 const attempt=s.api.operation('customerStatus');await assert.rejects(s.api.execute(attempt,{customerId:ids.customer,status:'active',reason:'A'}),/incierto/);await assert.rejects(s.api.execute(attempt,{customerId:ids.customer,status:'active',reason:'A'}),/lectura/);assert.equal(s.calls.length,2);
 const saved=statusSetup();let failures=true,n=0;const refresh=async()=>{n++;if(failures)throw Error('read failed');};await statusOpen(saved,refresh);await statusClick(saved,'[data-status-target=active]');saved.container.querySelector('[name=reason]').value='Activate';await statusSubmit(saved);assert.match(saved.container.textContent,/confirmado/);failures=false;await statusClick(saved,'[data-status-read]');assert.equal(saved.calls.length,1);assert.equal(n,2);
});
for(const change of ['close','session','navigation'])test('1C4 double submit and late status response cannot repaint after '+change,async()=>{
 let release,reads=0;const s=statusSetup(async(n,a)=>{await new Promise(r=>release=r);return {data:[result(n,a)]};});await statusOpen(s,async()=>{reads++;});await statusClick(s,'[data-status-target=active]');s.container.querySelector('[name=reason]').value='Activate';const form=s.container.querySelector('form');const pending=statusSubmit(s);while(!release)await tick();await form.onsubmit({preventDefault(){}});assert.equal(s.calls.length,1);
 if(change==='close')s.modal.hidden=true;else if(change==='session')s.window.ElaraAuth.getCurrentUser=()=>({id:'actor',appSessionId:'new'});else s.window.location.hash='#servicios';const html=s.container.innerHTML;release();await pending;assert.equal(reads,0);assert.equal(s.container.innerHTML,html);
});
