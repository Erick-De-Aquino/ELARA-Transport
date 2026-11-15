const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {setup,fixtureRows,uuid,settle}=require('./services-presentation-harness.cjs');
const dashboardSource=fs.readFileSync('src/js/dashboard.js','utf8');
function dashboard(options={}) {
 const h=setup(options);let now='2026-11-10T09:00:00Z';
 h.context.Date=class extends Date {constructor(...args){super(...(args.length?args:[now]));}};
 h.window.ElaraDashboardMock=new Proxy({}, {get(){throw Error('Dashboard mock accessed');}});
 h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(900),appSessionId:uuid(901),name:'Operador real'});
 h.routes=[];h.window.ElaraRouter={navigateTo:route=>h.routes.push(route)};
 vm.runInContext(dashboardSource,h.context);
 h.activate=view=>{for(const v of h.document.querySelectorAll('.view'))v.hidden=v.id!==view;};h.activate('dashboard');
 h.dash=async()=>{const result=await h.context.showOperationalDashboard();await settle();return result;};h.dp=()=>h.document.querySelector('#dashboard [data-operational-panel]');
 h.model=(rows,date)=>{h.context.input=rows;h.context.clock=date;return vm.runInContext('operationalDashboardModel(input,new Date(clock))',h.context);};
 h.setNow=value=>now=value;
 return h;
}
test('five metrics distinguish service/assignment states and count the Madrid agenda without mutation',()=>{
 const h=dashboard(),rows=fixtureRows(9).map(r=>({...r,scheduled_start_at:'2026-07-10T23:00:00Z'}));
 Object.assign(rows[0],{operational_status:'pending',current_assignment_id:null});Object.assign(rows[1],{operational_status:'confirmed',assignment_status:'pending_acceptance'});
 for(const [i,state] of [[2,'completed'],[3,'cancelled'],[4,'no_show'],[5,'not_performed']])rows[i].operational_status=state;
 Object.assign(rows[6],{operational_status:'in_progress',scheduled_start_at:'2026-07-10T21:59:59Z'});
 Object.assign(rows[7],{operational_status:'confirmed',assignment_status:'accepted'});Object.assign(rows[8],{operational_status:'pending',scheduled_start_at:'invalid'});
 const before=JSON.stringify(rows),model=h.model(rows,'2026-07-10T22:30:00Z');assert.deepEqual(Array.from(model.metrics,m=>m[1]),[7,1,1,1,1]);assert.equal(JSON.stringify(rows),before);
});
test('Madrid day boundaries also work across daylight saving changes',()=>{
 const h=dashboard(),rows=fixtureRows(2);rows[0].scheduled_start_at='2026-03-28T23:30:00Z';rows[1].scheduled_start_at='2026-03-29T22:30:00Z';assert.equal(h.model(rows,'2026-03-29T01:30:00Z').metrics[0][1],1);
});
test('upcoming list selects four valid future pending/confirmed services in chronological order',()=>{
 const h=dashboard(),rows=fixtureRows(9).map((r,i)=>({...r,operational_status:i%2?'confirmed':'pending',scheduled_start_at:`2026-11-10T${String(10+i).padStart(2,'0')}:00:00Z`}));
 rows[0].scheduled_start_at='2026-11-10T08:59:59Z';rows[1].operational_status='completed';rows[2].scheduled_start_at='invalid';rows.reverse();assert.deepEqual(Array.from(h.model(rows,'2026-11-10T09:00:00Z').upcoming,r=>r.service_id),[uuid(4),uuid(5),uuid(6),uuid(7)]);
});
test('rich Dashboard reuses its original nodes, real identity and existing components once',async()=>{
 const h=dashboard(),summary=h.document.getElementById('summary-cards'),grid=h.document.querySelector('#dashboard .dashboard-grid');await h.dash();
 assert.equal(h.document.getElementById('summary-cards'),summary);assert.equal(h.dp().querySelector('.dashboard-grid'),grid);assert.equal(summary.children.length,5);assert.equal(grid.querySelectorAll('.service-item').length,4);assert.equal(h.document.getElementById('page-title').textContent,'Hola, Operador real');
 assert.ok(h.dp().querySelector('details table'));assert.equal(h.dp().querySelector('details').hasAttribute('open'),false);assert.equal(h.document.getElementById('incidents-history-action').hidden,false);
 assert.match(h.document.getElementById('alerts-list').textContent,/sin asignación actual/);assert.equal(h.document.getElementById('alerts-count').textContent,'3');assert.match(h.document.getElementById('incidents-list').textContent,/Sin incidencias administrativas abiertas/);assert.equal(grid.querySelector('canvas'),null);
});
test('QA in the underlying service excludes both metrics and upcoming cards',async()=>{
 const h=dashboard({rows:fixtureRows(1)});h.tables.services[0].notes='qa_run=isolated;';await h.dash();assert.equal(h.document.querySelector('#summary-cards strong').textContent,'0');assert.equal(h.dp().querySelectorAll('.service-item').length,0);assert.match(h.dp().textContent,/No hay próximos servicios/);
});
test('secondary table keeps search, filters and pagination without filtering headline metrics',async()=>{
 const h=dashboard();await h.dash();const p=h.dp();assert.equal(p.querySelectorAll('tbody tr').length,25);p.querySelector('[data-operational-next]').onclick();assert.equal(p.querySelectorAll('tbody tr').length,7);p.querySelector('[data-operational-search]').oninput({target:{value:'SRV-000032'}});assert.equal(p.querySelectorAll('tbody tr').length,1);assert.equal(h.document.querySelector('#summary-cards strong').textContent,'32');assert.ok(p.querySelector('[data-operational-filter]'));
});
test('repeated navigation/retry does not duplicate nodes, IDs or header actions',async()=>{
 const h=dashboard();for(let i=0;i<3;i++)await h.dash();await h.dp().querySelector('[data-operational-retry]').onclick();
 for(const id of ['summary-cards','alerts-list','upcoming-services','incidents-list','recent-activity-list'])assert.equal(h.document.querySelectorAll('#'+id).length,1,id);
 assert.equal(h.dp().querySelectorAll('details').length,1);h.click(h.document.getElementById('primary-action'));await settle();assert.deepEqual(h.actions,[['create',undefined]]);
});
test('upcoming click navigates with UUID and opens the original Services modal after load',async()=>{
 const h=dashboard();await h.dash();const button=h.dp().querySelector('[data-dashboard-operational-action="service"]'),id=button.dataset.serviceId;h.click(button);assert.deepEqual(h.routes,['servicios']);h.activate('servicios');await h.show();await settle();await settle();
 assert.equal(h.panel().querySelector('[data-operational-search]').value,id);assert.equal(h.panel().querySelectorAll('[data-operational-service-id]').length,1);assert.equal(h.panel().querySelector('[data-operational-service-id]').dataset.operationalServiceId,id);assert.equal(h.document.getElementById('service-summary-modal').hidden,false);assert.equal(h.document.getElementById('service-summary-modal').dataset.serviceId,id);
});
test('full-list control uses the router; header action becomes inert outside Dashboard',async()=>{
 const h=dashboard();await h.dash();h.click(h.dp().querySelector('[data-dashboard-operational-action="all"]'));assert.deepEqual(h.routes,['servicios']);h.activate('servicios');await h.show();h.click(h.document.getElementById('primary-action'));assert.equal(h.actions.length,0);
});
test('UUID navigation resolves services outside the first page and rejects malformed identities',async()=>{
 const h=dashboard();await h.dash();assert.equal(h.window.ElaraServices.navigateOperationalService('SRV-000032'),false);assert.equal(h.routes.length,0);
 assert.equal(h.window.ElaraServices.navigateOperationalService(uuid(32)),true);h.activate('servicios');await h.show();await settle();await settle();assert.equal(h.panel().querySelector('[data-operational-service-id]').dataset.operationalServiceId,uuid(32));assert.equal(h.document.getElementById('service-summary-modal').dataset.serviceId,uuid(32));assert.equal(h.document.getElementById('summary-service-number').textContent,'SRV-000032');
});
test('abandoned UUID navigation cannot open a service after returning to Dashboard',async()=>{
 let release,started;const ready=new Promise(r=>started=r);let blocked=false;
 const h=dashboard({beforeRead:async table=>{if(table==='v_admin_service_overview'&&blocked){blocked=false;started();await new Promise(r=>release=r);}}});await h.dash();h.window.ElaraServices.navigateOperationalService(uuid(2));h.activate('servicios');blocked=true;const old=h.show();await ready;h.activate('dashboard');await h.dash();release();await old;
 h.activate('servicios');await h.show();assert.equal(h.panel().querySelector('[data-operational-search]').value,'');assert.equal(h.panel().querySelector('[data-operational-detail-content]').textContent,'');
});
test('a confirmed administrative write refreshes the visible Dashboard once using fresh data',async()=>{
 const h=dashboard({rows:fixtureRows(1)});await h.dash();await h.dash();const calls=h.calls.length;
 h.tables.v_admin_service_overview=[];h.tables.services=[];h.window.dispatchEvent(new h.window.Event('elara:service-admin-confirmed'));await settle();assert.equal(h.calls.length-calls,9);assert.equal(h.document.querySelector('#summary-cards strong').textContent,'0');
 h.activate('servicios');const after=h.calls.length;h.window.dispatchEvent(new h.window.Event('elara:service-admin-confirmed'));await settle();assert.equal(h.calls.length,after);
});
test('empty Dashboard shows real zero metrics and explicit panel coverage',async()=>{
 const h=dashboard({rows:[]});await h.dash();assert.deepEqual([...h.dp().querySelectorAll('#summary-cards strong')].map(e=>e.textContent),['0','0','0','0','0']);assert.match(h.dp().textContent,/No hay próximos servicios/);assert.match(h.document.getElementById('recent-activity-list').textContent,/Cobertura parcial/);
});
test('read error keeps retry, hides the create button, and recovers without duplicate mounting',async()=>{
 let fail=true;const h=dashboard({beforeRead:async table=>{if(table==='v_admin_service_overview'&&fail)throw Error('Read unavailable');}});await h.dash();assert.ok(h.dp().querySelector('[role="alert"]'));assert.equal(h.document.getElementById('primary-action').hidden,true);fail=false;await h.dp().querySelector('button').onclick();assert.equal(h.dp().querySelectorAll('#summary-cards').length,1);
});
test('unauthorized context makes no read or administrative action',async()=>{
 const h=dashboard();h.window.ElaraAuth.getActiveContext=()=> 'conductor';await h.dash();assert.equal(h.calls.length,0);assert.ok(h.dp().querySelector('[role="alert"]'));h.click(h.document.getElementById('primary-action'));assert.equal(h.actions.length,0);
});
test('actor/session changes invalidate ready controls even before a new read starts',async()=>{
 const h=dashboard();await h.dash();h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(999),appSessionId:uuid(998),name:'Otro usuario'});h.click(h.document.getElementById('primary-action'));h.click(h.dp().querySelector('[data-dashboard-operational-action="service"]'));assert.equal(h.actions.length,0);assert.equal(h.routes.length,0);
});
for(const error of [false,true])test(`late Dashboard ${error?'error':'response'} cannot overwrite Services`,async()=>{
 let release,started;const ready=new Promise(r=>started=r);let first=true;const h=dashboard({beforeRead:async table=>{if(table==='v_admin_service_overview'&&first){first=false;started();await new Promise(r=>release=r);if(error)throw Error('Old failure');}}});const old=h.dash();await ready;h.activate('servicios');await h.show();const title=h.document.getElementById('page-title').textContent;release();await old;assert.equal(h.document.getElementById('page-title').textContent,title);assert.equal(h.panel().querySelectorAll('.operation-card').length,25);assert.equal(h.document.querySelectorAll('#dashboard [role="alert"]').length,0);
});
test('session reset prevents a late Dashboard response from mounting original nodes',async()=>{
 let release,started;const ready=new Promise(r=>started=r);const h=dashboard({beforeRead:async table=>{if(table==='v_admin_service_overview'){started();await new Promise(r=>release=r);}}});const old=h.dash();await ready;h.op.reset();release();await old;assert.equal(h.dp().textContent,'');h.click(h.document.getElementById('primary-action'));assert.equal(h.actions.length,0);
});
test('real remote text is escaped; Dashboard adds no financial calls or legacy reconciliation',async()=>{
 const rows=fixtureRows(2);rows[0].human_code='<script>bad()</script>';rows[0].customer_display_name='<img src=x onerror=bad()>';const h=dashboard({rows});let finance=0;h.window.ElaraFinancialClose.context=()=>{finance++;throw Error('Unexpected finance');};await h.dash();assert.equal(h.dp().querySelector('img,script'),null);assert.match(h.dp().textContent,/<img/);assert.equal(finance,0);assert.equal(h.calls.length,10);assert.equal(h.calls.filter(c=>c.table==='v_admin_service_overview').length,1);
});
