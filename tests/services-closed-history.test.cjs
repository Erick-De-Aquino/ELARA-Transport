// Local DOM/read fixtures only; transport throws on any unexpected RPC write.
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,fixtureRows,uuid,settle}=require('./services-presentation-harness.cjs');
function history(options={}){
 const h=setup(options);h.hp=h.document.getElementById('services-history-panel');
 h.toggle=()=>h.click(h.document.getElementById('services-history-action'));
 h.cards=()=>[...h.hp.querySelectorAll('[data-historical-service-id]')];
 h.search=value=>{const field=h.document.getElementById('services-history-search');field.value=value;field.dispatchEvent(new h.window.Event('input',{bubbles:true}));};
 return h;
}
test('only four terminal states are historical; QA is excluded and opening history makes no extra read',async()=>{
 const h=history();h.tables.services[3].notes='qa_run=isolated;';await h.show();const count=h.calls.length;h.toggle();
 const allowed=h.tables.v_admin_service_overview.filter(r=>['completed','cancelled','no_show','not_performed'].includes(r.operational_status)&&r.service_id!==uuid(4));
 assert.equal(h.cards().length,allowed.length);assert.equal(h.calls.length,count);assert.equal(h.panel().hidden,true);assert.equal(h.hp.hidden,false);
 assert.ok(h.cards().every(c=>allowed.some(r=>r.service_id===c.dataset.historicalServiceId)));
});
test('history sorts scheduled dates descending and breaks ties deterministically by UUID',async()=>{
 const rows=fixtureRows(5).map(r=>({...r,operational_status:'completed'}));rows[0].scheduled_start_at='2026-11-09T10:00:00Z';rows[1].scheduled_start_at=null;rows[2].scheduled_start_at='bad';rows[3].scheduled_start_at='2026-11-12T10:00:00Z';rows[4].scheduled_start_at='2026-11-12T10:00:00Z';
 const h=history({rows});await h.show();h.toggle();assert.deepEqual(h.cards().map(c=>c.dataset.historicalServiceId),[uuid(5),uuid(4),uuid(1),uuid(3),uuid(2)]);
});
test('search works on real code, client, route and conductor; pagination is 25 and search resets it',async()=>{
 const h=history({rows:fixtureRows(62).map(r=>({...r,operational_status:'completed'}))});await h.show();h.toggle();assert.equal(h.cards().length,25);
 h.click(h.document.getElementById('services-history-next'));assert.match(h.document.getElementById('services-history-page').textContent,/Página 2 de 3/);
 h.search('SRV-000001');assert.equal(h.cards().length,1);assert.equal(h.cards()[0].dataset.historicalServiceId,uuid(1));assert.match(h.document.getElementById('services-history-page').textContent,/Página 1 de 1/);
 for(const query of ['Cliente 2','Origen 2','Conductor de prueba']){h.search(query);assert.ok(h.cards().length>0,query);}
 h.search('no such record');assert.match(h.hp.textContent,/No hay servicios cerrados/);assert.equal(h.document.getElementById('services-history-next').disabled,true);
});
test('returning to the operational list preserves original DOM, search, filter and pagination',async()=>{
 const h=history();await h.show();const root=h.panel(),search=root.querySelector('[data-operational-search]');search.value='SRV';search.oninput({target:search});root.querySelector('[data-operational-next]').onclick();const before=root.innerHTML;
 h.toggle();h.search('SRV-000004');h.toggle();assert.equal(h.panel(),root);assert.equal(root.hidden,false);assert.equal(h.hp.hidden,true);assert.equal(root.innerHTML,before);assert.equal(search.value,'SRV');
});
test('historical detail uses the existing UUID modal and lazy 0049 chronology; closed actions stay hidden',async()=>{
 const h=history();h.tables.service_status_history=[{id:uuid(800),service_id:uuid(4),from_status:'in_progress',to_status:'completed',changed_at:'2026-11-10T10:00:00Z'}];await h.show();h.toggle();
 const card=h.hp.querySelector(`[data-historical-service-id="${uuid(4)}"]`);h.click(card.querySelector('button'));await settle();await settle();
 const modal=h.document.getElementById('service-summary-modal');assert.equal(modal.hidden,false);assert.equal(modal.dataset.serviceId,uuid(4));assert.equal(h.document.getElementById('summary-service-number').textContent,'SRV-000004');
 for(const key of ['assign','reassign','edit','cancel-service'])assert.equal(h.document.getElementById('service-detail-'+key).hidden,true);
 const section=h.document.getElementById('service-operational-history');section.open=true;section.dispatchEvent(new h.window.Event('toggle'));await settle();await settle();assert.match(h.document.getElementById('service-operational-history-content').textContent,/Completado/);
});
test('completed pending close is not resolved; cancelled cards infer neither debt nor closure',async()=>{
 const h=history();let calls=0;h.window.ElaraFinancialClose.context=async id=>{calls++;return {service_id:id,financial_close:'pending',no_charge:false};};await h.show();assert.equal(calls,5);h.toggle();assert.equal(calls,5);
 const completed=h.hp.querySelector(`[data-historical-service-id="${uuid(4)}"]`),cancelled=h.hp.querySelector(`[data-historical-service-id="${uuid(5)}"]`);
 assert.match(completed.textContent,/Cierre financiero pendiente/);assert.match(cancelled.textContent,/no evaluado para este estado/);assert.doesNotMatch(cancelled.textContent,/deuda|resuelto/);
});
test('empty, loading and failed reads remain distinct; a failed refresh never displays old history',async()=>{
 let release,block=true,fail=false;const h=history({beforeRead:async table=>{if(table==='v_admin_service_overview'){if(fail)throw Error('Read denied');if(block)await new Promise(r=>release=r);}}});
 const load=h.show();for(let i=0;i<10&&!release;i++)await settle();assert.match(h.panel().textContent,/Cargando/);assert.equal(h.document.getElementById('services-history-action').disabled,true);block=false;release();await load;h.toggle();assert.ok(h.cards().length);
 fail=true;await h.context.showOperationalServices({history:true});assert.equal(h.hp.hidden,true);assert.equal(h.cards().length,0);assert.ok(h.panel().querySelector('[role="alert"]'));
 const empty=history({rows:fixtureRows(3).map(r=>({...r,operational_status:'pending'}))});await empty.show();empty.toggle();assert.match(empty.hp.textContent,/No hay servicios cerrados/);assert.equal(empty.hp.querySelector('[role="alert"]'),null);
});
test('refresh retries safe reads and reopens history only for the current view/session',async()=>{
 const h=history();await h.show();h.toggle();h.tables.v_admin_service_overview=[];h.tables.services=[];await h.context.showOperationalServices({history:true});assert.equal(h.hp.hidden,false);assert.equal(h.cards().length,0);assert.match(h.hp.textContent,/No hay servicios cerrados/);
});
test('navigation/session changes invalidate history controls and pending refresh responses',async()=>{
 let release,block=false;const h=history({beforeRead:async table=>{if(block&&table==='v_admin_service_overview'){block=false;await new Promise(r=>release=r);}}});await h.show();h.toggle();block=true;const pending=h.context.showOperationalServices({history:true});for(let i=0;i<10&&!release;i++)await settle();
 h.document.getElementById('servicios').hidden=true;h.op.reset();release();await pending;assert.equal(h.hp.hidden,true);assert.equal(h.cards().length,0);
 const other=history();await other.show();other.toggle();other.window.ElaraAuth.getCurrentUser=()=>({id:uuid(999)});other.window.dispatchEvent(new other.window.Event('elara:auth-session-updated'));assert.equal(other.hp.hidden,true);assert.equal(other.cards().length,0);const count=other.calls.length;other.toggle();assert.equal(other.calls.length,count);
});
test('repeat mode switches keep unique ids, a single detail handler and original search node',async()=>{
 const h=history();await h.show();const search=h.document.getElementById('services-history-search');for(let i=0;i<4;i++){h.toggle();h.toggle();}h.toggle();assert.equal(h.document.getElementById('services-history-search'),search);
 const ids=[...h.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);let count=0;const original=h.context.openOperationalServiceDetail;h.context.openOperationalServiceDetail=(...args)=>{count++;return original(...args);};h.click(h.hp.querySelector('[data-history-service-detail]'));await settle();await settle();assert.equal(count,1);
});
test('history search and mode changes invalidate pending details and hostile fields are escaped',async()=>{
 let release,block=false;const h=history({beforeRead:async table=>{if(block&&table==='service_passengers'){block=false;await new Promise(r=>release=r);}}});h.tables.v_admin_service_overview[3].customer_display_name='<img src=x onerror=bad()>';await h.show();h.toggle();assert.equal(h.hp.querySelector('img'),null);assert.match(h.hp.textContent,/<img/);
 block=true;h.click(h.hp.querySelector(`[data-history-service-detail="${uuid(4)}"]`));for(let i=0;i<10&&!release;i++)await settle();h.search('SRV-000005');release();await settle();await settle();assert.equal(h.document.getElementById('service-summary-modal').hidden,true);
});
test('nonadministrative context cannot load or activate history',async()=>{
 const h=history();h.window.ElaraAuth.getActiveContext=()=> 'conductor';await h.show();assert.equal(h.calls.length,0);assert.equal(h.document.getElementById('services-history-action').hidden,true);h.toggle();assert.equal(h.hp.hidden,true);assert.equal(h.cards().length,0);
});
