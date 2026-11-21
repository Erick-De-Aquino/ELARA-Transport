const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,setup}=require('./collaborators-presentation-harness.cjs');
const {uuid}=require('./services-presentation-harness.cjs');
const cards=h=>[...h.panel().querySelectorAll('[data-operational-driver-id]')];
const search=(h,value)=>{const input=h.panel().querySelector('[data-operational-search]');input.value=value;input.oninput({target:input});};
const open=async h=>h.panel().querySelector('[data-operational-results]').onclick({target:cards(h)[0].querySelector('button')});
test('header creation button opens the operational form once and rejects a changed session',async()=>{
 const h=setup();await h.show();const button=h.document.querySelector('.header__actions [data-catalog-action="driverCreate"]');assert.ok(button);assert.equal(button.hidden,false);
 Object.defineProperty(h.window.HTMLElement.prototype,'elements',{configurable:true,get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(e=>[e.name,e]));}});
 await button.onclick();assert.equal(h.document.getElementById('new-collaborator-modal').hidden,false);assert.ok(h.document.querySelector('#new-collaborator-modal [name="firstName"]'));
 h.document.querySelector('#new-collaborator-modal [data-catalog-close]').click();
 h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});await button.onclick();assert.equal(h.document.getElementById('new-collaborator-modal').hidden,true);
});
test('list and detail use natural wording while preserving the availability warning and states',async()=>{
 const h=setup();await h.show();assert.match(h.panel().textContent,/no confirma/);assert.doesNotMatch(h.panel().textContent,/Datos accesibles con tu sesión|vínculo accesible/);
 await open(h);const m=h.document.getElementById('collaborator-detail-modal');assert.match(m.textContent,/Sin información disponible/);assert.match(m.textContent,/Servicios asignados/);assert.match(m.textContent,/Vehículos vinculados/);assert.match(m.textContent,/Los datos personales no se pueden editar desde esta ficha/);assert.match(m.textContent,/conductores suspendidos/);assert.doesNotMatch(m.textContent,/contrato|0048|accesibles|solo lectura/);assert.equal(h.tables.drivers[0].administrative_status,'active');assert.equal(h.tables.drivers[0].availability_preference,'available');
});
test('original nodes, real read adapter, contacts, translated states, linked vehicle and scoped summary',async()=>{
 const h=setup(),list=h.document.getElementById('collaborators-list');await h.show();assert.equal(h.panel().querySelector('#collaborators-list'),list);assert.equal(cards(h).length,25);
 assert.match(cards(h)[0].textContent,/1234ABC/);assert.match(cards(h)[0].textContent,/driver0@example.test/);assert.match(cards(h)[2].textContent,/Suspendido/);assert.match(h.panel().textContent,/Total filtrado32/);assert.ok(h.panel().querySelector('.status-legend__group + .status-legend__group').hidden);
 assert.deepEqual([...new Set(h.calls.map(c=>c.table))].sort(),['driver_vehicle_assignments','drivers','persons','vehicles']);
});
test('search, combined filters, pagination and clearing',async()=>{
 const h=setup();await h.show();h.panel().querySelector('[data-operational-next]').onclick();assert.equal(cards(h).length,7);
 for(const term of ['DRV-000001','driver0@example.test','+34610000','1234ABC']){search(h,term);assert.equal(cards(h).length,1);}
 for(const el of h.panel().querySelectorAll('select'))Object.defineProperty(el,'value',{configurable:true,writable:true,value:''});const select=h.panel().querySelector('[data-operational-filter="0"]');Object.defineProperty(select,'value',{configurable:true,writable:true,value:'inactive'});select.onchange();assert.equal(cards(h).length,0);
 h.panel().querySelector('[data-drivers-clear]').onclick();assert.equal(cards(h).length,25);
});
test('detail uses the original modal, real fields, contract actions and disabled unsupported availability',async()=>{
 const h=setup();await h.show();await open(h);const m=h.document.getElementById('collaborator-detail-modal');assert.equal(m.hidden,false);assert.match(m.textContent,/Conductor 0 Apellido/);assert.match(m.textContent,/1234ABC/);assert.ok(m.querySelector('[data-catalog-action="driverUpdate"]'));assert.ok(m.querySelector('[data-catalog-action="close"]'));assert.ok(m.querySelector('button[disabled]'));assert.equal(m.querySelector('[data-financial-kind]'),null);
 m.onkeydown({key:'Escape',stopPropagation(){}});assert.equal(m.hidden,true);await open(h);assert.equal(m.querySelectorAll('[data-catalog-action="driverUpdate"]').length,1);
 m.onclick({target:m,stopPropagation(){}});assert.equal(m.hidden,true);
 search(h,'DRV-000003');await open(h);assert.equal(m.querySelector('[data-catalog-action="driverUpdate"]'),null);
});
test('repeated navigation preserves unique nodes and a single administrative toolbar',async()=>{
 const h=setup();await h.show();const button=h.document.querySelector('[data-catalog-action="driverCreate"]');await h.show();await h.panel().querySelector('[data-operational-retry]').onclick();const ids=[...h.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);assert.equal(h.document.querySelectorAll('[data-catalog-action="driverCreate"]').length,1);assert.equal(h.document.querySelector('.header__actions [data-catalog-action="driverCreate"]'),button);assert.equal(h.panel().querySelectorAll('[data-drivers-footer]').length,1);
});
test('empty, permission denial and read failure remain explicit without demo fallback',async()=>{
 const h=setup({tables:fixture(0)});await h.show();assert.match(h.panel().textContent,/No hay registros/);
 const denied=setup({role:'conductor'});await denied.show();assert.equal(denied.calls.length,0);assert.ok(denied.panel().querySelector('[role="alert"]'));
 const failed=setup({beforeRead:()=>{throw Error('read failed');}});await failed.show();assert.ok(failed.panel().querySelector('[role="alert"]'));assert.equal(cards(failed).length,0);
});
for(const change of ['session','navigation','reset'])test('late list does not survive '+change,async()=>{
 let release,started;const ready=new Promise(r=>started=r);let block=true;
 const h=setup({beforeRead:async table=>{if(block&&table==='drivers'){block=false;started();await new Promise(r=>release=r);}}});const pending=h.show();await ready;
 if(change==='session')h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});
 if(change==='navigation')await h.op.show('dashboard',{title:'Dashboard',load:async()=>[],columns:[]});
 if(change==='reset')h.op.reset();release();await pending;assert.equal(cards(h).length,0);
});
for(const change of ['session','navigation'])test('late detail does not reveal prior context after '+change,async()=>{
 let block=false,release,started;const ready=new Promise(r=>started=r);
 const h=setup({beforeRead:async table=>{if(block&&table==='service_assignments'){started();await new Promise(r=>release=r);}}});await h.show();block=true;const pending=open(h);await ready;
 if(change==='session')h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});else h.document.getElementById('colaboradores').hidden=true;
 release();await pending;assert.equal(h.document.getElementById('collaborator-detail-modal').hidden,true);
});
test('QA persons exclude drivers and untrusted fields are escaped',async()=>{
 const tables=fixture(4);tables.persons[1].metadata={qa_fixture:true};tables.persons[0].first_name='<img src=x onerror=bad()>';const h=setup({tables});await h.show();assert.equal(cards(h).length,3);assert.equal(h.panel().querySelector('img'),null);assert.match(h.panel().textContent,/<img/);
});
test('driver update with an uncertain response is never replayed without a receipt',async()=>{
 const h=setup();await h.show();let writes=0;h.window.ElaraSupabase.client.rpc=async()=>{writes++;throw Error('lost response');};
 const api=h.window.ElaraCatalogAdmin,attempt=api.operation('driverUpdate'),values={driverId:uuid(1),status:'active',reason:'Local isolated test'};
 await assert.rejects(api.execute(attempt,values));await assert.rejects(api.execute(attempt,values),/lectura/);assert.equal(writes,1);
});
test('driver administrative execution rejects invalidated navigation before sending',async()=>{
 const h=setup();await h.show();let writes=0;h.window.ElaraSupabase.client.rpc=async()=>{writes++;};
 const api=h.window.ElaraCatalogAdmin;
 await assert.rejects(api.execute(api.operation('driverUpdate'),{driverId:uuid(1),status:'active',reason:'Local'},async()=>{},()=>false),/Contexto/);assert.equal(writes,0);
});
test('late creation form cannot appear after changing session',async()=>{
 let block=false,started,release;const ready=new Promise(r=>started=r);
 const h=setup({beforeRead:async table=>{if(block&&table==='persons'){block=false;started();await new Promise(r=>release=r);}}});await h.show();block=true;
 const pending=h.window.ElaraCatalogAdmin.open('drivers','driverCreate');await ready;h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});release();await pending;
 assert.equal(h.document.getElementById('new-collaborator-modal').hidden,true);
});
test('an already opened detail clears when the session update event changes identity',async()=>{
 const h=setup();await h.show();await open(h);h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(901)});h.window.dispatchEvent(new h.window.Event('elara:auth-session-updated'));assert.equal(h.document.getElementById('collaborator-detail-modal').hidden,true);
});
