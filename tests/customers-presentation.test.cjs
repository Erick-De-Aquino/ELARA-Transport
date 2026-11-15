const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {uuid,readClient,settle}=require('./services-presentation-harness.cjs');
function fixture(count=32){
 const tables={customers:[],persons:[],companies:[]};
 for(let i=0;i<count;i++){
  const company=i%2===1,subject=uuid(1000+i);
  tables.customers.push({id:uuid(i+1),human_code:(company?'EMP-':'CL-')+String(i+1).padStart(6,'0'),customer_type:company?'company':'individual',person_id:company?null:subject,company_id:company?subject:null,status:['new','active','inactive','blocked'][i%4]});
  tables[company?'companies':'persons'].push(company?{id:subject,legal_name:'Empresa '+i,trade_name:'Comercial '+i,billing_phone:'+3491000'+i,billing_email:'empresa'+i+'@example.test'}:{id:subject,first_name:'Persona '+i,last_name:'Apellido',phone:'+3461000'+i,contact_email:'persona'+i+'@example.test'});
 }
 return tables;
}
function setup({tables=fixture(),beforeRead,role='administrativo',inspectRefresh=false}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[];
 for(const view of document.querySelectorAll('.view'))view.hidden=view.id!=='clientes';
 window.ElaraAuth={getCurrentUser:()=>({id:uuid(900)}),getActiveContext:()=>role};
 window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 window.ElaraCustomersMock=new Proxy({}, {get(){throw Error('Legacy customer data accessed');}});
 const context={window,document,console,Intl,Set,Map,Date,crypto:require('node:crypto').webcrypto};vm.createContext(context);
 for(const file of ['operational-data','catalog-admin','customers']){
  let source=fs.readFileSync('src/js/'+file+'.js','utf8');
  if(inspectRefresh&&file==='catalog-admin')source=source.replace('return Object.freeze({operation,payload,','return Object.freeze({refresh,operation,payload,');
  vm.runInContext(source,context);
 }
 return {window,document,context,tables,calls,op:window.ElaraOperationalData,show:()=>context.showOperationalCustomers(),panel:()=>document.querySelector('#clientes [data-operational-panel]')};
}
const cards=h=>[...h.panel().querySelectorAll('[data-operational-customer-id]')];
function search(h,value){const input=h.panel().querySelector('[data-operational-search]');input.value=value;input.oninput({target:input});}
function filter(h,index,value){const input=h.panel().querySelector(`[data-operational-filter="${index}"]`);Object.defineProperty(input,'value',{configurable:true,writable:true,value});input.onchange();}
test('original nodes, real contacts, distinct types and all states; only three identity reads',async()=>{
 const h=setup();const summary=h.document.getElementById('customers-summary'),list=h.document.getElementById('customers-list');await h.show();
 assert.equal(h.panel().querySelector('#customers-summary'),summary);assert.equal(h.panel().querySelector('#customers-list'),list);assert.equal(cards(h).length,25);
 assert.match(h.panel().textContent,/Inactivos/);assert.match(h.panel().textContent,/Bloqueados/);assert.match(h.panel().textContent,/Particular/);assert.match(h.panel().textContent,/Empresa/);
 assert.match(h.panel().textContent,/empresa1@example.test/);assert.match(h.panel().textContent,/persona0@example.test/);assert.match(h.panel().textContent,/\+34910001/);
 assert.deepEqual(h.calls.map(c=>c.table).sort(),['companies','customers','persons']);assert.equal(h.panel().querySelectorAll('.customer-card__rating').length,0);assert.equal(h.panel().querySelectorAll('[data-customer-history]').length,0);
});
test('combined search/type/status filters and clearing; summary describes the complete filtered set',async()=>{
 const h=setup();await h.show();filter(h,0,'company');filter(h,1,'active');assert.equal(cards(h).length,8);search(h,'empresa1@example.test');assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.operationalCustomerId,uuid(2));
 h.panel().querySelector('[data-customers-clear]').onclick();assert.equal(cards(h).length,25);assert.match(h.panel().querySelector('[data-operational-summary]').textContent,/32/);
 for(const term of ['CL-000001','Persona 0 Apellido','+34610000','persona0@example.test']){search(h,term);assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.operationalCustomerId,uuid(1));}
 filter(h,1,'inactive');search(h,'');assert.ok(cards(h).every(c=>c.textContent.includes('Inactivo')));
});

test('company search accepts both legal and trade names',async()=>{
 const h=setup();await h.show();
 for(const term of ['Empresa 1','Comercial 1']){search(h,term);assert.ok(cards(h).some(c=>c.dataset.operationalCustomerId===uuid(2)));}
});
test('deterministic ordering, pagination and UUID detail retain the existing operative detail',async()=>{
 const tables=fixture();tables.customers.reverse();const h=setup({tables});await h.show();
 const ids=cards(h).map(c=>c.dataset.operationalCustomerId);h.panel().querySelector('[data-operational-next]').onclick();assert.equal(cards(h).length,7);assert.equal(new Set([...ids,...cards(h).map(c=>c.dataset.operationalCustomerId)]).size,32);
 search(h,'EMP-000002');const button=cards(h)[0].querySelector('[data-operational-detail]');assert.equal(button.dataset.customerId,uuid(2));await h.panel().querySelector('[data-operational-results]').onclick({target:button});assert.match(h.document.getElementById('customer-detail-content').textContent,/EMP-000002/);
 search(h,'CL-000001');await h.panel().querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('[data-operational-detail]')});assert.ok(h.document.querySelector('#customer-detail-view-actions [data-catalog-action="customerStatus"]'));assert.ok(h.document.querySelector('.header__actions [data-catalog-action="customerCreate"]'));
});
test('QA subject exclusion propagates without fetching service or financial data',async()=>{
 const tables=fixture(4);tables.persons[0].metadata={qa_fixture:true};tables.customers[1].metadata={qa_fixture:true};const h=setup({tables});await h.show();assert.equal(cards(h).length,2);assert.ok(!cards(h).some(c=>[uuid(1),uuid(2)].includes(c.dataset.operationalCustomerId)));
});
test('repeated navigation and refresh keep unique nodes, controls and catalog actions',async()=>{
 const h=setup();await h.show();await h.show();await h.panel().querySelector('[data-operational-retry]').onclick();
 const ids=[...h.document.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);assert.equal(h.panel().querySelectorAll('#customers-list').length,1);assert.equal(h.panel().querySelectorAll('[data-operational-search]').length,1);assert.equal(h.document.querySelectorAll('[data-catalog-action="customerCreate"]').length,1);assert.equal(h.panel().querySelectorAll('[data-customers-clear]').length,1);
});
test('empty and failure states never use legacy data; permission denial performs no reads',async()=>{
 const empty=setup({tables:fixture(0)});await empty.show();assert.match(empty.panel().textContent,/No hay registros/);assert.match(empty.panel().querySelector('[data-operational-summary]').textContent,/0/);
 const failed=setup({beforeRead:()=>{throw Error('read failure');}});await failed.show();assert.match(failed.panel().querySelector('[role="alert"]').textContent,/read failure/);assert.equal(cards(failed).length,0);
 const denied=setup({role:'conductor'});await denied.show();assert.ok(denied.panel().querySelector('[role="alert"]'));assert.equal(denied.calls.length,0);assert.equal(denied.panel().querySelector('[data-catalog-action]'),null);
});
for(const change of ['reset','session','navigation'])test('late load cannot survive '+change,async()=>{
 let release,started;const ready=new Promise(r=>started=r);let block=true;
 const h=setup({beforeRead:async table=>{if(block&&table==='customers'){block=false;started();await new Promise(r=>release=r);}}});const pending=h.show();await ready;assert.match(h.panel().textContent,/Cargando/);
 if(change==='reset')h.op.reset();
 if(change==='session')h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});
 if(change==='navigation')await h.op.show('dashboard',{title:'Dashboard',load:async()=>[],columns:[]});
 release();await pending;assert.equal(cards(h).length,0);
});
test('switching sessions reloads fresh identity and removes previous contacts',async()=>{
 const h=setup();await h.show();h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});h.tables.persons[0].contact_email='fresh@example.test';await h.show();assert.match(h.panel().textContent,/fresh@example.test/);assert.doesNotMatch(h.panel().textContent,/persona0@example.test/);
});
test('untrusted names and contacts are escaped; list reads do not change modal markup',async()=>{
 const tables=fixture(2);tables.persons[0].first_name='<img src=x onerror=alert(1)>';tables.companies[0].billing_email='<script>bad()</script>';const h=setup({tables});const modals=['customer-detail-modal','customer-history-modal','new-customer-modal'].map(id=>h.document.getElementById(id).innerHTML);await h.show();assert.equal(h.panel().querySelector('img,script'),null);assert.match(h.panel().textContent,/<script>bad/);assert.deepEqual(['customer-detail-modal','customer-history-modal','new-customer-modal'].map(id=>h.document.getElementById(id).innerHTML),modals);
});
module.exports={fixture,setup};

function historyFixture(){
 const tables=fixture(4);
 tables.services=['pending','confirmed','in_progress','completed','cancelled','no_show','not_performed'].map((status,i)=>({id:uuid(300+i),human_code:'SRV-'+String(i+1).padStart(6,'0'),customer_id:uuid(1),operational_status:status,scheduled_start_at:i<3?'2099-06-01T10:00:00Z':'2026-01-01T10:00:00Z'}));
 tables.services.push({id:uuid(320),human_code:'FOREIGN',customer_id:uuid(2),operational_status:'completed',scheduled_start_at:'2026-01-01T10:00:00Z'},
 {id:uuid(321),human_code:'QA',customer_id:uuid(1),operational_status:'completed',metadata:{qa_fixture:true}},
 {id:uuid(322),human_code:'DELETED',customer_id:uuid(1),operational_status:'completed',deleted_at:'2026-01-01'});
 tables.service_locations=tables.services.flatMap((s,i)=>[{id:uuid(400+i*2),service_id:s.id,location_type:'origin',label:'Origen '+i},{id:uuid(401+i*2),service_id:s.id,location_type:'destination',label:'Destino '+i}]);
 return tables;
}
async function openDetail(h,term='CL-000001'){
 search(h,term);await h.panel().querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('[data-operational-detail]')});
 return vm.runInContext('operationalCustomerDialog',h.context);
}
async function history(h){const detail=await openDetail(h);await h.context.openOperationalCustomerHistory(detail);return h.document.getElementById('customer-history-modal');}

test('1B original section cards show type-specific real fields, Spanish states and escaped notes',async()=>{
 const tables=historyFixture();tables.persons[0].notes='<script>nota</script>';tables.companies[0].tax_id='CIF-REAL';tables.companies[0].billing_address='Dirección fiscal';
 const h=setup({tables});await h.show();await openDetail(h);
 let body=h.document.getElementById('customer-detail-content');assert.match(body.textContent,/Datos personales/);assert.match(body.textContent,/Particular/);assert.match(body.textContent,/Nuevo/);assert.match(body.textContent,/<script>nota/);assert.equal(body.querySelector('script'),null);assert.doesNotMatch(body.textContent,/Razón social|Nombre comercial|NIF\/CIF|Teléfono de facturación/);
 assert.deepEqual([...new Set(h.calls.map(c=>c.table))].sort(),['companies','customers','persons']);
 await openDetail(h,'EMP-000002');body=h.document.getElementById('customer-detail-content');assert.match(body.textContent,/CIF-REAL/);assert.match(body.textContent,/Dirección fiscal/);assert.match(body.textContent,/Teléfono de facturación/);assert.doesNotMatch(body.textContent,/Nombre completo|Apellido\/s|Código de país/);
});

test('1B all customer states retain their correct label, tone and lifecycle restrictions',async()=>{
 const h=setup();await h.show();
 for(const [status,label,tone] of [['new','Nuevo','warning'],['active','Activo','success'],['inactive','Inactivo','neutral'],['blocked','Bloqueado','danger']]){
  h.tables.customers[0].status=status;await openDetail(h);
  const modal=h.document.getElementById('customer-detail-modal');assert.match(modal.querySelector('.status-card--'+tone).textContent,new RegExp(label));assert.equal(Boolean(modal.querySelector('[data-catalog-action="customerStatus"]')),status!=='blocked');
 }
});

test('1B history reads only the selected customer, excludes QA/deleted/foreign rows and separates all operational states',async()=>{
 const h=setup({tables:historyFixture()});await h.show();const modal=await history(h);
 assert.equal(modal.hidden,false);assert.equal(h.document.getElementById('customer-detail-modal').hidden,true);
 assert.equal(h.document.getElementById('customer-upcoming-list').querySelectorAll('[data-customer-history-service]').length,3);
 assert.equal(h.document.getElementById('customer-history-list').querySelectorAll('[data-customer-history-service]').length,1);
 assert.equal(h.document.getElementById('customer-unsuccessful-list').querySelectorAll('[data-customer-history-service]').length,3);
 assert.match(modal.textContent,/Finalizado/);assert.match(modal.textContent,/Cancelado/);assert.match(modal.textContent,/No presentado/);assert.match(modal.textContent,/No realizado/);assert.match(modal.textContent,/01\/01\/2026.*11:00/);
 assert.doesNotMatch(modal.textContent,/FOREIGN|DELETED|QA/);assert.equal(h.document.getElementById('history-customer-total').textContent,'7');
 assert.ok(h.calls.some(c=>c.table==='services'&&c.column==='customer_id'&&c.ids[0]===uuid(1)));
 assert.ok(!h.calls.some(c=>/financial|payments|cash/.test(c.table)));
 const html=h.panel().innerHTML;modal.onclick({target:modal.querySelector('[data-customer-history-back]'),stopPropagation(){}});await settle();assert.equal(modal.hidden,true);assert.equal(h.document.getElementById('customer-detail-modal').hidden,false);assert.equal(h.panel().innerHTML,html);
});

test('1B history empty, failed read and read-only retry never retain old services',async()=>{
 const h=setup({tables:fixture(2)});await h.show();let modal=await history(h);assert.match(modal.textContent,/No hay servicios vinculados accesibles/);
 let fail=true;const broken=setup({tables:historyFixture(),beforeRead:table=>{if(fail&&table==='services')throw Error('unavailable');}});await broken.show();modal=await history(broken);assert.match(modal.textContent,/No se pudo consultar/);assert.equal(modal.querySelectorAll('[data-customer-service-id]').length,0);assert.equal(modal.querySelector('[data-customer-history-retry]').hidden,false);
 fail=false;await broken.context.openOperationalCustomerHistory(vm.runInContext('operationalCustomerDialog',broken.context));assert.equal(modal.querySelectorAll('[data-customer-service-id]').length,7);
});

for(const change of ['close','navigation','reset','session','customer'])test('1B late history is invalidated by '+change,async()=>{
 let release,started;const ready=new Promise(r=>started=r);let block=true;
 const h=setup({tables:historyFixture(),beforeRead:async table=>{if(block&&table==='services'){block=false;started();await new Promise(r=>release=r);}}});await h.show();const detail=await openDetail(h);
 const pending=h.context.openOperationalCustomerHistory(detail);await ready;const modal=h.document.getElementById('customer-history-modal');assert.match(modal.textContent,/Cargando servicios/);
 if(change==='close')h.context.closeOperationalCustomerDetail();
 if(change==='navigation')h.document.getElementById('clientes').hidden=true;
 if(change==='reset')h.op.reset();
 if(change==='session'){h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});h.window.dispatchEvent(new h.window.Event('elara:auth-session-updated'));}
 if(change==='customer')await openDetail(h,'EMP-000002');
 release();await pending;await settle();assert.equal(modal.hidden,true);assert.equal(modal.querySelectorAll('[data-customer-service-id]').length,0);
});

test('1B history repeated openings keep one modal, unique IDs and one guarded service dispatch',async()=>{
 const h=setup({tables:historyFixture()});await h.show();for(let i=0;i<3;i++)await history(h);
 let calls=0;h.window.ElaraServices={openOperationalDetail:id=>{assert.equal(id,uuid(300));calls++;return Promise.resolve();},closeOperationalDetail(){}};
 const modal=h.document.getElementById('customer-history-modal');await h.context.openOperationalCustomerService(uuid(300),vm.runInContext('operationalCustomerHistory',h.context));
 assert.equal(calls,1);const ids=[...h.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);assert.equal(modal.hidden,false);
});
function serviceController(h){
 h.window.ElaraServicesMock={};h.financialReads=[];h.window.ElaraFinancialClose={context:async id=>{h.financialReads.push(id);return {financial_close:'pending'};}};
 vm.runInContext(fs.readFileSync('src/js/services.js','utf8'),h.context);
 h.window.location={hash:'#clientes'};h.window.ElaraRouter={navigateTo(){throw Error('Unexpected module navigation');}};
}
for(const method of ['button','escape','backdrop'])test('real close '+method+' restores visible interactive history, then ficha, then unchanged list',async()=>{
 const h=setup({tables:historyFixture()});serviceController(h);await h.show();await history(h);
 const historyModal=h.document.getElementById('customer-history-modal'),detail=h.document.getElementById('customer-detail-modal'),service=h.document.getElementById('service-summary-modal');
 const list=h.document.getElementById('customers-list'),listHTML=list.innerHTML,historyHTML=h.document.getElementById('customer-history-content').innerHTML;
 const trigger=historyModal.querySelector('[data-customer-service-id]');
 trigger.dispatchEvent(new h.window.Event('click',{bubbles:true}));
 for(let i=0;i<25;i++){await settle();if(vm.runInContext('Boolean(operationalServiceDetail?.loaded)',h.context))break;}
 assert.equal(service.hidden,false);assert.equal(historyModal.hidden,true);assert.equal(detail.hidden,true);
 let propagatedClose=0;h.document.addEventListener('click',event=>{if(service.contains(event.target))propagatedClose++;});
 if(method==='button')service.querySelector('[data-modal-close]').dispatchEvent(new h.window.Event('click',{bubbles:true}));
 if(method==='backdrop')service.dispatchEvent(new h.window.Event('click',{bubbles:true}));
 if(method==='escape'){
  // The service is opened from this control; it may still own focus while its parent is hidden.
  const event=new h.window.Event('keydown',{bubbles:true});Object.defineProperty(event,'key',{value:'Escape'});trigger.dispatchEvent(event);
 }
 await settle();assert.equal(service.hidden,true);assert.equal(historyModal.hidden,false);assert.equal(detail.hidden,true);assert.equal(h.document.getElementById('customer-history-content').innerHTML,historyHTML);
 assert.equal(propagatedClose,0);
 assert.deepEqual([...h.document.querySelectorAll('.modal-backdrop:not([hidden])')].map(e=>e.id),['customer-history-modal']);
 historyModal.querySelector('[data-customer-history-back]').dispatchEvent(new h.window.Event('click',{bubbles:true}));await settle();assert.equal(historyModal.hidden,true);assert.equal(detail.hidden,false);
 detail.querySelector('[data-modal-close]').dispatchEvent(new h.window.Event('click',{bubbles:true}));await settle();assert.equal(detail.hidden,true);assert.equal(list.innerHTML,listHTML);assert.equal(h.window.location.hash,'#clientes');
});
test('service detail stays in Clientes and returns the exact history/list nodes, filters, page and scroll',async()=>{
 const tables={...historyFixture(),...fixture(120)};tables.services=historyFixture().services.map(s=>({...s,customer_id:s.customer_id===uuid(1)?uuid(101):s.customer_id}));tables.service_locations=historyFixture().service_locations;
 const h=setup({tables});serviceController(h);await h.show();filter(h,0,'individual');filter(h,1,'new');search(h,'Persona');h.panel().querySelector('[data-operational-next]').onclick();
 const panel=h.panel(),list=h.document.getElementById('customers-list'),listHTML=list.innerHTML;
 await panel.querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('[data-operational-detail]')});await h.context.openOperationalCustomerHistory(vm.runInContext('operationalCustomerDialog',h.context));
 const history=h.document.getElementById('customer-history-modal'),content=h.document.getElementById('customer-history-content'),historyHTML=content.innerHTML,service=h.document.getElementById('service-summary-modal');
 content.scrollTop=175;list.scrollTop=65;h.document.getElementById('clientes').scrollTop=45;
 for(const id of [uuid(300),uuid(303)]){
  await h.context.openOperationalCustomerService(id,vm.runInContext('operationalCustomerHistory',h.context));
  assert.equal(h.window.location.hash,'#clientes');assert.equal(h.document.getElementById('servicios').hidden,true);assert.equal(h.document.getElementById('clientes').hidden,false);
  assert.equal(service.hidden,false);assert.equal(service.dataset.serviceId,id);assert.match(h.document.getElementById('summary-service-uuid').textContent,new RegExp(id));assert.equal(history.hidden,true);
  if(id===uuid(303)){
   tables.service_status_history=[{id:uuid(880),service_id:id,from_status:'in_progress',to_status:'completed',changed_at:'2026-01-01T10:00:00Z',metadata:{active_context:'administrativo'}}];
   await h.context.loadOperationalServiceHistory(vm.runInContext('operationalServiceDetail',h.context));
   assert.equal(h.document.querySelectorAll('[data-service-history-event]').length,1);
   assert.equal(h.calls.filter(c=>c.table==='service_status_history'&&c.ids?.includes(id)).length,1);
  }
  h.window.ElaraServices.closeOperationalDetail();await settle();
  assert.equal(history.hidden,false);assert.equal(content.innerHTML,historyHTML);assert.equal(content.scrollTop,175);assert.equal(h.panel(),panel);assert.equal(list.innerHTML,listHTML);assert.equal(list.scrollTop,65);assert.equal(h.document.getElementById('clientes').scrollTop,45);
  assert.equal(panel.querySelector('[data-operational-search]').value,'Persona');assert.equal(panel.querySelector('[data-operational-filter="0"]').value,'individual');assert.equal(panel.querySelector('[data-operational-filter="1"]').value,'new');assert.match(panel.querySelector('[data-operational-page]').textContent,/2/);
  assert.equal(h.calls.filter(c=>c.table==='service_financials'&&c.ids?.includes(id)).length,1);
 }
 assert.deepEqual(h.financialReads,[uuid(303)]);
 assert.equal(h.calls.some(c=>c.table==='v_admin_service_overview'),false);
 history.onclick({target:history.querySelector('[data-customer-history-back]'),stopPropagation(){}});assert.equal(h.document.getElementById('customer-detail-modal').hidden,false);
 h.context.closeOperationalCustomerDetail();assert.equal(list.innerHTML,listHTML);assert.equal(service.hidden,true);
});
for(const change of ['close','navigation','session','customer','reset'])test('pending service opened from Clientes cannot survive '+change,async()=>{
 let release,started,block=true;const ready=new Promise(r=>started=r);
 const h=setup({tables:historyFixture(),beforeRead:async table=>{if(block&&table==='service_passengers'){block=false;started();await new Promise(r=>release=r);}}});serviceController(h);await h.show();const modal=await history(h);
 const pending=h.context.openOperationalCustomerService(uuid(300),vm.runInContext('operationalCustomerHistory',h.context));await ready;
 if(change==='close')h.window.ElaraServices.closeOperationalDetail();
 if(change==='navigation'){h.document.getElementById('clientes').hidden=true;h.window.location.hash='#dashboard';h.window.dispatchEvent(new h.window.Event('hashchange'));}
 if(change==='session'){h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});h.window.dispatchEvent(new h.window.Event('elara:auth-session-updated'));}
 if(change==='customer')await openDetail(h,'EMP-000002');
 if(change==='reset')h.op.reset();
 release();await pending;await settle();assert.equal(h.document.getElementById('service-summary-modal').hidden,true);
 assert.equal(modal.hidden,change!=='close');assert.equal(h.window.location.hash,change==='navigation'?'#dashboard':'#clientes');
});
test('rapid consecutive service requests discard late data and keep one controller',async()=>{
 let release,started,block=true;const ready=new Promise(r=>started=r);const h=setup({tables:historyFixture(),beforeRead:async table=>{if(block&&table==='service_passengers'){block=false;started();await new Promise(r=>release=r);}}});serviceController(h);await h.show();await history(h);const state=vm.runInContext('operationalCustomerHistory',h.context);
 const first=h.context.openOperationalCustomerService(uuid(300),state);await ready;await h.context.openOperationalCustomerService(uuid(303),state);release();await first;
 const modal=h.document.getElementById('service-summary-modal');assert.equal(modal.dataset.serviceId,uuid(303));assert.match(h.document.getElementById('summary-service-uuid').textContent,new RegExp(uuid(303)));assert.equal(h.document.querySelectorAll('#service-summary-modal').length,1);
 h.window.ElaraServices.closeOperationalDetail();await settle();assert.equal(state.modal.hidden,false);
});
test('public service opener rejects invalid origin, UUID, inactive views and unauthorized contexts',async()=>{
 const h=setup({tables:historyFixture()});serviceController(h);await h.show();const before=h.calls.length;
 for(const [id,options] of [['invalid',{viewId:'clientes'}],[uuid(300),{viewId:'dashboard'}],[uuid(300),{viewId:'servicios'}],[uuid(300),{viewId:'clientes',isCurrent:()=>false}]])await h.window.ElaraServices.openOperationalDetail(id,options);
 h.window.ElaraAuth.getActiveContext=()=> 'conductor';await h.window.ElaraServices.openOperationalDetail(uuid(300),{viewId:'clientes'});assert.equal(h.calls.length,before);assert.equal(h.document.getElementById('service-summary-modal').hidden,true);
});

test('1B corporate contact rendering excludes QA contacts and QA contact people',async()=>{
 const tables=historyFixture();tables.persons.push({id:uuid(9999),first_name:'Persona excluida',metadata:{qa_fixture:true}});
 tables.company_contacts=[{id:uuid(90),company_id:uuid(1001),person_id:uuid(1000),role_label:'Responsable autorizado',status:'active'},
 {id:uuid(91),company_id:uuid(1001),person_id:uuid(1002),role_label:'QA oculto',status:'active',metadata:{qa_fixture:true}},
 {id:uuid(92),company_id:uuid(1001),person_id:uuid(9999),role_label:'Persona QA oculta',status:'active'}];
 const h=setup({tables});await h.show();await openDetail(h,'EMP-000002');const content=h.document.getElementById('customer-detail-content');
 assert.match(content.textContent,/Responsable autorizado/);assert.match(content.textContent,/persona0@example.test/);assert.doesNotMatch(content.textContent,/QA ocult|Persona excluida|persona2@example.test/);
});

test('1B simultaneous history attempts share pending identity reads and never duplicate scoped service reads',async()=>{
 let release,started,block=true;const ready=new Promise(r=>started=r);
 const h=setup({tables:historyFixture(),beforeRead:async table=>{if(block&&table==='services'){block=false;started();await new Promise(r=>release=r);}}});await h.show();const detail=await openDetail(h);
 const first=h.context.openOperationalCustomerHistory(detail);await ready;const second=h.context.openOperationalCustomerHistory(detail);release();await Promise.all([first,second]);
 assert.equal(h.calls.filter(c=>c.table==='services'&&c.column==='customer_id').length,1);assert.equal(h.document.querySelectorAll('#customer-history-modal [data-customer-service-id]').length,7);
});

test('1B rendered history clears immediately when the application announces a changed session',async()=>{
 const h=setup({tables:historyFixture()});await h.show();const modal=await history(h);h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});h.window.dispatchEvent(new h.window.Event('elara:auth-session-updated'));
 assert.equal(modal.hidden,true);assert.equal(modal.querySelectorAll('[data-customer-service-id]').length,0);assert.equal(h.document.getElementById('customer-detail-content').innerHTML,'');
});

test('one existing creation button moves to the page header and opens the current administrative form',async()=>{
 const h=setup();await h.show();
 const button=h.document.querySelector('.header__actions [data-catalog-action="customerCreate"]');
 assert.ok(button);assert.equal(button.hidden,false);assert.equal(h.panel().querySelector('[data-catalog-action="customerCreate"]'),null);
 await h.show();assert.equal(h.document.querySelector('[data-catalog-action="customerCreate"]'),button);
 // Linkedom does not provide the browser's HTMLFormElement.elements collection.
 Object.defineProperty(Object.getPrototypeOf(h.document.querySelector('form')),'elements',{configurable:true,get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(el=>[el.name,el]));}});
 await button.onclick();
 const modal=h.document.getElementById('new-customer-modal');assert.equal(modal.hidden,false);
 assert.match(modal.textContent,/Nuevo cliente individual/);assert.ok(modal.querySelector('form'));
 assert.ok(modal.querySelector('[name="firstName"]'));assert.ok(modal.querySelector('[name="lastName"]'));assert.ok(modal.querySelector('[type="submit"]'));
 assert.ok(!h.calls.some(call=>call.rpc));
});

for(const change of ['navigation','reset','session','role'])test('header creation action cannot survive '+change,async()=>{
 const h=setup();await h.show();const button=h.document.querySelector('[data-catalog-action="customerCreate"]');
 let opens=0;h.window.ElaraCatalogAdmin={...h.window.ElaraCatalogAdmin,open:()=>opens++};
 if(change==='navigation')h.document.getElementById('clientes').hidden=true;
 if(change==='reset')h.op.reset();
 if(change==='session')h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});
 if(change==='role')h.window.ElaraAuth.getActiveContext=()=> 'conductor';
 button.onclick();assert.equal(opens,0);await settle();
 if(['navigation','reset'].includes(change))assert.equal(button.hidden,true);
});

test('original overlay opens by UUID; close preserves search, combined filters and page without inline content',async()=>{
 const h=setup({tables:fixture(120)});await h.show();
 filter(h,0,'individual');filter(h,1,'new');search(h,'Persona');h.panel().querySelector('[data-operational-next]').onclick();
 const list=h.panel().querySelector('[data-operational-results]'),html=list.innerHTML,page=h.panel().querySelector('[data-operational-page]').textContent;
 const button=cards(h)[0].querySelector('[data-operational-detail]'),id=button.dataset.customerId;
 await list.onclick({target:button});const modal=h.document.getElementById('customer-detail-modal');
 assert.equal(modal.hidden,false);assert.equal(modal.dataset.customerId,id);assert.match(modal.textContent,new RegExp(id));
 assert.equal(h.panel().querySelector('[data-operational-detail-content]').innerHTML,'');assert.equal(h.panel().querySelector('[data-catalog-action="customerStatus"]'),null);
 const action=modal.querySelector('[data-catalog-action="customerStatus"]');assert.ok(action.closest('#customer-detail-view-actions'));
 const opened=[];h.window.ElaraCatalogAdmin={...h.window.ElaraCatalogAdmin,open:(...args)=>opened.push(args)};
 modal.onclick({target:action,stopPropagation(){}});assert.deepEqual(opened,[['customers','customerStatus',id]]);
 modal.onclick({target:modal.querySelector('[data-modal-close]'),stopPropagation(){}});
 assert.equal(modal.hidden,true);assert.equal(h.document.getElementById('customer-detail-content').innerHTML,'');
 assert.equal(list.innerHTML,html);assert.equal(h.panel().querySelector('[data-operational-page]').textContent,page);
 assert.equal(h.panel().querySelector('[data-operational-search]').value,'Persona');assert.equal(h.panel().querySelector('[data-operational-filter="0"]').value,'individual');assert.equal(h.panel().querySelector('[data-operational-filter="1"]').value,'new');
});

test('rapid client switch discards previous contacts and a late detail response',async()=>{
 let release,started;const ready=new Promise(r=>started=r);
 const h=setup({beforeRead:async table=>{if(table==='company_contacts'){started();await new Promise(r=>release=r);}}});await h.show();
 search(h,'EMP-000002');const first=h.panel().querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('[data-operational-detail]')});await ready;
 search(h,'CL-000005');await h.panel().querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('[data-operational-detail]')});
 release();await first;const modal=h.document.getElementById('customer-detail-modal');assert.equal(modal.hidden,false);assert.equal(modal.dataset.customerId,uuid(5));assert.match(modal.textContent,/Persona 4/);assert.doesNotMatch(modal.textContent,/Comercial 1/);
});

for(const change of ['close','reset','session','navigation'])test('pending modal cannot repopulate after '+change,async()=>{
 let release,started;const ready=new Promise(r=>started=r);
 const h=setup({beforeRead:async table=>{if(table==='company_contacts'){started();await new Promise(r=>release=r);}}});await h.show();search(h,'EMP-000002');
 const pending=h.panel().querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('[data-operational-detail]')});await ready;
 const modal=h.document.getElementById('customer-detail-modal');
 if(change==='close')modal.onkeydown({key:'Escape',stopPropagation(){}});
 if(change==='reset')h.op.reset();
 if(change==='session')h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});
 if(change==='navigation')h.document.getElementById('clientes').hidden=true;
 release();await pending;await settle();assert.equal(modal.hidden,true);assert.equal(h.document.getElementById('customer-detail-content').innerHTML,'');assert.equal(modal.querySelector('[data-catalog-action]'),null);
});

test('repeated opening replaces handlers, backdrop closes, and loading failures remain inside the modal',async()=>{
 const h=setup();await h.show();const button=cards(h)[0].querySelector('[data-operational-detail]');
 for(let i=0;i<3;i++){
  await h.panel().querySelector('[data-operational-results]').onclick({target:button});const modal=h.document.getElementById('customer-detail-modal');
  assert.equal(modal.querySelectorAll('[data-catalog-action="customerStatus"]').length,1);modal.onclick({target:modal,stopPropagation(){}});assert.equal(modal.hidden,true);
 }
 h.op={...h.op,loadIdentity:async()=>{throw Error('unavailable');}};h.window.ElaraOperationalData=h.op;
 await h.panel().querySelector('[data-operational-results]').onclick({target:button});
 assert.ok(h.document.querySelector('#customer-detail-content [role="alert"]'));assert.equal(h.panel().querySelector('[data-operational-detail-content]').innerHTML,'');
});

test('administrative refresh reopens the saved UUID across pages with three buttons per card',async()=>{
 const h=setup({inspectRefresh:true});await h.show();
 for(const id of [uuid(5),uuid(30)]){
  await h.window.ElaraCatalogAdmin.refresh('customers',{customer_id:id},'customerStatus');
  assert.equal(h.panel().dataset.catalogLastSaved,id);
  assert.match(h.document.getElementById('customer-detail-content').textContent,new RegExp(id));
 }
});

test('company detail retains authorized contact identities and lifecycle restrictions',async()=>{
 const tables=fixture(2);tables.company_contacts=[{id:uuid(80),company_id:uuid(1001),person_id:uuid(1000),role_label:'Contacto autorizado',status:'active'}];
 const h=setup({tables});await h.show();search(h,'EMP-000002');
 await h.panel().querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('[data-operational-detail]')});
 const detail=h.document.getElementById('customer-detail-modal');
 assert.match(detail.textContent,/Contacto autorizado/);assert.match(detail.textContent,/Persona 0 Apellido/);
 assert.equal(detail.querySelector('[data-catalog-action="customerStatus"]'),null);
});
