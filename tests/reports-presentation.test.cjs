const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,fixture,uuid,settle}=require('./reports-presentation-harness.cjs');
const values=h=>[...h.document.querySelectorAll('#reports-summary strong')].map(e=>e.textContent);
test('Reports startup is empty, ignores historical providers and binds once; only Superadmin may read',async()=>{
 const h=setup();h.api.initReports();h.api.initReports();assert.equal(h.calls.length,0);assert.equal(h.document.querySelectorAll('#reports-summary .summary-card').length,0);await h.show();assert.equal(h.document.querySelectorAll('#reports-summary .summary-card').length,4);assert.equal(h.document.querySelectorAll('[data-report-tab]').length,2);
 for(const role of ['administrativo','conductor','']){const q=setup({role});await q.show();assert.equal(q.calls.length,0);assert.equal(q.document.getElementById('reportes').hidden,true);}
});
test('four KPIs use completed receipts, approved recorded expenses and only terminal service events',async()=>{
 const h=setup();h.tables.services[0].deleted_at=h.tables.services[0].created_at;await h.show();assert.deepEqual(values(h),['0,30 EUR','20,30 EUR','1','25 %']);assert.match(h.document.getElementById('report-blocks').textContent,/no equivale a pagos/);assert.equal(h.instances.length,3);
 const economic=h.instances[0].config.data.datasets;assert.deepEqual(Array.from(economic[0].data),[0.3]);assert.deepEqual(Array.from(economic[1].data),[20.3]);
});
test('Madrid boundaries include DST and local midnight; rolling periods and custom validation are explicit',()=>{
 const m=setup().math;assert.equal(m.day('2026-03-31T22:00:00Z'),'2026-04-01');assert.equal(m.day('2026-10-31T23:00:00Z'),'2026-11-01');assert.equal(m.day('2026-02-30'),null);assert.equal(m.day(null),null);
 assert.deepEqual({...m.period('3',null,new Date('2026-01-10T00:00:00Z'))},{from:'2025-11-01',to:'2026-01-31'});assert.deepEqual({...m.period('12',null,new Date('2026-11-19T00:00:00Z'))},{from:'2025-12-01',to:'2026-11-30'});assert.throws(()=>m.period('custom',{from:'2026-02-30',to:'2026-03-01'}));assert.throws(()=>m.period('custom',{from:'2026-03-01',to:'2026-02-01'}));
});
test('precision and currency totals remain separate; charts use labelled independent currency axes',async()=>{
 const h=setup();h.tables.service_payments.push({...h.tables.service_payments[0],id:uuid(950),amount:'10.15',currency_code:'USD',service_id:uuid(2),service_financial_id:uuid(801)});h.tables.service_financials[1].currency_code='USD';await h.show();assert.equal(values(h)[0],'0,30 EUR · 10,15 USD');assert.equal(Object.keys(h.instances[0].config.options.scales).length,2);assert.equal(h.math.money(h.math.totals([{amount:'999999999999.99',currency_code:'EUR'},{amount:'0.01',currency_code:'EUR'}],'amount')),'1.000.000.000.000,00 EUR');assert.equal(h.math.minor('0.001'),null);
});
test('payments without a verified financial relation, missing amounts or missing dates are unavailable',async()=>{
 for(const mutation of [t=>t.service_payments[0].service_financial_id='missing',t=>t.service_payments[0].amount=null,t=>t.service_payments[0].paid_at=null]){const h=setup();mutation(h.tables);await h.show();assert.equal(values(h)[0],'No disponible');}
});
test('zero activity is honest, no future/pending services affect the rate, and absent terminal dates are unavailable',async()=>{
 const h=setup();for(const key of ['services','service_closures','service_status_history','service_payments','service_financials','get_admin_expenses'])h.tables[key]=[];await h.show();assert.deepEqual(values(h),['0','0','0','Sin cierres']);
 const q=setup();q.tables.services[4].scheduled_start_at='2099-01-01T00:00:00Z';await q.show();assert.equal(values(q)[3],'25 %');q.tables.service_closures=[];q.tables.service_status_history=[];await q.show();assert.equal(values(q)[2],'No disponible');assert.equal(values(q)[3],'No disponible');
});
test('repeated identical history never multiplies a service; conflicting history is not presented as a valid total',async()=>{
 const h=setup();h.tables.service_status_history.push({...h.tables.service_status_history[0],id:uuid(799)});await h.show();assert.equal(values(h)[2],'1');h.tables.service_status_history.push({...h.tables.service_status_history[0],id:uuid(798),to_status:'cancelled'});await h.show();assert.equal(values(h)[2],'No disponible');
});
test('denied, partial or unstable paged reads never become apparently complete totals',async()=>{
 let fail='service_payments';const h=setup({beforeRead:table=>{if(table===fail)throw Error('isolated read failure');}});await h.show();assert.equal(values(h)[0],'No disponible');assert.equal(values(h)[2],'1');fail='persons';await h.show();assert.equal(values(h)[0],'No disponible');assert.equal(values(h)[1],'No disponible');
});
test('role, account and navigation changes discard late reads and destroy existing charts',async()=>{
 for(const change of [h=>h.role('administrativo'),h=>h.actor(uuid(9998)),h=>{h.document.getElementById('reportes').hidden=true;}]){
  let release;const gate=new Promise(r=>release=r),h=setup({beforeRead:async table=>{if(table==='service_payments')await gate;}});const loading=h.show();await settle();change(h);release();await loading;await settle();assert.equal(h.document.querySelectorAll('#reports-summary strong').length,0);
 }
 const h=setup();await h.show();h.role('conductor');await settle();assert.equal(h.instances.every(c=>c.destroyed),true);assert.equal(h.document.getElementById('reportes').hidden,true);
});
test('filters are shared between sections without repeated summary reads; invalid custom dates clear stale results',async()=>{
 const h=setup();await h.show();const calls=h.calls.length;h.change('[name=reports-period][value="3"]','3');h.click(h.document.querySelector('[data-report-tab=detail]'));await settle();assert.equal(h.calls.length,calls);assert.match(h.document.getElementById('reports-entity-result').textContent,/Selecciona una entidad/);h.click(h.document.querySelector('[data-report-tab=general]'));assert.equal(h.calls.length,calls);assert.equal(h.document.querySelectorAll('.report-chart-card').length,3);
 h.change('[name=reports-period][value=custom]','custom');h.change('[name=reports-from]','2026-12-31');h.change('[name=reports-to]','2026-01-01');assert.equal(h.document.querySelectorAll('#reports-summary strong').length,0);assert.match(h.document.getElementById('reports-status').textContent,/válido/);
});
test('driver analysis uses final assignment, stored participation and paid dates including older settlements',async()=>{
 const h=setup();h.tables.service_assignments.push({...h.tables.service_assignments[0],id:uuid(650),driver_id:uuid(401),assignment_status:'ended',ended_at:h.tables.service_assignments[0].assigned_at});await h.show();assert.equal(h.calls.some(c=>c.rpc==='get_admin_settlements'),false);await h.detail();const text=h.document.getElementById('reports-entity-result').textContent;assert.match(text,/Servicios realizados1/);assert.match(text,/Cancelados asociados1/);assert.match(text,/35,11 EUR/);assert.match(text,/45,11 EUR/);assert.match(text,/no participación del conductor/);assert.equal(h.calls.filter(c=>c.rpc==='get_admin_settlements').length,1);
 await h.detail('drivers',uuid(401));const other=h.document.getElementById('reports-entity-result').textContent;assert.match(other,/Servicios realizados0/);
});
test('customer analysis separates contracted value, receipts, recurrence and present debt, supporting company selection',async()=>{
 const h=setup();await h.show();await h.detail('customers',uuid(100));const text=h.document.getElementById('reports-entity-result').textContent;assert.match(text,/Servicios contratados3/);assert.match(text,/300,90 EUR/);assert.match(text,/0,30 EUR/);assert.match(text,/25,00 EUR/);assert.match(text,/La deuda es actual/);assert.match(text,/Días con contratación1/);
 h.change('[name=reports-entity]',uuid(101));for(let i=0;i<5;i++)await settle();assert.match(h.document.getElementById('reports-entity-result').textContent,/Servicios contratados2/);
});
test('unverified entity IDs do not trigger analysis; out-of-order entity replies cannot restore old detail',async()=>{
 const h=setup();await h.show();await h.detail('customers','forged');assert.equal(h.calls.some(c=>c.table==='v_admin_receivable_overview'),false);
 let release;const gate=new Promise(r=>release=r);const q=setup({beforeRead:async table=>{if(table==='v_admin_receivable_overview')await gate;}});await q.show();const detail=q.detail('customers',uuid(100));await settle();q.change('[name=reports-kind]','drivers');release();await detail;assert.match(q.document.getElementById('reports-entity-result').textContent,/Selecciona una entidad/);
});
test('ambiguous cancellation attribution or missing final prices is unavailable rather than guessed',async()=>{
 const h=setup();h.tables.service_status_history[1].assignment_id=null;h.tables.service_assignments.push({...h.tables.service_assignments[1],id:uuid(660),driver_id:uuid(401)});await h.show();await h.detail();assert.match(h.document.getElementById('reports-entity-result').textContent,/No disponible/);
 const q=setup();q.tables.service_financials[0].pricing_status='draft';await q.show();await q.detail('customers',uuid(100));assert.match(q.document.getElementById('reports-entity-result').textContent,/Importe definitivo de contratacionesNo disponible/);
});
test('chart modal uses the same real datasets; exports remain disabled and repeated openings replace charts',async()=>{
 const h=setup();await h.show();h.click(h.document.querySelector('[data-report-chart=economic]'));assert.equal(h.document.getElementById('report-chart-modal').hidden,false);assert.equal(h.instances.at(-1).config.data.datasets,h.instances[0].config.data.datasets);
 h.click(h.document.querySelector('[data-report-chart=operation]'));assert.equal(h.instances[3].destroyed,true);h.document.getElementById('primary-action').onclick();assert.equal(h.document.getElementById('export-report-modal').hidden,false);assert.equal([...h.document.querySelectorAll('#export-report-modal input,#export-report-modal select,#export-report-modal button:not([data-modal-close])')].every(e=>e.disabled),true);await h.show();assert.equal(h.document.querySelectorAll('[data-report-tab]').length,2);
});
test('QA and legacy parent identities are excluded before aggregating descendant payments and expenses',async()=>{
 const h=setup();h.tables.customers[0].notes='qa_run=local-reports';await h.show();assert.equal(values(h)[0],'0');assert.equal(values(h)[2],'0');assert.equal(h.instances.at(-1).config.data.datasets[0].data.reduce((a,b)=>a+b,0),2);
});

test('all table and RPC pages are included; a changing count is unavailable rather than a first-page total',async()=>{
 const h=setup();h.tables.service_payments=Array.from({length:501},(_,i)=>({...h.tables.service_payments[0],id:uuid(3000+i),amount:'0.10'}));h.tables.get_admin_expenses=Array.from({length:121},(_,i)=>({...h.tables.get_admin_expenses[0],expense_id:uuid(4000+i),amount:'0.20'}));await h.show();assert.equal(values(h)[0],'50,10 EUR');assert.equal(values(h)[1],'24,20 EUR');assert.ok(h.calls.some(c=>c.table==='service_payments'&&c.start===500));assert.ok(h.calls.some(c=>c.rpc==='get_admin_expenses'&&c.args.p_offset===100));
 let changed=false;const tables=fixture();tables.service_payments=Array.from({length:501},(_,i)=>({...tables.service_payments[0],id:uuid(5000+i)}));const q=setup({tables,beforeRead:t=>{if(t==='service_payments'&&!changed){changed=true;tables.service_payments.push({...tables.service_payments[0],id:uuid(6000)});}}});await q.show();assert.equal(values(q)[0],'No disponible');
});

test('period changes reuse selected detail reads while retaining its entity and do not reinterpret current debt',async()=>{
 const h=setup();await h.show();await h.detail('customers',uuid(100));const count=h.calls.length;h.change('[name=reports-period][value="3"]','3');for(let i=0;i<5;i++)await settle();assert.equal(h.calls.length,count);assert.equal(h.document.querySelector('[name=reports-entity]').value,uuid(100));assert.match(h.document.getElementById('reports-entity-result').textContent,/25,00 EUR/);
 await h.detail();const driverCalls=h.calls.length;h.change('[name=reports-period][value="6"]','6');for(let i=0;i<5;i++)await settle();assert.equal(h.calls.length,driverCalls);assert.match(h.document.getElementById('reports-entity-result').textContent,/35,11 EUR/);
});

test('payment, expense and terminal timestamps use their own Madrid date, never scheduled or registration dates',async()=>{
 const h=setup(),p={from:'2026-04-01',to:'2026-04-30'},data={services:h.tables.services,closures:h.tables.service_closures,history:h.tables.service_status_history,payments:h.tables.service_payments,financials:h.tables.service_financials,expenses:h.tables.get_admin_expenses};
 data.payments[0].paid_at='2026-03-31T22:00:00Z';data.payments[1].paid_at='2026-03-31T21:59:59Z';data.expenses[0].expense_date='2026-04-01';data.expenses[2].expense_date='2026-03-31';data.closures[0].closed_at='2026-03-31T22:00:00Z';data.services[0].scheduled_start_at='2025-01-01T00:00:00Z';
 const result=h.math.overview(data,p);assert.equal(h.math.money(result.income),'0,10 EUR');assert.equal(h.math.money(result.expenses),'10,10 EUR');assert.equal(result.completed,1);
});

test('settlement versions use stored amounts, while missing headers and mismatched payment currencies fail closed',async()=>{
 for(const version of [1,2]){const h=setup();h.tables.settlements[0].calculation_version=version;h.tables.settlements[0].cash_offset_amount='30.00';await h.show();await h.detail();assert.match(h.document.getElementById('reports-entity-result').textContent,/Participación registrada en liquidaciones vigentes35,11 EUR/);}
 for(const mutate of [h=>h.tables.settlements=[],h=>h.tables.settlement_payments[0].currency_code='USD']){const h=setup();mutate(h);await h.show();await h.detail();assert.match(h.document.getElementById('reports-entity-result').textContent,/No disponible/);}
});

test('both report modals close by button, backdrop and Escape, preserve interior clicks and restore focus without touching other dialogs',async()=>{
 const h=setup();await h.show();h.api.initReports();
 const focus=e=>{e.focus=()=>Object.defineProperty(h.document,'activeElement',{configurable:true,value:e});};
 const unrelated=h.document.getElementById('customer-detail-modal');unrelated.hidden=false;
 for(const id of ['export-report-modal','report-chart-modal']){
  const modal=h.document.getElementById(id),button=modal.querySelector('[data-modal-close]'),opener=id==='export-report-modal'?h.document.getElementById('primary-action'):h.document.querySelector('[data-report-chart=economic]');focus(opener);focus(button);
  const open=()=>id==='export-report-modal'?opener.onclick():h.click(opener);
  for(const method of ['button','backdrop','escape','button']){
   opener.focus();open();assert.equal(modal.hidden,false);assert.equal(h.document.activeElement,button);
   h.click(modal.querySelector('.modal__body'));assert.equal(modal.hidden,false);
   if(method==='button')h.click(button);else if(method==='backdrop')h.click(modal);else {const e=new h.window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(e,'key',{value:'Escape'});button.dispatchEvent(e);}
   assert.equal(modal.hidden,true);assert.equal(h.document.activeElement,opener);assert.equal(unrelated.hidden,false);
  }
  open();const e=new h.window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(e,'key',{value:'Tab'});button.dispatchEvent(e);assert.equal(e.defaultPrevented,true);assert.equal(h.document.activeElement,button);h.click(button);
 }
 assert.equal([...h.document.querySelectorAll('#export-report-modal input,#export-report-modal select,#export-report-modal button:not([data-modal-close])')].every(e=>e.disabled),true);
});

test('driver and customer tables reuse styled history table and scroll wrapper without changing rows or paging',async()=>{
 const h=setup();for(let i=0;i<30;i++)h.tables.services.push({...h.tables.services[4],id:uuid(7000+i),customer_id:uuid(100),human_code:'SRV-LONG-'+i});await h.show();await h.detail();assert.ok(h.document.querySelector('#reports-detail-table .report-history-table-wrapper .report-history-table'));assert.equal(h.document.querySelectorAll('#reports-detail-table tbody tr').length,2);
 await h.detail('customers',uuid(100));assert.equal(h.document.querySelectorAll('#reports-detail-table .report-history-table th[scope=col]').length,3);assert.equal(h.document.querySelectorAll('#reports-detail-table tbody tr').length,25);h.click(h.document.querySelector('[data-report-page="1"]'));assert.equal(h.document.querySelectorAll('#reports-detail-table tbody tr').length,8);h.click(h.document.querySelector('[data-report-page="-1"]'));assert.equal(h.document.querySelectorAll('#reports-detail-table tbody tr').length,25);
});
