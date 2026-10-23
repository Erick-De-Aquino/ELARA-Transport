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
 const context={window,console,document:{querySelectorAll:()=>[]},Intl,Date,Set,Map};vm.createContext(context);
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
 const status={textContent:''},replacement={textContent:''};let form;
 const controls=[];
 const modal={hidden:true,set innerHTML(html){this.html=html;if(!html.includes('<form'))return;controls.length=0;
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
 let release;const s=setup(async(name,a)=>{await new Promise(r=>release=r);return {data:[result(name,a)]};});const ui=dom(s,'customers');await s.api.open('customers','customerCreate');ui.form.elements.firstName.value='A';ui.form.elements.lastName.value='B';const first=ui.form.onsubmit({preventDefault(){}});assert.ok(ui.controls.every(e=>e.disabled));await ui.form.onsubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(s.calls.length,1);release();await first;assert.ok(ui.controls.filter(e=>e.tagName==='BUTTON').every(e=>!e.disabled));
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
