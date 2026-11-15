const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {setup,fixtureRows,uuid,settle}=require('./services-presentation-harness.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const shown=h=>h.panel().querySelectorAll('[data-operational-service-id]').length;
const resources=h=>h.calls.map(c=>c.table);

test('Services reads only its six QA ancestors, overview and batched routes',async()=>{
 const h=setup();await h.show();assert.equal(shown(h),25);
 for(const table of ['persons','companies','customers','drivers','vehicles','services','v_admin_service_overview','service_locations'])assert.equal(resources(h).filter(t=>t===table).length,1,table);
 for(const table of ['cash_accounts','cash_counts','cash_discrepancies','service_assignments'])assert.ok(!resources(h).includes(table),table);
});
test('overview overlaps fresh QA; routes and financial contexts overlap only after QA is ready',async()=>{
 const identity=deferred(),identityStarted=deferred(),route=deferred(),routeStarted=deferred();let overview=false,finances=0;
 const h=setup({beforeRead:async table=>{if(table==='persons'){identityStarted.resolve();await identity.promise;}if(table==='v_admin_service_overview')overview=true;if(table==='service_locations'){routeStarted.resolve();await route.promise;}}});
 h.window.ElaraFinancialClose.context=async()=>{finances++;return {financial_close:'pending'};};
 const running=h.show();await identityStarted.promise;await settle();assert.equal(overview,true);assert.equal(finances,0);assert.ok(!resources(h).includes('service_locations'));
 identity.resolve();await routeStarted.promise;await settle();assert.equal(finances,5);assert.equal(shown(h),0);route.resolve();await running;assert.equal(shown(h),25);
});
for(const parent of ['persons','companies','customers','drivers','vehicles','services'])test(`fresh ${parent} QA still excludes its descendant service before routes/finance`,async()=>{
 const rows=[{...fixtureRows(2)[1],operational_status:'completed'}],h=setup({rows});
 h.tables.persons=[{id:uuid(901)}];h.tables.drivers[0].person_id=uuid(901);h.tables.companies=[{id:uuid(902)}];h.tables.customers[0].company_id=uuid(902);
 h.tables[parent][0]={...h.tables[parent][0],metadata:{qa_fixture:true}};let finances=0;h.window.ElaraFinancialClose.context=async()=>{finances++;return {financial_close:'resolved'};};await h.show();assert.equal(shown(h),0);assert.equal(finances,0);assert.ok(!resources(h).includes('service_locations'));
});
test('module dependencies preserve generic presentation; finance keeps the complete safety graph',async()=>{
 for(const [view,tables] of Object.entries({clientes:['persons','companies','customers'],colaboradores:['persons','drivers'],vehiculos:['vehicles'],dashboard:['persons','companies','customers','drivers','vehicles','services'],caja:['persons','companies','customers','drivers','vehicles','cash_accounts','services','service_assignments','cash_counts','cash_discrepancies']})){
  const h=setup();for(const v of h.document.querySelectorAll('.view'))v.hidden=v.id!==view;
  await h.op.show(view,{title:view,load:async()=>[],columns:[['ID','id']]});assert.deepEqual([...resources(h)].sort(),[...tables].sort(),view);assert.equal(h.document.querySelector(`#${view} [data-operational-panel]`).className,'panel');
 }
});
test('identical in-flight reads return the same Promise; filters and order key stay distinct',async()=>{
 const gate=deferred(),h=setup({beforeRead:async table=>{if(table==='services')await gate.promise;}});
 const a=h.op.readAll('services'),b=h.op.readAll('services');assert.equal(a,b);
 const scoped=h.op.readAll('services','id',{column:'id',values:[uuid(2),uuid(1)]});assert.equal(scoped,h.op.readAll('services','id',{column:'id',values:[uuid(1),uuid(2)]}));
 assert.notEqual(scoped,h.op.readAll('services','id',{column:'id',values:[uuid(3)]}));gate.resolve();await Promise.all([a,b,scoped]);assert.equal(resources(h).filter(t=>t==='services').length,3);
});
test('read deduplication distinguishes RPC pagination and parameters',async()=>{
 const gate=deferred(),h=setup();let count=0;const read=()=>{count++;return gate.promise;};
 const a=h.op.shareRead('read-rpc',{offset:0,limit:100,filter:'a'},read);assert.equal(a,h.op.shareRead('read-rpc',{filter:'a',limit:100,offset:0},read));
 const b=h.op.shareRead('read-rpc',{offset:100,limit:100,filter:'a'},read),c=h.op.shareRead('read-rpc',{offset:0,limit:100,filter:'b'},read);assert.notEqual(a,b);assert.notEqual(a,c);await settle();assert.equal(count,3);gate.resolve([]);await Promise.all([a,b,c]);
});
for(const change of ['actor','context','session'])test(`${change} change invalidates pending reads and indexed QA`,async()=>{
 const gate=deferred(),started=deferred();let first=true;const h=setup({beforeRead:async table=>{if(table==='services'&&first){first=false;started.resolve();await gate.promise;}}});
 let user={id:uuid(900),appSessionId:uuid(910)},context='administrativo';h.window.ElaraAuth.getCurrentUser=()=>user;h.window.ElaraAuth.getActiveContext=()=>context;
 const old=h.op.readAll('services');const rejected=assert.rejects(old);await started.promise;h.op.indexRecords({rows:[{id:uuid(999),metadata:{qa_fixture:true}}]});
 if(change==='actor')user={...user,id:uuid(901)};if(change==='session')user={...user,appSessionId:uuid(911)};if(change==='context')context='superadmin';
 const fresh=h.op.readAll('services');assert.notEqual(old,fresh);await fresh;assert.equal(h.op.isOperationalRecord({id:uuid(999)}),true);gate.resolve();await rejected;
});
test('settled QA/business reads are revalidated, including changes from another operator',async()=>{
 const h=setup({rows:fixtureRows(1)});await h.show();assert.equal(shown(h),1);h.tables.services[0].notes='qa_run=external-change;';await h.show();assert.equal(shown(h),0);assert.equal(resources(h).filter(t=>t==='services').length,2);
});
test('simultaneous full identity consumers share reads, but write/detail revalidation stays fresh',async()=>{
 const h=setup(),a=h.op.loadIdentity(),b=h.op.loadIdentity();assert.equal(a,b);await Promise.all([a,b]);assert.equal(h.calls.length,10);await h.op.loadIdentity();assert.equal(h.calls.length,20);
});
test('reset stops obsolete pagination before issuing another HTTP page',async()=>{
 const gate=deferred(),started=deferred(),h=setup();let calls=0;
 h.window.ElaraSupabase.client={from(){return {select(){return this;},order(){return this;},async range(offset){calls++;started.resolve();await gate.promise;return {data:[{id:String(offset)}],count:2};}};}};
 const old=h.op.readAll('pages'),rejected=assert.rejects(old);await started.promise;h.op.reset();gate.resolve();await rejected;assert.equal(calls,1);
});
test('financial contexts are not retained across navigations and use the existing wrapper',async()=>{
 const rows=[{...fixtureRows(1)[0],operational_status:'completed'}],h=setup({rows});let count=0;
 h.window.ElaraFinancialClose.context=async id=>{assert.equal(id,rows[0].service_id);return {financial_close:++count===1?'pending':'resolved'};};await h.show();assert.match(h.panel().textContent,/Cierre financiero pendiente/);await h.show();assert.match(h.panel().textContent,/Cierre financiero resuelto/);assert.equal(count,2);
});
test('production loader adds neither persisted data cache nor legacy initialization',()=>{
 const op=fs.readFileSync('src/js/operational-data.js','utf8');assert.doesNotMatch(op,/localStorage|sessionStorage/);
 const services=fs.readFileSync('src/js/services.js','utf8');assert.match(services,/function initServices\(\)\s*\{[^}]*return;/);assert.match(services,/window\.ElaraFinancialClose\.context\(row\.service_id\)/);
});
