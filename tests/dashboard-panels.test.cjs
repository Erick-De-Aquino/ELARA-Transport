// Isolated DOM + in-memory transport fixtures only. No real Supabase requests or writes.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {setup,fixtureRows,uuid,settle}=require('./services-presentation-harness.cjs');
const incidentId=uuid(800),categoryId=uuid(801);
function panels(options={}) {
 const h=setup(options);h.context.Date=class extends Date{constructor(...args){super(...(args.length?args:['2026-11-10T09:00:00Z']));}};
 h.window.ElaraDashboardMock=new Proxy({}, {get(){throw Error('Legacy Dashboard data accessed');}});
 h.tables.incidents=[{id:incidentId,human_code:'INC-000001',category_id:categoryId,title:'Revisar servicio',description:'Descripción real equivalente',severity:'high',status:'open',reported_at:'2026-11-10T08:00:00Z',service_id:uuid(1),driver_id:uuid(600),vehicle_id:uuid(700),reported_by_driver_id:uuid(600)}];
 h.tables.incident_categories=[{id:categoryId,name_es:'Operativa',requires_resolution:true}];
 h.tables.incident_events=[{id:uuid(802),incident_id:incidentId,event_type:'incident_created',occurred_at:'2026-11-10T08:00:00Z'}];
 h.tables.incident_comments=[{id:uuid(803),incident_id:incidentId,content:'Comentario interno',is_private:true,created_at:'2026-11-10T08:01:00Z'}];
 h.tables.service_status_history=[{id:uuid(804),service_id:uuid(1),from_status:'pending',to_status:'confirmed',changed_at:'2026-11-10T08:30:00Z'}];
 h.tables.app_users=[];h.writes=[];h.routes=[];
 h.window.ElaraRouter={navigateTo:route=>h.routes.push(route)};
 h.window.ElaraSupabase.client.rpc=async(name,args)=>{h.writes.push({name,args:JSON.parse(JSON.stringify(args))});
  if(h.rpc)return h.rpc(name,args);
  const target={acknowledge_incident:'acknowledged',investigate_incident:'investigating',resolve_incident:'resolved',cancel_incident:'cancelled'}[name];
  h.tables.incidents[0]={...h.tables.incidents[0],status:target,resolution_summary:args.p_resolution_summary||args.p_reason};
  return {data:incidentId,error:null};};
 vm.runInContext(fs.readFileSync('src/js/dashboard.js','utf8'),h.context);
 h.activate=id=>{for(const v of h.document.querySelectorAll('.view'))v.hidden=v.id!==id;};h.activate('dashboard');
 h.load=async()=>{await h.context.showOperationalDashboard();await settle();await settle();};
 h.open=()=>h.context.openOperationalIncident(incidentId);
 h.text=id=>h.document.getElementById(id).textContent;
 h.select=(target,note='')=>{Object.defineProperty(h.document.getElementById('admin-incident-status-select'),'value',{value:target,configurable:true});h.document.getElementById('admin-incident-resolution-note').value=note;};
 h.submit=()=>h.context.submitOperationalIncident({preventDefault(){}});
 h.alerts=(rows,date)=>{h.context.alertRows=rows;h.context.alertNow=date;return vm.runInContext('operationalDashboardAlerts(alertRows,new Date(alertNow))',h.context);};
 return h;
}

test('alerts separate no assignment, pending acceptance, and time exceeded with a rolling 24h limit',()=>{
 const h=panels(),rows=fixtureRows(7).map(r=>({...r,operational_status:'pending',current_assignment_id:null,scheduled_start_at:'2026-11-11T09:00:00Z'}));
 rows[1].scheduled_start_at='2026-11-11T09:00:00.001Z';rows[2].scheduled_start_at='2026-11-10T08:59:00Z';
 Object.assign(rows[3],{current_assignment_id:uuid(20),assignment_status:'pending_acceptance'});rows[4].operational_status='in_progress';rows[5].scheduled_start_at='bad';rows[6].operational_status='cancelled';
 const before=JSON.stringify(rows),a=h.alerts(rows,'2026-11-10T09:00:00Z');assert.deepEqual(Array.from(a,x=>x.kind),['not_started','unassigned','acceptance']);assert.equal(JSON.stringify(rows),before);
 // 24 elapsed hours across the Madrid spring DST boundary, independent of host timezone.
 rows[0].scheduled_start_at='2026-03-29T12:00:00Z';assert.equal(h.alerts([rows[0]],'2026-03-28T12:00:00Z').length,1);
});

test('panels reuse the overview once; details are lazy, labels factual, UUID action preserved',async()=>{
 const h=panels();await h.load();assert.equal(h.calls.filter(c=>c.table==='v_admin_service_overview').length,1);
 assert.equal(h.calls.filter(c=>['incident_events','incident_comments'].includes(c.table)).length,0);
 assert.match(h.text('incidents-list'),/INC-000001/);assert.match(h.text('incidents-list'),/Alta/);assert.match(h.text('recent-activity-list'),/Pendiente → Confirmado/);
 assert.doesNotMatch(h.text('recent-activity-list'),/aceptó|Creado|Rechazado/);assert.equal(h.text('recent-activity-heading'),'Actividad de servicios');
 const button=h.document.querySelector('#alerts-list [data-service-id]');assert.ok(button);h.click(button);assert.deepEqual(h.routes,['servicios']);
});

test('detail reuses the modal, loads scoped events/comments and offers only actual transitions',async()=>{
 const h=panels();await h.load();await h.open();assert.match(h.text('admin-incident-operational-events'),/Comentario interno/);
 for(const table of ['incident_events','incident_comments']){const calls=h.calls.filter(c=>c.table===table);assert.equal(calls.length,1);assert.equal(calls[0].column,'incident_id');assert.deepEqual(Array.from(calls[0].ids),[incidentId]);}
 const options=[...h.document.querySelectorAll('#admin-incident-status-select option')].map(e=>e.value);
 assert.deepEqual(options,['','acknowledged','investigating','resolved','cancelled']);assert.match(h.text('admin-incident-service'),/SRV-000001/);assert.equal(h.text('admin-incident-vehicle'),'1234-BCD');
});

for(const [target,rpc,args] of [['acknowledged','acknowledge_incident',{}],['investigating','investigate_incident',{}],['resolved','resolve_incident',{p_resolution_summary:'Resuelto'}],['cancelled','cancel_incident',{p_reason:'Resuelto'}]])test(`administrative ${target} uses exact RPC and confirms by a fresh read`,async()=>{
 const h=panels();await h.load();await h.open();h.select(target,'Resuelto');await h.submit();
 assert.deepEqual(h.writes,[{name:rpc,args:{p_incident_id:incidentId,...args}}]);assert.equal(h.document.getElementById('admin-incident-detail-modal').hidden,true);
 if(['resolved','cancelled'].includes(target)){assert.doesNotMatch(h.text('incidents-list'),/INC-000001/);assert.match(h.text('incidents-history-list'),/INC-000001/);}
});

test('required summaries, cancellation reason, terminal states and invalid transitions prevent writes',async()=>{
 const h=panels();await h.load();await h.open();
 for(const action of ['resolved','cancelled','open']){h.select(action);await h.submit();}assert.equal(h.writes.length,0);
 h.tables.incidents[0].status='resolved';await h.open();assert.equal(h.document.getElementById('admin-incident-manage-action').hidden,true);h.select('open');await h.submit();assert.equal(h.writes.length,0);
});

test('fresh category and state checks block stale modal decisions before RPC',async()=>{
 const h=panels();h.tables.incident_categories[0].requires_resolution=false;await h.load();await h.open();
 h.tables.incident_categories[0].requires_resolution=true;h.select('resolved');await h.submit();assert.equal(h.writes.length,0);
 h.tables.incidents[0].status='investigating';h.select('acknowledged');await h.submit();assert.equal(h.writes.length,0);
});

test('double submit is blocked and uncertain transport cannot be repeated by reopening',async()=>{
 const h=panels();await h.load();await h.open();let release;h.rpc=()=>new Promise(r=>release=r);h.select('resolved','Resuelto');
 const first=h.submit();for(let i=0;i<10&&!release;i++)await settle();await h.submit();assert.equal(h.writes.length,1);
 release({data:null,error:{message:'Transport lost'}});await first;assert.match(h.text('admin-incident-management-error'),/No reintentes/);
 await h.open();h.select('resolved','Resuelto');await h.submit();assert.equal(h.writes.length,1);assert.equal(h.document.querySelector('#admin-incident-management-form [type="submit"]').disabled,true);
});

test('thrown transport and malformed success are uncertain; coded rejection permits a deliberate retry',async()=>{
 for(const mode of ['throw','malformed','coded']){
  const h=panels();await h.load();await h.open();h.rpc=async()=>{if(mode==='throw')throw Error('Network');return mode==='malformed'?{data:null,error:null}:{data:null,error:{message:'Denied',code:'42501'}};};
  h.select('investigating');await h.submit();assert.equal(h.document.querySelector('#admin-incident-management-form [type="submit"]').disabled,mode!=='coded');assert.equal(h.writes.length,1);
 }
});

test('QA incidents and history outside visible operational services are excluded',async()=>{
 const h=panels();h.tables.incidents.push({...h.tables.incidents[0],id:uuid(820),human_code:'INC-QA',internal_notes:'qa_run=isolated;'});
 h.tables.incidents.push({...h.tables.incidents[0],id:uuid(821),human_code:'INC-OTHER',service_id:uuid(9999)});
 h.tables.service_status_history.push({...h.tables.service_status_history[0],id:uuid(822),service_id:uuid(9999),to_status:'cancelled'});
 await h.load();assert.doesNotMatch(h.text('incidents-list'),/INC-QA|INC-OTHER/);assert.doesNotMatch(h.text('recent-activity-list'),/Cancelado/);
});

test('errors remain distinct from successful empty reads and the core Dashboard still works',async()=>{
 const h=panels({beforeRead:async table=>{if(['incidents','service_status_history'].includes(table))throw Error('Unavailable');}});await h.load();
 assert.match(h.text('incidents-list'),/No se pudieron/);assert.match(h.text('recent-activity-list'),/No se pudo/);assert.ok(h.document.querySelector('#summary-cards strong'));assert.equal(h.document.querySelector('#incidents-list [role="alert"]').tagName,'LI');
 const empty=panels({rows:[]});empty.tables.incidents=[];empty.tables.incident_categories=[];await empty.load();assert.match(empty.text('incidents-list'),/Sin incidencias/);assert.match(empty.text('recent-activity-list'),/Cobertura parcial/);assert.match(empty.text('alerts-list'),/Sin alertas/);
});

test('late incident list/detail responses cannot repopulate another view or a changed session',async()=>{
 let release,block=false;const h=panels({beforeRead:async table=>{if(block&&table==='incident_comments'){block=false;await new Promise(r=>release=r);}}});await h.load();block=true;const pending=h.open();for(let i=0;i<10&&!release;i++)await settle();
 h.window.ElaraAuth.getCurrentUser=()=>({id:uuid(999),appSessionId:'other'});h.window.dispatchEvent(new h.window.Event('elara:auth-session-updated'));release();await pending;
 assert.equal(h.document.getElementById('admin-incident-detail-modal').hidden,true);h.select('resolved','Resuelto');await h.submit();assert.equal(h.writes.length,0);
});

test('repeated navigation and history/detail closes do not duplicate ids or administrative handlers',async()=>{
 const h=panels();for(let i=0;i<3;i++){await h.load();h.click(h.document.getElementById('incidents-history-action'));assert.equal(h.document.getElementById('admin-incident-history-modal').hidden,false);h.click(h.document.querySelector('#admin-incident-history-modal [data-modal-close]'));await h.open();h.click(h.document.querySelector('#admin-incident-detail-modal [data-modal-close]'));}
 const ids=[...h.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);
 await h.open();h.select('acknowledged');h.document.getElementById('admin-incident-management-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));for(let i=0;i<10&&!h.writes.length;i++)await settle();assert.equal(h.writes.length,1);
});

test('actor context and expired session stop writes; hostile user text is escaped',async()=>{
 const h=panels();h.tables.incidents[0].description='<img src=x onerror=bad()>';await h.load();await h.open();assert.equal(h.document.querySelector('#incidents-list img'),null);assert.equal(h.document.querySelector('#admin-incident-detail-modal img'),null);
 h.select('resolved','Resuelto');const load=h.op.loadIdentity;h.window.ElaraOperationalData={...h.op,loadIdentity:async()=>{throw Error('Session expired');}};await h.submit();assert.equal(h.writes.length,0);
 h.window.ElaraOperationalData={...h.op,loadIdentity:load};h.window.ElaraAuth.getActiveContext=()=> 'conductor';await h.submit();assert.equal(h.writes.length,0);
});

test('late list reads are discarded on navigation; panel errors never become empty results',async()=>{
 let release;const h=panels({beforeRead:async table=>{if(table==='incidents')await new Promise(r=>release=r);}});
 await h.context.showOperationalDashboard();for(let i=0;i<10&&!release;i++)await settle();h.activate('servicios');await h.show();release();await settle();await settle();
 assert.equal(h.document.querySelector('#dashboard [data-operational-incident]'),null);assert.equal(h.document.getElementById('incidents-history-action').hidden,true);
});

test('detail read errors disable management and closing pending reads prevents resurrection',async()=>{
 let block=false;const h=panels({beforeRead:async table=>{if(block&&table==='incident_events')throw Error('Denied');}});await h.load();block=true;await h.open();
 assert.match(h.text('admin-incident-operational-events'),/No se pudo cargar/);assert.equal(h.document.getElementById('admin-incident-manage-action').hidden,true);h.select('resolved','Nota');await h.submit();assert.equal(h.writes.length,0);
});

test('history search includes terminal incidents; display names use authorized user/person records',async()=>{
 const h=panels();h.tables.persons=[{id:uuid(810),first_name:'Operadora',last_name:'Real'}];h.tables.app_users=[{id:uuid(811),person_id:uuid(810)}];
 Object.assign(h.tables.incidents[0],{reported_by_user_id:uuid(811),reported_by_driver_id:null,status:'cancelled',cancelled_at:'2026-11-10T08:30:00Z'});
 await h.load();assert.match(h.text('incidents-history-list'),/Operadora Real/);assert.match(h.text('incidents-history-list'),/Cancelada/);
 const search=h.document.getElementById('incidents-history-search');search.value='not present';search.dispatchEvent(new h.window.Event('input',{bubbles:true}));assert.doesNotMatch(h.text('incidents-history-list'),/INC-000001/);
});

test('duplicate detail opens share in-flight reads, and a stale successful write cannot refresh another view',async()=>{
 let release,block=false;const h=panels({beforeRead:async table=>{if(block&&table==='incident_comments'){block=false;await new Promise(r=>release=r);}}});await h.load();block=true;
 const a=h.open(),b=h.open();for(let i=0;i<10&&!release;i++)await settle();release();await Promise.all([a,b]);assert.equal(h.calls.filter(c=>c.table==='incident_comments').length,1);
 let confirm;h.rpc=()=>new Promise(r=>confirm=r);h.select('investigating');const write=h.submit();for(let i=0;i<10&&!confirm;i++)await settle();h.activate('servicios');await h.show();const count=h.calls.length;confirm({data:incidentId,error:null});await write;assert.equal(h.calls.length,count);assert.equal(h.document.getElementById('admin-incident-detail-modal').hidden,true);
});
