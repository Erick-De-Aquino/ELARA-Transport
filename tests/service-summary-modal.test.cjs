// In-memory transport and DOM fixtures; no real services are created or changed.
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,uuid,fixtureRows,settle}=require('./services-presentation-harness.cjs');
function summary(options={}) {
 const h=setup({rows:fixtureRows(2),...options});const id=uuid(1);
 Object.assign(h.tables.services[0],{notes:'Nota operativa',scheduled_start_at:'2026-11-14T14:39:00Z'});
 h.tables.persons=[{id:uuid(501),first_name:'Cliente',last_name:'Real'},{id:uuid(601),first_name:'Conductor',last_name:'Real'}];h.tables.customers[0].person_id=uuid(501);h.tables.drivers[0].person_id=uuid(601);
 h.tables.service_passengers=[{id:uuid(800),service_id:id,display_name:'Pasajero real',phone:'+34000000000',is_primary:true}];
 h.tables.service_locations[0].address='Calle de origen 1';h.tables.service_locations[1].address='Calle de destino 2';
 h.tables.service_assignments=[{id:uuid(801),service_id:id,driver_id:uuid(600),vehicle_id:uuid(700),assignment_status:'accepted',ended_at:null},{id:uuid(802),service_id:id,driver_id:uuid(600),vehicle_id:uuid(700),assignment_status:'rejected',ended_at:'2026-11-01T00:00:00Z'}];
 h.tables.service_financials=[{id:uuid(803),service_id:id,pricing_status:'finalized',currency_code:'EUR',taxable_base_amount:18.18,tax_rate:10,tax_amount:1.82,total_amount:20,paid_amount:0,pending_amount:20,financial_status:'pending'}];
 h.tables.service_payments=[];h.financeCalls=[];h.window.ElaraFinancialClose.context=async serviceId=>{h.financeCalls.push(serviceId);return {service_id:serviceId,financial_close:'pending',no_charge:false};};
 h.modal=h.document.getElementById('service-summary-modal');h.text=name=>h.document.getElementById('summary-service-'+name).textContent;
 h.open=(serviceId=id)=>h.context.openOperationalServiceDetail(serviceId);return h;
}
test('original modal renders fresh identity, passenger, separate addresses, current assignment and Madrid time',async()=>{
 const h=summary();await h.show();await h.open();assert.equal(h.modal.hidden,false);assert.equal(h.text('uuid'),uuid(1));assert.equal(h.text('number'),'SRV-000001');
 assert.equal(h.text('client'),'Cliente Real');assert.match(h.text('passenger'),/Pasajero real.*\+34000000000/);assert.equal(h.text('origin-address'),'Calle de origen 1');assert.equal(h.text('destination-address'),'Calle de destino 2');
 assert.match(h.text('collaborator'),/Conductor Real/);assert.match(h.text('vehicle'),/1234-BCD/);assert.equal(h.text('assignment-status'),'Aceptada');assert.equal(h.text('date'),'14/11/2026');assert.equal(h.text('time'),'15:39');assert.equal(h.text('notes'),'Nota operativa');
 assert.equal(h.calls.filter(c=>c.table==='service_status_history').length,0);
});
test('financial, assignment and operational states remain separate; financial amounts use only stored fields',async()=>{
 const h=summary();Object.assign(h.tables.services[0],{operational_status:'completed'});await h.show();await h.open();
 assert.equal(h.text('status'),'Completado');assert.equal(h.text('assignment-status'),'Aceptada');assert.match(h.text('financial-total'),/20,00/);assert.match(h.text('financial-paid'),/0,00/);assert.equal(h.text('financial-status'),'Pendiente');assert.equal(h.text('financial-close'),'Cierre financiero pendiente');
 const price=h.document.getElementById('service-detail-financial-edit'),close=h.document.getElementById('service-detail-payment-register');assert.equal(price.dataset.financialKind,'pricing');assert.equal(close.dataset.financialKind,'admin');assert.equal(close.dataset.financialId,uuid(1));assert.equal(h.document.getElementById('service-detail-writeoff').disabled,true);
 assert.equal(h.document.getElementById('service-detail-edit').disabled,true);
});
test('zero price and zero pending do not imply a resolved 0050 close',async()=>{
 const h=summary();h.tables.services[0].operational_status='completed';Object.assign(h.tables.service_financials[0],{total_amount:0,paid_amount:0,pending_amount:0});await h.show();await h.open();assert.match(h.text('financial-total'),/0,00/);assert.equal(h.text('financial-close'),'Cierre financiero pendiente');
 h.window.ElaraFinancialClose.context=async id=>({service_id:id,financial_close:'resolved',no_charge:true});await h.open();assert.match(h.text('financial-close'),/Sin importe a cobrar/);
});
test('draft prices never display placeholder zeros as final prices and payments have explicit empty state',async()=>{
 const h=summary();h.tables.service_financials[0].pricing_status='draft';await h.show();await h.open();assert.equal(h.text('financial-total'),'Sin precio definitivo');assert.equal(h.text('financial-close'),'No corresponde todavía');assert.equal(h.document.getElementById('service-detail-payment-register').disabled,true);assert.equal(h.document.getElementById('summary-service-payment-history').textContent,'Sin pagos registrados.');
});
test('economic read failures are explicit and do not discard the operational detail',async()=>{
 const h=summary({beforeRead:async table=>{if(['service_financials','service_payments'].includes(table))throw Error('Financial read denied');}});await h.show();await h.open();assert.equal(h.text('number'),'SRV-000001');assert.match(h.text('financial-pricing'),/no disponible/);assert.equal(h.text('financial-total'),'No disponible');assert.match(h.document.getElementById('summary-service-payment-history').textContent,/No se pudieron/);
});
test('opening another UUID and reopening cannot retain passengers, addresses or assignment from the first',async()=>{
 const h=summary();await h.show();await h.open();await h.open(uuid(2));assert.equal(h.modal.dataset.serviceId,uuid(2));assert.equal(h.text('number'),'SRV-000002');assert.equal(h.text('passenger'),'Sin pasajeros registrados');assert.equal(h.text('assignment-status'),'Sin asignación actual');assert.equal(h.text('origin-address'),'Sin dirección registrada');assert.equal(h.text('notes'),'Sin observaciones');
});
test('ambiguous assignments and locations are not guessed',async()=>{
 const h=summary();h.tables.service_assignments.push({...h.tables.service_assignments[0],id:uuid(810)});h.tables.service_locations.push({...h.tables.service_locations[0],id:uuid(811)});await h.show();await h.open();assert.match(h.text('assignment-status'),/ambigua/);assert.match(h.text('origin'),/ambigua/);assert.doesNotMatch(h.text('collaborator'),/Conductor Real/);
});
test('administrative buttons reuse ElaraServiceAdmin and close the detail before opening a form',async()=>{
 const h=summary();await h.show();for(const [button,action]of [['edit','update'],['assign','assign'],['reassign','reassign'],['cancel-service','cancel']]){await h.open();h.click(h.document.getElementById('service-detail-'+button));assert.deepEqual(h.actions.at(-1),[action,uuid(1)]);assert.equal(h.modal.hidden,true);}
});
test('administrative visibility follows every operational state and resets when switching services',async()=>{
 const h=summary();await h.show();
 const buttons=()=>['edit','assign','reassign','cancel-service'].map(key=>h.document.getElementById('service-detail-'+key));
 for(const state of ['pending','confirmed','in_progress','completed','cancelled','no_show','not_performed','pending','completed','confirmed']){
  h.tables.services[0].operational_status=state;await h.open();
  const allowed=['pending','confirmed'].includes(state);
  for(const button of buttons()){assert.equal(button.hidden,!allowed,`${state}: ${button.id}`);assert.equal(button.disabled,!allowed);}
  assert.equal(h.modal.querySelector('[data-modal-close]').hidden,false);
 }
 h.tables.services[1].operational_status='completed';await h.open(uuid(2));assert.ok(buttons().every(b=>b.hidden));
 await h.open(uuid(1));assert.ok(buttons().every(b=>!b.hidden&&!b.disabled));
 h.context.closeOperationalServiceDetail();assert.ok(buttons().every(b=>b.hidden&&b.disabled));
});
test('close button, backdrop, Escape and repeat opening retain unique DOM and one handler',async()=>{
 const h=summary();await h.show();for(let i=0;i<3;i++){await h.open();h.click(h.document.getElementById('service-detail-view'));assert.equal(h.modal.hidden,false);h.click(h.modal);assert.equal(h.modal.hidden,true);}
 await h.open();h.click(h.modal.querySelector('[data-modal-close]'));assert.equal(h.modal.hidden,true);await h.open();const event=new h.window.Event('keydown');event.key='Escape';h.document.dispatchEvent(event);assert.equal(h.modal.hidden,true);
 const ids=[...h.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);await h.open();h.click(h.document.getElementById('service-detail-edit'));assert.equal(h.actions.length,1);
});
test('late old detail cannot overwrite the next service or resurrect a closed modal',async()=>{
 let release,block=false;const h=summary({beforeRead:async table=>{if(block&&table==='service_passengers'){block=false;await new Promise(r=>release=r);}}});await h.show();block=true;const old=h.open();for(let i=0;i<10&&!release;i++)await settle();await h.open(uuid(2));release();await old;assert.equal(h.text('number'),'SRV-000002');
 release=null;block=true;const pending=h.open();for(let i=0;i<10&&!release;i++)await settle();h.context.closeOperationalServiceDetail();release();await pending;assert.equal(h.modal.hidden,true);
});
test('identity/session/context changes prevent stale content and actions',async()=>{
 const h=summary();await h.show();await h.open();h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(999)});h.window.dispatchEvent(new h.window.Event('elara:auth-session-updated'));assert.equal(h.modal.hidden,true);assert.equal(h.text('number'),'—');
 h.window.ElaraAuth.getActiveContext=()=> 'conductor';const before=h.calls.length;await h.open();assert.equal(h.calls.length,before);assert.equal(h.actions.length,0);
});
test('missing/QA services and mandatory read errors cannot show partial data or enable actions',async()=>{
 for(const mode of ['missing','qa','read']){const h=summary({beforeRead:async table=>{if(mode==='read'&&table==='service_passengers')throw Error('Denied');}});await h.show();if(mode==='missing')h.tables.services=[];if(mode==='qa')h.tables.services[0].notes='qa_run=isolated;';await h.open();assert.equal(h.document.getElementById('service-detail-operational-status').getAttribute('role'),'alert');assert.equal(h.document.getElementById('service-detail-edit').disabled,true);assert.equal(h.text('number'),'No disponible');}
});
test('financial and operational text is escaped; payment records are facts, not a calculated balance',async()=>{
 const h=summary();h.tables.services[0].notes='<img src=x onerror=bad()>';h.tables.service_passengers[0].display_name='<script>bad()</script>';h.tables.service_payments=[{id:uuid(820),service_id:uuid(1),amount:7,currency_code:'EUR',payment_status:'completed'}];await h.show();await h.open();assert.equal(h.modal.querySelector('img,script'),null);assert.match(h.text('notes'),/<img/);assert.match(h.document.getElementById('summary-service-payment-history').textContent,/7,00/);assert.match(h.text('financial-pending'),/20,00/);
});
