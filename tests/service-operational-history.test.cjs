// DOM and in-memory transport fixtures only. No real Supabase requests or writes.
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,uuid,fixtureRows,settle}=require('./services-presentation-harness.cjs');
function timeline(options={}){
 const h=setup({rows:fixtureRows(2),...options});
 h.tables.persons=[{id:uuid(810),first_name:'Usuario',last_name:'Real'},{id:uuid(811),first_name:'Conductor',last_name:'Real'}];
 h.tables.app_users=[{id:uuid(812),person_id:uuid(810)}];h.tables.drivers[0].person_id=uuid(811);
 h.tables.service_status_history=[
  {id:uuid(801),service_id:uuid(1),from_status:'pending',to_status:'confirmed',changed_at:'2026-11-14T13:00:00Z',changed_by_driver_id:uuid(600),reason:null,metadata:{session_id:'private-session',active_context:'conductor'}},
  {id:uuid(802),service_id:uuid(1),from_status:'confirmed',to_status:'in_progress',changed_at:'2026-11-14T14:00:00Z',changed_by_driver_id:uuid(600),reason:'Motivo persistido',metadata:{driver_stage:'on_way',active_context:'conductor'}},
  {id:uuid(803),service_id:uuid(1),from_status:'in_progress',to_status:'completed',changed_at:'2026-11-14T15:00:00Z',changed_by_user_id:uuid(812),reason:null,metadata:{financial_result:'secret-finance',incident:'secret-incident'}},
 ];
 h.tables.service_passengers=[];h.tables.service_payments=[];
 h.section=h.document.getElementById('service-operational-history');h.content=h.document.getElementById('service-operational-history-content');h.modal=h.document.getElementById('service-summary-modal');
 h.open=(id=uuid(1))=>h.context.openOperationalServiceDetail(id);
 h.expand=async()=>{h.section.open=true;h.section.dispatchEvent(new h.window.Event('toggle'));await settle();await settle();};
 // Lexical module state is intentionally private; invoke through the initialized VM.
 h.load=()=>require('node:vm').runInContext('loadOperationalServiceHistory(operationalServiceDetail)',h.context);
 return h;
}
test('history is lazy and scoped to the real service UUID; newest transitions render first',async()=>{
 const h=timeline();await h.show();await h.open();assert.equal(h.calls.filter(c=>c.table==='service_status_history').length,0);
 const readsBefore=h.calls.length;await h.expand();assert.ok(h.calls.slice(readsBefore).every(c=>['service_status_history','app_users'].includes(c.table)));const calls=h.calls.filter(c=>c.table==='service_status_history');assert.equal(calls.length,1);assert.equal(calls[0].column,'service_id');assert.deepEqual(Array.from(calls[0].ids),[uuid(1)]);
 assert.deepEqual([...h.content.querySelectorAll('[data-service-history-event]')].map(e=>e.dataset.serviceHistoryEvent),[uuid(803),uuid(802),uuid(801)]);
 assert.match(h.content.textContent,/En curso.*Completado/);assert.match(h.content.textContent,/Pendiente.*Confirmado/);assert.doesNotMatch(h.content.textContent,/aceptó|Servicio creado|Rechazó/);
});
test('Madrid date/time, recorded actor/reason and allowlisted metadata are presented without guessing',async()=>{
 const h=timeline();await h.show();await h.open();await h.expand();assert.match(h.content.textContent,/14\/11\/2026/);assert.equal(h.content.querySelector('time').textContent,'16:00');
 assert.match(h.content.textContent,/Usuario · Usuario Real/);assert.match(h.content.textContent,/Conductor · Conductor Real/);assert.match(h.content.textContent,/Motivo registrado: Motivo persistido/);assert.match(h.content.textContent,/Etapa registrada: En camino/);
 assert.doesNotMatch(h.content.textContent,/private-session|secret-finance|secret-incident|session_id|updated_by/);
});
test('zero history is an explicit empty state, not an inferred creation or completion',async()=>{
 const h=timeline();h.tables.service_status_history=[];h.tables.services[0].operational_status='completed';h.tables.services[0].updated_by=uuid(812);
 await h.show();await h.open();await h.expand();assert.match(h.content.textContent,/No hay transiciones operativas registradas/);assert.equal(h.content.querySelector('li'),null);
});
test('unavailable actor names remain neutral without losing recorded transitions',async()=>{
 const h=timeline({beforeRead:async table=>{if(table==='app_users')throw Error('Name read denied');}});h.tables.service_status_history[1].changed_by_driver_id=uuid(999);h.tables.services[0].updated_by=uuid(812);
 await h.show();await h.open();await h.expand();assert.equal(h.content.querySelectorAll('li').length,3);assert.match(h.content.textContent,/Responsable no identificable/);assert.doesNotMatch(h.content.textContent,/Usuario Real/);
});
test('query error offers a read-only retry and concurrent retry clicks issue one query',async()=>{
 let fail=true,release;const h=timeline({beforeRead:async table=>{if(table==='service_status_history'){if(fail)throw Error('Unavailable');await new Promise(r=>release=r);}}});
 await h.show();await h.open();await h.expand();assert.ok(h.content.querySelector('[role="alert"]'));assert.ok(h.content.querySelector('[data-service-history-retry]'));assert.doesNotMatch(h.content.textContent,/No hay transiciones/);
 fail=false;const button=h.content.querySelector('button');h.click(button);h.click(button);for(let i=0;i<10&&!release;i++)await settle();release();await settle();await settle();assert.equal(h.calls.filter(c=>c.table==='service_status_history').length,2);assert.equal(h.content.querySelectorAll('li').length,3);
});
test('reopening the section reuses current modal data, reopening the modal starts a fresh read',async()=>{
 const h=timeline();await h.show();for(let i=0;i<3;i++){await h.open();await h.expand();h.section.open=false;h.section.dispatchEvent(new h.window.Event('toggle'));await h.expand();h.context.closeOperationalServiceDetail();assert.equal(h.content.querySelectorAll('li').length,0);}
 assert.equal(h.calls.filter(c=>c.table==='service_status_history').length,3);const ids=[...h.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
});
test('changing service discards an old response and never mixes records across UUIDs',async()=>{
 let release,block=false;const h=timeline({beforeRead:async table=>{if(block&&table==='service_status_history'){block=false;await new Promise(r=>release=r);}}});await h.show();await h.open();block=true;const pending=h.load();for(let i=0;i<10&&!release;i++)await settle();await h.open(uuid(2));await h.load();release();await pending;
 assert.equal(h.modal.dataset.serviceId,uuid(2));assert.match(h.content.textContent,/No hay transiciones/);assert.equal(h.content.querySelectorAll('li').length,0);
});
for(const mode of ['close','session','navigation','reset'])test(`${mode} invalidates a pending history response`,async()=>{
 let release;const h=timeline({beforeRead:async table=>{if(table==='service_status_history')await new Promise(r=>release=r);}});await h.show();
 h.click(h.panel().querySelector('[data-operational-detail]'));await settle();await settle();const pending=h.load();for(let i=0;i<10&&!release;i++)await settle();
 if(mode==='close')h.context.closeOperationalServiceDetail();
 if(mode==='session'){h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(999)});h.window.dispatchEvent(new h.window.Event('elara:auth-session-updated'));}
 if(mode==='navigation'){h.document.getElementById('servicios').hidden=true;h.window.dispatchEvent(new h.window.Event('hashchange'));}
 if(mode==='reset')h.op.reset();
 release();await pending;await settle();assert.equal(h.content.querySelectorAll('li').length,0);assert.equal(h.modal.hidden,true);
});
test('unauthorized context, QA entries and foreign rows are excluded; missing dates fail explicitly',async()=>{
 const h=timeline();h.tables.service_status_history.push({...h.tables.service_status_history[0],id:uuid(820),notes:'qa_run=isolated;'});await h.show();await h.open();await h.expand();assert.equal(h.content.querySelectorAll('li').length,3);
 const before=h.calls.length;h.window.ElaraAuth.getActiveContext=()=> 'conductor';await h.load();assert.equal(h.calls.length,before);
 const invalid=timeline();invalid.tables.service_status_history[0].changed_at='bad';await invalid.show();await invalid.open();await invalid.expand();assert.ok(invalid.content.querySelector('[role="alert"]'));
});
test('equal timestamps have a deterministic ID order; hostile reason text is escaped',async()=>{
 const h=timeline();for(const event of h.tables.service_status_history)event.changed_at='2026-07-14T13:39:00Z';h.tables.service_status_history[0].reason='<img src=x onerror=bad()>';
 await h.show();await h.open();await h.expand();assert.equal(h.content.querySelector('time').textContent,'15:39');assert.equal(h.content.querySelector('img'),null);assert.match(h.content.textContent,/<img/);
 assert.deepEqual([...h.content.querySelectorAll('[data-service-history-event]')].map(e=>e.dataset.serviceHistoryEvent),[uuid(803),uuid(802),uuid(801)]);
});
