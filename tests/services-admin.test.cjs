const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'..');
const ids = {service:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',customer:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  driver:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',vehicle:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',assignment:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'};
const plain = value => JSON.parse(JSON.stringify(value));

function setup(overrides = {}, rpcHandler) {
  const tables = {
    services:[{id:ids.service,human_code:'SRV-TEST',operational_status:'pending',scheduled_start_at:'2026-10-20T10:00:00.000Z',notes:'original'}],
    customers:[{id:ids.customer,status:'active'}],drivers:[{id:ids.driver,administrative_status:'active'}],
    vehicles:[{id:ids.vehicle}],driver_vehicle_assignments:[{id:'link',driver_id:ids.driver,vehicle_id:ids.vehicle,status:'active'}],
    service_assignments:[],...overrides,
  };
  const calls = [], notices = [];
  const window = {ElaraServicesMock:{services:[]},ElaraAuth:{getActiveContext:()=> 'administrativo'},
    ElaraNotifications:{showToast:(...args)=>notices.push(args)},ElaraSupabase:{client:{rpc:async(name,args)=>{
      calls.push({name,args:plain(args)});
      return rpcHandler ? rpcHandler(name,args) : {data:name==='create_service'?[{service_id:ids.service,human_code:'SRV-TEST'}]:ids.assignment,error:null};
    }}}};
  const context = {window,document:{querySelectorAll:()=>[]},console,Intl,Set,Map};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root,'src/js/operational-data.js'),'utf8'),context);
  const real = window.ElaraOperationalData;
  real.indexRecords(tables);
  window.ElaraOperationalData = {...real,
    loadIdentity:async()=>tables,
    getCollection:name=>(tables[name]||[]).filter(real.isOperationalRecord),
    readAll:async name=>tables[name]||[],
    related:async(table,key,id)=>(tables[table]||[]).filter(r=>r[key]===id&&real.isOperationalRecord(r)),
    customerName:()=> 'Cliente operativo',personName:()=> 'Conductor operativo',
  };
  vm.runInContext(fs.readFileSync(path.join(root,'src/js/services.js'),'utf8'),context);
  return {api:window.ElaraServiceAdmin,window,context,tables,calls,notices};
}
const draft = {customerId:ids.customer,serviceType:'transfer',schedule:'2026-10-20T12:00:00+02:00',
  origin:'Origen',originAddress:'Calle A',destination:'Destino',destinationAddress:'Calle B',passenger:'Pasajero',phone:'+34000000000',notes:'Servicio aislado de validación'};

test('create uses exactly the existing RPC fields and preserves returned identity', async()=>{
  const {api,calls,tables,notices}=setup();const before=JSON.stringify(tables);
  const result=await api.execute('create',{...draft,price:99,internalNotes:'unsupported',driverId:ids.driver});
  assert.equal(calls[0].name,'create_service');
  assert.deepEqual(calls[0].args,{p_customer_id:ids.customer,p_service_type:'transfer',p_scheduled_start_at:'2026-10-20T10:00:00.000Z',
    p_origin_label:'Origen',p_origin_address:'Calle A',p_destination_label:'Destino',p_destination_address:'Calle B',
    p_passenger_display_name:'Pasajero',p_passenger_phone:'+34000000000',p_notes:draft.notes});
  assert.equal(result.serviceId,ids.service);assert.equal(result.humanCode,'SRV-TEST');
  assert.equal(JSON.stringify(tables),before);assert.equal(notices.length,0);
});

test('update sends only schedule and notes; blank notes can be deliberately saved',async()=>{
  const {api,calls}=setup();await api.execute('update',{schedule:'2026-10-21T10:00:00Z',notes:'',internalNotes:'internas',origin:'not supported'},ids.service);
  assert.deepEqual(calls[0],{name:'update_service',args:{p_service_id:ids.service,p_scheduled_start_at:'2026-10-21T10:00:00.000Z',p_notes:'',p_internal_notes:'internas'}});
});

test('unchanged accepted schedule is sent as null; actual rescheduling is blocked',async()=>{
  const {api,calls,context}=setup({services:[{id:ids.service,operational_status:'confirmed',scheduled_start_at:'2026-10-20T10:00:00Z'}],
    service_assignments:[{id:ids.assignment,service_id:ids.service,assignment_status:'accepted',ended_at:null}]});
  const initial=vm.runInContext("serviceAdminLocalDate('2026-10-20T10:00:00Z')",context);
  await api.execute('update',{schedule:initial,notes:'only notes'},ids.service);
  assert.equal(calls[0].args.p_scheduled_start_at,null);
  await assert.rejects(api.execute('update',{schedule:'2026-10-21T10:00:00Z'},ids.service),/no admite cambio/);
  assert.equal(calls.length,1);
});

test('assign and reassign use real identities, active links, reason and priority parameters',async()=>{
  const {api,calls}=setup();
  await api.execute('assign',{driverId:ids.driver,vehicleId:ids.vehicle,priorityException:true,reason:'Excepción explícita'},ids.service);
  await api.execute('reassign',{driverId:ids.driver,vehicleId:ids.vehicle,reason:'Cambio controlado'},ids.service);
  assert.deepEqual(calls.map(c=>c.name),['assign_service','reassign_service']);
  assert.equal(calls[0].args.p_priority_exception_reason,'Excepción explícita');
  assert.equal(calls[1].args.p_reason,'Cambio controlado');assert.equal(calls[1].args.p_internal_priority_exception,false);
  assert.equal('p_priority_exception_reason' in calls[1].args,false);
});

test('cancel uses reason fields and no table writes',async()=>{
  const {api,calls}=setup();await api.execute('cancel',{reasonCode:'OTHER',reason:'Fin de prueba aislada'},ids.service);
  assert.deepEqual(calls[0],{name:'cancel_service',args:{p_service_id:ids.service,p_reason_code:'OTHER',p_reason_details:'Fin de prueba aislada'}});
});

test('invalid relationships, absent reason, terminal state and unauthorized action never call RPC',async()=>{
  const {api,calls}=setup({driver_vehicle_assignments:[]});
  await assert.rejects(api.execute('assign',{driverId:ids.driver,vehicleId:ids.vehicle},ids.service));
  await assert.rejects(api.execute('cancel',{},ids.service));
  await assert.rejects(api.execute('complete',{},ids.service));
  await assert.rejects(api.execute('create',{...draft,schedule:'invalid'}));
  await assert.rejects(api.execute('create',{...draft,passenger:''}));
  assert.equal(calls.length,0);
  const terminal=setup({services:[{id:ids.service,operational_status:'in_progress'}]});
  await assert.rejects(terminal.api.execute('cancel',{reasonCode:'OTHER'},ids.service));assert.equal(terminal.calls.length,0);
});

test('QA and legacy identities cannot be used for create, update or assignment',async()=>{
  const qa=setup({customers:[{id:ids.customer,status:'active',internal_notes:'qa_run=batch;'}],
    drivers:[{id:ids.driver,administrative_status:'active',observations:'qa_case=C1;'}]});
  await assert.rejects(qa.api.execute('create',draft));
  await assert.rejects(qa.api.execute('assign',{driverId:ids.driver,vehicleId:ids.vehicle},ids.service));assert.equal(qa.calls.length,0);
  const legacy='70000000-0000-4000-8000-000000000001';
  const old=setup({services:[{id:legacy,operational_status:'pending'}]});
  await assert.rejects(old.api.execute('update',{notes:'no'},legacy));assert.equal(old.calls.length,0);
});

test('backend errors remain visible and never emit success or change local state',async()=>{
  const {api,calls,tables,notices}=setup({},async()=>({data:null,error:{message:'Driver must exist and be active.',code:'23514',details:'Constraint rejected'}}));
  const before=JSON.stringify(tables);
  await assert.rejects(api.execute('create',draft),e=>e.code==='23514'&&e.message.includes('Constraint rejected'));
  assert.equal(calls.length,1);assert.equal(notices.length,0);assert.equal(JSON.stringify(tables),before);
});

test('pending requests cannot show success or be submitted twice',async()=>{
  let resolve;const pending=new Promise(r=>{resolve=r;});const {api,calls,notices}=setup({},()=>pending);
  const first=api.execute('create',draft);
  await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,1);assert.equal(notices.length,0);
  await assert.rejects(api.execute('create',draft),/escritura en curso/);
  resolve({data:[{service_id:ids.service,human_code:'SRV-TEST'}],error:null});await first;
  assert.equal(calls.length,1);
});

test('transport ambiguity and malformed success responses require review before retry',async()=>{
  for(const response of [{data:null,error:{message:'Failed to fetch'}},{data:null,error:null}]){
    const {api}=setup({},async()=>response);
    await assert.rejects(api.execute('create',draft),e=>e.remoteCommitted===true);
  }
  const thrown=setup({},async()=>{throw new Error('Network disconnected');});
  await assert.rejects(thrown.api.execute('create',draft),e=>e.remoteCommitted===true);
});

test('forms expose only supported edits, disabled financial controls and distinct actions',()=>{
  const {api}=setup();const context={customers:[],service:{notes:'<unsafe>',internal_notes:''},initialSchedule:'',assignments:[]};
  const create=api.fields('create',context),update=api.fields('update',context);
  assert.match(create,/<fieldset disabled>/);assert.match(create,/Crear primero y asignar después/);
  assert.match(update,/name="internalNotes"/);assert.match(update,/&lt;unsafe&gt;/);
  assert.match(update,/Fuera del contrato de edición/);
  const actions=api.actions({service_id:ids.service,operational_status:'pending'});
  for(const name of ['update','assign','reassign','cancel'])assert.ok(actions.includes(`data-service-admin-action="${name}"`));
  assert.match(actions,/<button type="button" disabled>Cobro no disponible/);
  assert.match(actions,/disabled>Finalización/);
});

test('driver context cannot submit administrative writes',async()=>{
  const {api,window,calls}=setup();window.ElaraAuth.getActiveContext=()=> 'conductor';
  await assert.rejects(api.execute('create',draft),/contexto administrativo/);assert.equal(calls.length,0);
});
