const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup,environment,deferred,tick}=require('./auth-multirole-harness.cjs');
const roles=p=>Array.from(p.api.getAvailableRoles());
test('single assigned role hides selector; multiple roles come from own current assignments and active catalog',async()=>{
  const p=setup(environment(['superadmin']));await p.init();assert.deepEqual(roles(p),['superadmin']);assert.equal(p.document.querySelector('#session-context-switcher').hidden,true);
  const q=setup();q.env.rows.push({user_id:'another',role_key:'conductor',status:'active',starts_at:'2020-01-01'});await q.init();assert.deepEqual(roles(q),['superadmin','administrativo','conductor']);assert.equal(q.document.querySelectorAll('[data-auth-context-option]').length,3);assert.equal(q.storage.size,0);
});
test('revoked, expired, future, malformed and disabled roles are excluded without implied privileges',async()=>{
  for(const mutate of [r=>r.status='revoked',r=>r.revoked_at='2025-01-01',r=>r.ends_at='2025-01-01',r=>r.starts_at='2099-01-01',r=>r.starts_at='invalid']){
    const p=setup();mutate(p.env.rows[1]);await p.init();assert.equal(roles(p).includes('superadmin'),false);assert.equal(await p.api.setActiveContext('superadmin'),false);assert.equal(p.env.calls.length,1);
  }
  const p=setup();p.env.catalog[1].is_active=false;await p.init();assert.equal(roles(p).includes('superadmin'),false);
});
test('all administrative and driver transitions wait for server and renew driver identity',async()=>{
  const p=setup();await p.init();for(const role of ['superadmin','administrativo','conductor','superadmin']){
    const gate=deferred();p.env.beforeRpc=async(_n,args)=>{if(args?.p_requested_context)await gate.promise;};
    const task=p.api.setActiveContext(role);await tick();assert.equal(p.api.getCurrentUser(),null);assert.equal(p.api.getActiveContext(),'');assert.equal(p.document.querySelector('.app-shell').hidden,true);
    gate.resolve();assert.equal(await task,true);assert.equal(p.api.getActiveContext(),role);assert.equal(p.routes.at(-1),role);
    assert.equal(p.api.getCurrentUser().driverIdentityStatus,role==='conductor'?'resolved':'not-required');
  }
  assert.deepEqual(p.env.calls.filter(c=>c.args).map(c=>c.args.p_requested_context),['superadmin','administrativo','conductor','superadmin']);
});
test('driver role never fabricates missing, future, ended or inactive driver identity',async()=>{
  for(const options of [{driver:false},{link:{started_at:'2099-01-01'}},{link:{ended_at:'2020-01-01'}},{driverStatus:'inactive'}]){
    const p=setup();Object.assign(p.env,options);await p.init();await p.api.setActiveContext('conductor');assert.equal(p.api.getActiveContext(),'conductor');assert.equal(p.api.getCurrentUser().driverId,'');assert.notEqual(p.api.getCurrentUser().driverIdentityStatus,'resolved');
  }
});
test('server rejection revalidates previous context; uncertain commit reconciles without repeat or false success',async()=>{
  for(const committed of [false,true]){const p=setup();await p.init();p.env.beforeRpc=async(_n,args)=>{if(args?.p_requested_context){if(committed)p.env.context='superadmin';return {error:{code:committed?'NETWORK':'42501',message:'local rejection'}};}};
    assert.equal(await p.api.setActiveContext('superadmin'),false);assert.equal(p.api.getActiveContext(),committed?'superadmin':'administrativo');assert.equal(p.env.calls.filter(c=>c.args).length,1);assert.equal(p.messages.some(m=>m.type==='success'),false);
  }
});
test('double click and incompatible simultaneous changes produce a single request',async()=>{
  const p=setup();await p.init();const gate=deferred();p.env.beforeRpc=async()=>{await gate.promise;};const first=p.api.setActiveContext('superadmin');assert.equal(await p.api.setActiveContext('superadmin'),false);assert.equal(await p.api.setActiveContext('conductor'),false);gate.resolve();await first;assert.equal(p.env.calls.filter(c=>c.args).length,1);
});
test('role revoked between rendering and submit is not sent; failed reconciliation blocks protected UI',async()=>{
  const p=setup();await p.init();p.env.rows[1].status='revoked';assert.equal(await p.api.setActiveContext('superadmin'),false);assert.equal(p.api.getActiveContext(),'administrativo');assert.equal(p.env.calls.filter(c=>c.args).length,0);
  p.env.beforeRpc=()=>({error:{code:'NETWORK'}});await p.api.setActiveContext('conductor');assert.equal(p.api.getCurrentUser(),null);assert.equal(p.document.querySelector('.app-shell').hidden,true);
});
test('late context response after account replacement or logout cannot restore prior authority',async()=>{
  for(const logout of [false,true]){const p=setup();await p.init();const gate=deferred();p.env.beforeRpc=async(_n,args)=>{if(args?.p_requested_context)await gate.promise;};const change=p.api.setActiveContext('superadmin');await tick();
    if(logout)await p.api.logout();else p.changeUser({user:{id:'other'},access_token:'x.'+Buffer.from(JSON.stringify({session_id:'other'})).toString('base64url')+'.x'});
    gate.resolve();assert.equal(await change,false);assert.equal(p.api.getCurrentUser(),null);assert.equal(p.document.querySelector('.app-shell').hidden,true);
  }
});
test('reload restores server context; passive revalidation preserves open work when authority is unchanged',async()=>{
  const env=environment(),p=setup(env);await p.init();await p.api.setActiveContext('superadmin');const q=setup(env);await q.init();assert.equal(q.api.getActiveContext(),'superadmin');const resets=q.resets.length;const modal=q.document.querySelector('.modal-backdrop');modal.hidden=false;await q.ctx.synchronizeContext();assert.equal(q.resets.length,resets);assert.equal(modal.hidden,false);
});
test('shared-session tabs invalidate immediately, serialize changes and converge to server context',async()=>{
  const env=environment(),p=setup(env),q=setup(env);await p.init();await q.init();const gate=deferred();env.beforeRpc=async(_n,args)=>{if(args?.p_requested_context)await gate.promise;};const change=p.api.setActiveContext('superadmin');await tick();assert.equal(q.api.getCurrentUser(),null);assert.equal(q.document.querySelector('.app-shell').hidden,true);assert.equal(await q.api.setActiveContext('conductor'),false);gate.resolve();await change;await q.ctx.synchronizeContext();assert.equal(p.api.getActiveContext(),'superadmin');assert.equal(q.api.getActiveContext(),'superadmin');
});
test('revocation selects a previously authorized alternative only after server confirmation, or blocks',async()=>{
  const p=setup();await p.init();p.env.rows[0].status='revoked';await p.ctx.synchronizeContext();assert.equal(p.api.getActiveContext(),'superadmin');assert.equal(p.api.getCurrentUser().roles.includes('administrativo'),false);
  p.env.rows.forEach(r=>r.status='revoked');await p.ctx.synchronizeContext();assert.equal(p.api.getActiveContext(),'');assert.equal(p.api.getCurrentUser(),null);
});
test('RLS read errors fail closed and never produce a fabricated role list',async()=>{
  const p=setup();p.env.readError={code:'42501',message:'roles read denied'};await assert.rejects(p.init(),e=>e.elaraStage==='authorized-roles');assert.equal(p.api.getCurrentUser(),null);assert.deepEqual(roles(p),[]);
});
test('context invalidation closes all previous modals, hides views, resets adapters and rejects old driver responses',async()=>{
  const p=setup();await p.init();const modal=p.document.querySelector('.modal-backdrop');modal.hidden=false;p.document.querySelector('[data-view]').hidden=false;
  const gate=deferred();p.env.beforeRead=async t=>{if(t==='user_driver_links')await gate.promise;};const toDriver=p.api.setActiveContext('conductor');await tick();assert.equal(modal.hidden,true);assert.equal([...p.document.querySelectorAll('[data-view]')].every(v=>v.hidden),true);assert.ok(p.resets.includes('ElaraOperationalData'));
  p.ctx.clearAuthenticatedState();gate.resolve();await toDriver;assert.equal(p.api.getCurrentUser(),null);assert.ok(p.events.includes('context-invalidated'));
});
test('menu reuses original markup, active radio, outside click, Escape and keyboard without duplicate binding',async()=>{
  const p=setup();await p.init();p.ctx.bindContextSwitcher();const sw=p.document.querySelector('#session-context-switcher');assert.equal(sw.querySelector('strong').textContent,'Administrador');assert.equal(sw.querySelectorAll('[aria-checked="true"]').length,1);
  const toggle=sw.querySelector('[data-auth-context-toggle]');toggle.dispatchEvent(new p.window.Event('click',{bubbles:true}));assert.equal(sw.querySelector('[role=menu]').hidden,false);
  const key=(target,k)=>{const e=new p.window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(e,'key',{value:k});target.dispatchEvent(e);};
  let focused='';for(const b of sw.querySelectorAll('button'))b.focus=()=>{focused=b.dataset.authContextOption||'toggle';};key(toggle,'ArrowDown');assert.equal(focused,'superadmin');key(toggle,'End');assert.equal(focused,'conductor');key(toggle,'Escape');assert.equal(focused,'toggle');assert.equal(sw.querySelector('[role=menu]').hidden,true);
  toggle.dispatchEvent(new p.window.Event('click',{bubbles:true}));p.document.body.dispatchEvent(new p.window.Event('click',{bubbles:true}));assert.equal(sw.querySelector('[role=menu]').hidden,true);
});
test('permission matrix and router reject cross-role routes and preserve the existing navigation contracts',async()=>{
  const p=setup();await p.init();require('node:vm').runInContext(require('fs').readFileSync('src/js/permissions.js','utf8'),p.ctx);
  const perm=p.window.ElaraPermissions;assert.equal(perm.getNavigationForContext('administrativo').length,9);assert.equal(perm.getNavigationForContext('superadmin').length,12);assert.equal(perm.getNavigationForContext('conductor').length,6);assert.equal(perm.canAccessRoute('conductor','dashboard'),false);assert.equal(perm.canAccessRoute('administrativo','usuarios'),false);assert.equal(perm.canAccessRoute('superadmin','mis-servicios'),false);
});

test('click during passive refresh is queued once, then revalidates session and role before changing',async()=>{
  const p=setup();await p.init();const gate=deferred();let blocked=true;p.env.beforeRpc=async(_n,args)=>{if(!args&&blocked){blocked=false;await gate.promise;}};
  const refresh=p.ctx.synchronizeContext(),change=p.api.setActiveContext('superadmin'),duplicate=p.api.setActiveContext('superadmin');gate.resolve();await refresh;assert.equal(await change,true);assert.equal(await duplicate,false);assert.equal(p.env.calls.filter(c=>c.args).length,1);
});

test('old initialization cannot resurrect a logged-out session; missing Web Locks disables switching safely',async()=>{
  const p=setup(),gate=deferred();p.env.beforeRead=async()=>gate.promise;const init=p.init();await tick();p.ctx.clearAuthenticatedState();gate.resolve();await assert.rejects(init,e=>e.code==='STALE_AUTH');assert.equal(p.api.getCurrentUser(),null);
  const q=setup();await q.init();delete q.window.navigator.locks;assert.equal(await q.api.setActiveContext('superadmin'),false);assert.equal(q.api.getActiveContext(),'administrativo');assert.equal(q.env.calls.length,1);
});

test('background, focus and Auth account events revalidate without granting unassigned contexts',async()=>{
  const p=setup();await p.init();const calls=p.env.calls.length;p.window.dispatchEvent(new p.window.Event('focus'));await p.ctx.synchronizeContext();assert.ok(p.env.calls.length>calls);assert.equal(p.api.getActiveContext(),'administrativo');
  p.emitAuth('SIGNED_OUT',null);assert.equal(p.api.getCurrentUser(),null);assert.equal(p.document.querySelectorAll('#sidebar-nav a').length,0);
});
