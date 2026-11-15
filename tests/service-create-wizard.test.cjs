const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
function setup(role='administrativo') {
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8'));
 const customers=[{id:'authorized',status:'active',name:'Cliente autorizado'},{id:'blocked',status:'blocked',name:'Bloqueado'}];
 window.ElaraAuth={getActiveContext:()=>role};
 window.ElaraOperationalData={loadIdentity:async()=>{},getCollection:name=>name==='customers'?customers:[],customerName:r=>r.name,isQaRecord:()=>false};
 window.ElaraSupabase={client:{rpc(){throw Error('No remote writes allowed');}}};
 window.ElaraServicesMock={};Object.defineProperty(window.ElaraServicesMock,'services',{get(){throw Error('Legacy accessed');}});
 const context={window,document,console,Intl,Set,Map,Date};vm.createContext(context);vm.runInContext(fs.readFileSync('src/js/services.js','utf8'),context);
 const modal=document.getElementById('new-service-modal');
 const click=node=>node.dispatchEvent(new window.Event('click',{bubbles:true}));
 return {window,document,context,modal,click,open:async()=>{await window.ElaraServiceAdmin.open('create');const form=modal.querySelector('form');if(form)for(const el of form.querySelectorAll('input,select,textarea')){el.checkValidity=()=>!el.hasAttribute('required')||Boolean(el.value);el.reportValidity=()=>el.checkValidity();}return form;}};
}
test('wizard uses one form, original five sections and only supported named controls',async()=>{
 const h=setup(),f=await h.open();assert.equal(h.document.querySelectorAll('#service-admin-form').length,1);assert.equal(f.querySelectorAll('[data-create-step]').length,5);
 assert.ok(h.modal.querySelector('.modal--wizard'));assert.equal(f.querySelector('option[value="blocked"]'),null);
 assert.deepEqual([...f.querySelectorAll('[name]')].map(e=>e.name).sort(),['customerId','serviceType','schedule','origin','originAddress','destination','destinationAddress','passenger','phone','notes'].sort());
 assert.ok(f.querySelector('fieldset[disabled]'));assert.equal(f.querySelectorAll('[type="submit"]').length,1);
});
test('steps validate previous fields and preserve values on forward/back navigation',async()=>{
 const h=setup(),f=await h.open();const go=n=>h.click(f.querySelector(`[data-create-toggle="${n}"]`));
 go(2);assert.ok(f.querySelector('[data-create-step="1"]').classList.contains('wizard-step--active'));
 for(const el of f.querySelectorAll('[required]')){Object.defineProperty(el,'value',{value:el.tagName==='SELECT'?el.querySelectorAll('option')[1]?.value:'2026-11-15T12:00',writable:true,configurable:true});el.checkValidity=()=>true;}
 f.querySelector('[name="origin"]').value='Origen conservado';go(2);go(1);assert.equal(f.querySelector('[name="origin"]').value,'Origen conservado');go(5);
 assert.match(f.querySelector('[data-create-summary]').textContent,/Origen conservado/);
});
test('search only returns authorized customers and selects real identity',async()=>{
 const h=setup(),f=await h.open(),search=f.querySelector('[data-create-customer-search]');search.value='autorizado';search.dispatchEvent(new h.window.Event('input',{bubbles:true}));
 const results=f.querySelector('[data-create-customer-results]');assert.equal(results.children.length,1);assert.match(results.textContent,/Cliente autorizado/);
 Object.defineProperty(f.querySelector('[name="customerId"]'),'value',{value:'',writable:true,configurable:true});h.click(results.firstElementChild);assert.equal(f.querySelector('[name="customerId"]').value,'authorized');assert.equal(results.hidden,true);
 search.value='Bloqueado';search.dispatchEvent(new h.window.Event('input',{bubbles:true}));assert.equal(results.children.length,0);
});
test('repeated open/close has unique ids and fresh fields; backdrop closes, content does not',async()=>{
 const h=setup();for(let i=0;i<3;i++){const f=await h.open();assert.equal(f.querySelector('[name="origin"]').value,'');h.click(f);assert.equal(h.modal.hidden,false);
 const ids=[...h.document.querySelectorAll('[id]')].map(e=>e.id);assert.equal(new Set(ids).size,ids.length);h.click(h.modal);assert.equal(h.modal.hidden,true);}
 await h.open();h.click(h.modal.querySelector('[data-service-admin-close]'));assert.equal(h.modal.hidden,true);
});
test('non administrative context cannot load a create form',async()=>{const h=setup('conductor');await h.open();assert.equal(h.modal.querySelector('form'),null);assert.match(h.modal.textContent,/contexto administrativo/);});

test('confirmation formats Madrid winter/summer time without changing the input or RPC instant',async()=>{
 const h=setup(),f=await h.open(),schedule=f.querySelector('[name="schedule"]');
 for(const [value,expected] of [['2026-11-14T14:39:45.566Z','14/11/2026 — 15:39'],['2026-07-14T13:39:45.566Z','14/07/2026 — 15:39'],['2026-11-14T23:30:00Z','15/11/2026 — 00:30']]) {
  h.context.dateValue=value;assert.equal(vm.runInContext('serviceAdminSummarySchedule(dateValue)',h.context),expected);
 }
 for(const el of f.querySelectorAll('[required]'))el.checkValidity=()=>true;
 const value='2026-11-14T15:39:45.566';schedule.value=value;
 const expected=vm.runInContext('serviceAdminSummarySchedule("2026-11-14T15:39:45.566")',h.context);
 h.click(f.querySelector('[data-create-toggle="5"]'));assert.match(f.querySelector('[data-create-summary]').textContent,new RegExp(expected));assert.equal(schedule.value,value);
 h.context.values={customerId:'authorized',serviceType:'transfer',schedule:value,origin:'A',destination:'B'};
 const args=vm.runInContext('serviceAdminArgs("create",values,{customers:[{id:"authorized"}]})',h.context);
 assert.equal(args.p_scheduled_start_at,new Date(value).toISOString());assert.equal(schedule.value,value);
});

test('creation keeps a native blank datetime-local with minute precision, without altering edit precision',async()=>{
 const h=setup(),f=await h.open(),schedule=f.querySelector('[name="schedule"]');
 assert.equal(schedule.type,'datetime-local');assert.equal(schedule.getAttribute('step'),'60');assert.equal(schedule.value,'');
 assert.ok(schedule.hasAttribute('required'));
 const edit=h.window.ElaraServiceAdmin.fields('update',{service:{operational_status:'pending'},assignments:[],initialSchedule:'2026-11-14T15:39:45.566'});
 assert.match(edit,/step="0.001"/);assert.match(edit,/2026-11-14T15:39:45.566/);
});

test('Cancelar and Cerrar close the same modal without writes; session failure prevents form loading',async()=>{
 const h=setup();await h.open();h.click(h.modal.querySelector('[data-create-step="5"] [data-service-admin-close]'));assert.equal(h.modal.hidden,true);
 await h.open();h.click(h.modal.querySelector('header [data-service-admin-close]'));assert.equal(h.modal.hidden,true);
 h.window.ElaraOperationalData.loadIdentity=async()=>{throw Error('Sesión no válida');};await h.open();assert.equal(h.modal.querySelector('form'),null);assert.match(h.modal.textContent,/Sesión no válida/);
});

test('Dashboard and Services entry controls open the identical operational wizard once per click',async()=>{
 const {setup:richSetup,settle}=require('./services-presentation-harness.cjs');const h=richSetup();
 const source=fs.readFileSync('src/js/services.js','utf8');
 // Restore the actual opener: the shared presentation harness normally records actions instead.
 vm.runInContext(source.slice(source.indexOf('async function serviceAdminOpen('),source.indexOf('async function serviceAdminSubmit(')),h.context);
 vm.runInContext('const actualCreateOpen=serviceAdminOpen;let createOpenCount=0;serviceAdminOpen=(...args)=>{createOpenCount++;return actualCreateOpen(...args);};',h.context);
 vm.runInContext(fs.readFileSync('src/js/dashboard.js','utf8'),h.context);
 const activate=id=>{for(const v of h.document.querySelectorAll('.view'))v.hidden=v.id!==id;};
 activate('dashboard');await h.context.showOperationalDashboard();h.click(h.document.getElementById('primary-action'));await settle();await settle();
 const modal=h.document.getElementById('new-service-modal'),first=modal.querySelector('form');assert.ok(first);const markup=first.innerHTML;
 h.click(modal.querySelector('[data-service-admin-close]'));activate('servicios');await h.show();
 h.click(h.panel().querySelector('[data-service-admin-action="create"]'));await settle();await settle();
 assert.equal(modal.hidden,false);assert.equal(modal.querySelector('form').innerHTML,markup);assert.equal(h.document.querySelectorAll('#service-admin-form').length,1);
 assert.equal(vm.runInContext('createOpenCount',h.context),2);
});
