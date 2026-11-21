const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{randomUUID}=require('node:crypto');
const base=require('./users-presentation-harness.cjs');
async function setup({available=true,edge=true,manage,invoke,control,operations={metadata:true,status:true,assign:true,revoke:true,invite:true},role='superadmin'}={}){
 const h=base.setup({role}),writes=[],notices=[],probes=[];h.window.ElaraNotifications={showToast:(...v)=>notices.push(v)};
 // Existing functional tests explicitly simulate a deployment approved for all actions.
 h.availability={contract:'0057',manage:false,authorized:true,availability_contract:'0057.availability.v1',operations,callback_url:'https://local.example.invalid/accept-user-invite.html'};
 h.edgeAvailability={contract:'0057',availability_contract:'0057.availability.v1',operations:{invite:true},callback_url:h.availability.callback_url};
 h.window.ElaraSupabase.client.rpc=async(name,args)=>{
  if(name==='admin_get_user_control'){probes.push(name);if(!available)return{error:{code:'PGRST202'}};const u=h.tables.app_users.find(u=>u.id===args.p_user_id);return{data:control?await control(args):u?{contract:'0057',user_id:u.id,version:1,status:u.status,default_context:u.default_context,note:u.internal_note}:h.availability};}
  if(name==='admin_get_user_request')return{data:h.receipt||{state:'not_found'}};
  assert.equal(name,'admin_manage_user');writes.push(args);return manage?manage(args,h):{data:{user_id:args.p_user_id,action:args.p_action,version:2}};
 };
 h.window.ElaraSupabase.client.functions={invoke:async(name,args)=>{assert.equal(name,'user-administration');if(args.body.action==='capabilities'){probes.push('edge');return edge?{data:h.edgeAvailability}:{error:{message:'not deployed'}};}writes.push(args.body);return invoke?invoke(args.body,h):{data:{state:'applied',user_id:base.uuid(1)}};}};
 vm.runInContext(fs.readFileSync('src/js/users-admin.js','utf8'),h.context);
 await h.show();await base.settle();await base.settle();
 const set=(name,value)=>{const n=h.document.querySelector('#users-admin-form [name="'+name+'"]');assert(n,name);if(n.type==='checkbox')n.checked=value;else Object.defineProperty(n,'value',{configurable:true,writable:true,value});};
 const open=async(action)=>{if(action==='invite')h.click(h.document.getElementById('primary-action'));else{h.click(h.document.querySelector('[data-user-detail]'));h.click(h.document.querySelector('[data-user-admin="'+action+'"]'));}await base.settle();await base.settle();};
 const submit=()=>h.document.getElementById('users-admin-form').dispatchEvent(new h.window.Event('submit',{bubbles:true,cancelable:true}));
 return Object.assign(h,{writes,notices,probes,set,open,submit});
}
test('Usuarios 1B missing contracts disable administration and invitations',async()=>{const h=await setup({available:false});assert(h.document.getElementById('primary-action').disabled);h.click(h.document.querySelector('[data-user-detail]'));assert([...h.document.querySelectorAll('[data-user-admin]')].every(n=>n.disabled));assert.equal(h.writes.length,0);});
test('Usuarios 1B Edge absent keeps invitations disabled while SQL actions work',async()=>{const h=await setup({edge:false});assert(h.document.getElementById('primary-action').disabled);await h.open('metadata');assert(!h.document.getElementById('users-admin-modal').hidden);});
test('Usuarios 1B mandatory reason and confirmation prevent submissions',async()=>{const h=await setup();await h.open('metadata');h.submit();await base.settle();assert.equal(h.writes.length,0);h.set('reason','Local reason');h.submit();await base.settle();assert.equal(h.writes.length,0);});
test('Usuarios 1B metadata sends immutable versioned RPC and confirms before refresh',async()=>{let release;const wait=new Promise(r=>release=r);const h=await setup({manage:async args=>{await wait;return{data:{user_id:args.p_user_id,action:args.p_action}};}});await h.open('metadata');h.set('note','Local updated');h.set('reason','Authorized local test');h.set('confirm',true);h.submit();h.submit();await base.settle();assert.equal(h.writes.length,1);assert.equal(h.notices.length,0);assert.equal(h.writes[0].p_expected_version,1);assert.equal(h.writes[0].p_changes.note,'Local updated');release();await base.settle();await base.settle();assert.equal(h.notices.length,1);});
test('Usuarios 1B uncertain response blocks new writes and reconciles by receipt',async()=>{const h=await setup({manage:async()=>{throw Error('network timeout');}});await h.open('status');h.set('reason','Local status');h.set('confirm',true);h.submit();await base.settle();assert(!h.document.getElementById('users-admin-reconcile').hidden);h.submit();assert.equal(h.writes.length,1);h.receipt={state:'applied',result:{user_id:base.uuid(1)}};h.click(h.document.getElementById('users-admin-reconcile'));await base.settle();await base.settle();assert.equal(h.notices.length,1);assert.equal(h.writes.length,1);});
test('Usuarios 1B invitation validates multirole default and uses Edge only',async()=>{const h=await setup();await h.open('invite');for(const [n,v]of Object.entries({first_name:'Local',last_name:'User',email:'local@example.invalid',reason:'Local invitation',default_context:'administrativo',confirm:true}))h.set(n,v);h.submit();await base.settle();assert.equal(h.writes.length,0);h.document.querySelector('[name=invite-role][value=administrativo]').setAttribute('checked','');h.submit();await base.settle();await base.settle();assert.equal(h.writes.length,1);assert.deepEqual(Array.from(h.writes[0].details.roles),['administrativo']);assert(!h.writes[0].details.roles.includes('conductor'));});
test('Usuarios 1B navigation and session changes suppress late write results',async()=>{let release;const wait=new Promise(r=>release=r);const h=await setup({manage:async args=>{await wait;return{data:{user_id:args.p_user_id,action:args.p_action}};}});await h.open('metadata');h.set('reason','Local change');h.set('confirm',true);h.submit();h.role('conductor');release();await base.settle();await base.settle();assert(h.document.getElementById('users-admin-modal').hidden);assert.equal(h.notices.length,0);});
test('Usuarios 1B stale version is rejected without showing success',async()=>{const h=await setup({manage:async()=>({error:{code:'40001'}})});await h.open('metadata');h.set('reason','Local change');h.set('confirm',true);h.submit();await base.settle();assert.match(h.document.getElementById('users-admin-status').textContent,/usuario cambió/);assert(h.document.getElementById('users-admin-submit').disabled);assert.equal(h.notices.length,0);});
test('Usuarios 1B role/session revalidation keeps capability probes coherent',async()=>{const h=await setup();h.window.dispatchEvent(new h.window.CustomEvent('elara:auth-session-updated'));await base.settle();await base.settle();assert(!h.document.getElementById('primary-action').disabled);assert.equal(h.document.querySelectorAll('#users-admin-modal').length,1);});

test('Usuarios 1B installed SQL with no rollout activation leaves every operation disabled',async()=>{
 const h=await setup({operations:{},edge:false});h.click(h.document.querySelector('[data-user-detail]'));
 assert([...h.document.querySelectorAll('[data-user-admin]')].every(n=>n.disabled));assert(h.document.getElementById('primary-action').disabled);
 assert(!h.probes.includes('edge'));assert.equal(h.writes.length,0);
});
test('Usuarios 1B only explicitly activated SQL operations work without Edge',async()=>{
 const h=await setup({operations:{metadata:true},edge:false});h.click(h.document.querySelector('[data-user-detail]'));
 for(const n of h.document.querySelectorAll('[data-user-admin]'))assert.equal(n.disabled,n.dataset.userAdmin!=='metadata');
 assert(!h.probes.includes('edge'));await h.open('metadata');assert(!h.document.getElementById('users-admin-modal').hidden);assert.equal(h.writes.length,0);
});
test('Usuarios 1B manage=true without the availability contract never enables operations',async()=>{
 const h=await setup({control:async()=>({contract:'0057',manage:true})});h.click(h.document.querySelector('[data-user-detail]'));
 assert([...h.document.querySelectorAll('[data-user-admin]')].every(n=>n.disabled));assert(h.document.getElementById('primary-action').disabled);assert.equal(h.writes.length,0);
});
test('Usuarios 1B Edge alone cannot enable invitations before callback and mail approval',async()=>{
 const h=await setup({operations:{metadata:true,status:true,assign:true,revoke:true,invite:false}});assert(h.document.getElementById('primary-action').disabled);assert(!h.probes.includes('edge'));assert.equal(h.writes.length,0);
});
for(const bad of ['legacy','callback','contract','denied'])test('Usuarios 1B rejects incompatible Edge readiness: '+bad,async()=>{
 const h=await setup();h.edgeAvailability=bad==='legacy'?{contract:'0057',invitation:true}:{...h.edgeAvailability,...(bad==='callback'?{callback_url:'https://other.invalid/accept-user-invite.html'}:bad==='contract'?{availability_contract:'future'}:{operations:{invite:false}})};
 await h.window.ElaraUsersAdmin.prepare();assert(h.document.getElementById('primary-action').disabled);assert.equal(h.writes.length,0);
});
test('Usuarios 1B non-Superadmin never probes or enables administrative operations',async()=>{
 const h=await setup({role:'administrativo'});assert.equal(h.probes.length,0);assert.equal(h.writes.length,0);assert(h.document.getElementById('usuarios').hidden);
});
test('Usuarios 1B unavailable authorization probe keeps all operations closed',async()=>{
 const h=await setup({control:async()=>{throw Error('read unavailable');}});h.click(h.document.querySelector('[data-user-detail]'));assert([...h.document.querySelectorAll('[data-user-admin]')].every(n=>n.disabled));assert(h.document.getElementById('primary-action').disabled);assert.equal(h.writes.length,0);
});
test('Usuarios 1B late authorization response cannot survive a context change',async()=>{
 let release;const p=new Promise(r=>release=r);const h=await setup({control:async()=>p});h.role('conductor');release({contract:'0057',manage:true,availability_contract:'0057.availability.v1',operations:{metadata:true,invite:true}});
 await base.settle();await base.settle();assert(h.document.getElementById('primary-action').disabled);assert.equal(h.writes.length,0);
});
test('Usuarios 1B an older readiness probe cannot overwrite a newer closed deployment',async()=>{
 const h=await setup();let release,first=true;const p=new Promise(r=>release=r),original=h.window.ElaraSupabase.client.rpc;
 h.window.ElaraSupabase.client.rpc=async(name,args)=>name==='admin_get_user_control'&&args.p_user_id===null&&first?(first=false,await p):original(name,args);
 const older=h.window.ElaraUsersAdmin.prepare();h.availability={...h.availability,operations:{}};await h.window.ElaraUsersAdmin.prepare();release({...h.availability,operations:{metadata:true,invite:true}});await older;
 h.click(h.document.querySelector('[data-user-detail]'));assert([...h.document.querySelectorAll('[data-user-admin]')].every(n=>n.disabled));assert(h.document.getElementById('primary-action').disabled);
});
test('Usuarios 1B rollout withdrawal before submit prevents writes and explains unavailability',async()=>{
 const h=await setup();await h.open('metadata');h.set('reason','Local update');h.set('confirm',true);h.availability={...h.availability,operations:{}};h.submit();await base.settle();await base.settle();
 assert.equal(h.writes.length,0);assert(h.document.getElementById('users-admin-submit').disabled);assert.match(h.document.getElementById('users-admin-status').textContent,/pendiente de activación/);
});
test('Usuarios 1B rollout withdrawal keeps an uncertain request without replaying a write',async()=>{
 const h=await setup({manage:async()=>{throw Error('unknown');}});await h.open('metadata');h.set('reason','Local update');h.set('confirm',true);h.submit();await base.settle();await base.settle();assert.equal(h.writes.length,1);
 h.availability={...h.availability,operations:{}};h.click(h.document.getElementById('users-admin-reconcile'));await base.settle();await base.settle();assert.equal(h.writes.length,1);assert.match(h.document.getElementById('users-admin-status').textContent,/sin reenviar/);
});
for(const change of ['account','navigation'])test('Usuarios 1B a late readiness response cannot survive '+change,async()=>{
 let release;const p=new Promise(r=>release=r);let first=true;
 const h=await setup({control:async()=>first?(first=false,await p):{contract:'0057',manage:false,authorized:false,availability_contract:'0057.availability.v1',operations:{}}});
 if(change==='account')h.actor('different-local-operator');else h.document.getElementById('usuarios').hidden=true;
 release({contract:'0057',manage:false,authorized:true,availability_contract:'0057.availability.v1',operations:{metadata:true,invite:true},callback_url:'https://local.example.invalid/accept-user-invite.html'});
 await base.settle();await base.settle();assert(h.document.getElementById('primary-action').disabled);assert.equal(h.writes.length,0);
});
