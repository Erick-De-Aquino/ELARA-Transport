const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {setup,uuid,fixtureRows,settle}=require('./services-presentation-harness.cjs');
const cards=h=>[...h.panel().querySelectorAll('[data-operational-service-id]')];
const search=(h,value)=>h.panel().querySelector('[data-operational-search]').oninput({target:{value}});
function filter(h,index,value){const select=h.panel().querySelector(`[data-operational-filter="${index}"]`);Object.defineProperty(select,'value',{configurable:true,value});select.onchange();}

test('SQL adapter is pure, preserves zero and separates operational, assignment and financial states',()=>{
 const h=setup(),row={...fixtureRows(1)[0],operational_status:'completed',assignment_status:'accepted',pricing_status:'finalized',total_amount:0,paid_amount:0,pending_amount:0,financial_close_label:'Cierre financiero pendiente'};
 const before=JSON.stringify(row);h.context.row=row;const s=vm.runInContext('adaptOperationalService(row)',h.context);
 assert.equal(JSON.stringify(row),before);assert.match(s.price,/0,00/);assert.match(s.paid,/0,00/);assert.match(s.pending,/0,00/);assert.equal(s.state,'Completado');assert.equal(s.assignment,'Aceptada');assert.match(s.close,/pendiente/);assert.match(s.origin,/no disponible/);
 h.context.row={...row,total_amount:20};assert.match(vm.runInContext('adaptOperationalService(row).price',h.context),/20,00/);
 h.context.row={...row,pricing_status:'draft',total_amount:20};assert.equal(vm.runInContext('adaptOperationalService(row).price',h.context),'Sin precio definitivo');
});
test('rich cards use real fields, scoped batched routes, summary of all filtered rows and no mock source',async()=>{
 const h=setup();await h.show();assert.equal(cards(h).length,25);assert.match(h.panel().textContent,/32/);assert.match(cards(h)[1].textContent,/SRV-000002/);assert.match(cards(h)[1].textContent,/Cliente 1/);assert.match(cards(h)[1].textContent,/Conductor de prueba/);assert.match(cards(h)[1].textContent,/1234-BCD/);assert.match(cards(h)[1].textContent,/Confirmado/);assert.match(cards(h)[1].textContent,/20,00/);assert.match(cards(h)[1].textContent,/Pagado:/);assert.match(cards(h)[1].textContent,/Pendiente:/);assert.match(cards(h)[0].textContent,/Origen 0/);
 const calls=h.calls.filter(c=>c.table==='service_locations');assert.equal(calls.length,1);assert.equal(calls[0].column,'service_id');assert.equal(calls[0].ids.length,32);
 assert.match(cards(h)[3].textContent,/Cierre financiero pendiente/);assert.match(cards(h)[10].textContent,/Cierre financiero resuelto/);
});
test('pagination and search operate over the complete collection; filters reset page',async()=>{
 const h=setup();await h.show();h.panel().querySelector('[data-operational-next]').onclick();assert.equal(cards(h).length,7);assert.equal(cards(h)[0].dataset.operationalServiceId,uuid(26));
 search(h,'SRV-000032');assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.operationalServiceId,uuid(32));assert.match(h.panel().querySelector('[data-operational-page]').textContent,/1 de 1/);
 search(h,'');filter(h,0,'pending');assert.equal(cards(h).length,5);assert.ok(cards(h).every(c=>c.textContent.includes('Pendiente')));
 filter(h,0,'');filter(h,1,'Cierre financiero pendiente');assert.equal(cards(h).length,1);assert.equal(cards(h)[0].dataset.operationalServiceId,uuid(4));
});
test('QA rows and their routes are excluded before presentation reads',async()=>{
 const rows=fixtureRows(3);rows[0].metadata={qa_fixture:true};const h=setup({rows});await h.show();assert.equal(cards(h).length,2);assert.ok(!h.calls.find(c=>c.table==='service_locations').ids.includes(uuid(1)));
});
test('route batches remain bounded for collections larger than one page',async()=>{
 const h=setup({rows:fixtureRows(205)});await h.show();const reads=h.calls.filter(c=>c.table==='service_locations');assert.deepEqual(reads.map(c=>c.ids.length),[100,100,5]);assert.equal(cards(h).length,25);assert.match(h.panel().querySelector('[data-operational-summary]').textContent,/205/);
 filter(h,2,uuid(600));assert.ok(cards(h).every(c=>c.textContent.includes('Conductor de prueba')));filter(h,2,'');filter(h,3,uuid(500));assert.match(h.panel().querySelector('[data-operational-summary]').textContent,/205/);
});
test('session generation reset discards a pending presentation response',async()=>{
 let release,started;const ready=new Promise(r=>started=r);const h=setup({beforeRead:async table=>{if(table==='v_admin_service_overview'){started();await new Promise(r=>release=r);}}});const pending=h.show();await ready;h.op.reset();release();await pending;assert.equal(h.panel().textContent,'');assert.equal(cards(h).length,0);
});
test('ambiguous routes remain explicit missing values; SQL rows are not mutated',async()=>{
 const rows=fixtureRows(1),before=JSON.stringify(rows),h=setup({rows});h.tables.service_locations.push({...h.tables.service_locations[0],id:uuid(9999)});await h.show();assert.match(cards(h)[0].textContent,/Origen no disponible/);assert.equal(JSON.stringify(rows),before);
});
test('actions preserve current delegated handler and UUID contracts across repeated openings',async()=>{
 const h=setup();await h.show();await h.show();assert.equal(h.panel().querySelectorAll('[data-service-admin-action="create"]').length,1);
 const button=h.panel().querySelector('[data-service-admin-action="assign"]');h.click(button);assert.equal(h.actions.length,1);assert.deepEqual(h.actions[0],['assign',uuid(1)]);
 for(const b of h.panel().querySelectorAll('[data-service-id],[data-financial-id]'))assert.match(b.dataset.serviceId||b.dataset.financialId,/^10000000-0000-4000-8000-\d{12}$/);
 const close=h.panel().querySelector('[data-financial-kind="admin"]');assert.equal(close.dataset.financialId,uuid(4));
});
test('Ver opens the original modal and keeps current administrative actions',async()=>{
 const h=setup();await h.show();h.click(h.panel().querySelector('[data-operational-detail]'));await settle();await settle();const detail=h.document.getElementById('service-summary-modal');assert.match(detail.textContent,/SRV-000001/);assert.equal(detail.hidden,false);assert.equal(detail.dataset.serviceId,uuid(1));h.click(h.document.getElementById('service-detail-edit'));assert.deepEqual(h.actions,[['update',uuid(1)]]);
});
test('late overview response cannot replace a newer load',async()=>{
 let release,started;const ready=new Promise(r=>started=r);let first=true;
 const h=setup({beforeRead:async table=>{if(table==='v_admin_service_overview'&&first){first=false;started();await new Promise(r=>release=r);}}});
 const old=h.show();await ready;h.tables.v_admin_service_overview=[{...fixtureRows(1)[0],human_code:'SRV-NEW'}];await h.show();release();await old;assert.equal(cards(h).length,1);assert.match(cards(h)[0].textContent,/SRV-NEW/);
});
for(const rejected of [false,true])test(`late detail ${rejected?'error':'success'} cannot overwrite a changed filter`,async()=>{
 let release,block=false;const h=setup({beforeRead:async table=>{if(block&&table==='service_passengers'){block=false;await new Promise(r=>release=r);if(rejected)throw Error('old');}}});await h.show();block=true;h.click(h.panel().querySelector('[data-operational-detail]'));for(let i=0;i<10&&!release;i++)await settle();search(h,'SRV-000002');release();await settle();await settle();assert.equal(h.panel().querySelector('[data-operational-detail-content]').textContent,'');assert.equal(h.document.getElementById('service-summary-modal').hidden,true);
});
test('other modules retain generic chrome/table/default filters and details',async()=>{
 const h=setup();await h.op.show('servicios',{title:'Generic',load:async()=>[{id:uuid(1),name:'Generic row',status:'active',driver_id:uuid(600),customer_id:uuid(500)}],columns:[['Nombre','name']],detail:async()=>'<p>Generic detail</p>'});assert.equal(h.panel().className,'panel');assert.ok(h.panel().querySelector('table'));assert.equal(h.panel().querySelectorAll('.operation-card').length,0);assert.equal(h.panel().querySelectorAll('[data-operational-filter]').length,3);h.click(h.panel().querySelector('[data-operational-detail]'));await settle();assert.match(h.panel().textContent,/Generic detail/);
});
test('user text is escaped in cards, route, filter options and inline datasets',async()=>{
 const rows=fixtureRows(1);rows[0].customer_display_name='<img src=x onerror=alert(1)>';rows[0].human_code='<script>bad()</script>';const h=setup({rows});h.tables.service_locations[0].label='<svg onload=bad()>';await h.show();assert.equal(h.panel().querySelector('img,script,svg'),null);assert.match(cards(h)[0].textContent,/<img/);assert.match(cards(h)[0].textContent,/<svg/);
});
test('read failures and empty results never display demonstration data',async()=>{
 const h=setup({rows:[]});await h.show();assert.equal(cards(h).length,0);assert.ok(h.panel().querySelector('[role="status"]'));
 const bad=setup({beforeRead:async table=>{if(table==='v_admin_service_overview')throw Error('Read failed');}});await bad.show();assert.match(bad.panel().querySelector('[role="alert"]').textContent,/Read failed/);assert.equal(cards(bad).length,0);
});
