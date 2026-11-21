/* Real pinned Auth SDK; all HTTP intercepted. No real Auth, tokens or accounts. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const sdk=fs.readFileSync(process.env.ELARA_SUPABASE_SDK_FILE,'utf8');
assert.equal(crypto.createHash('sha256').update(sdk).digest('hex'),'ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3');
const source=fs.readFileSync(process.env.ELARA_USER_INVITE_SOURCE||'src/js/accept-user-invite.js','utf8');
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',SID='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const token=(id=A,sid=SID,exp=Math.floor(Date.now()/1000)+3600)=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,session_id:sid,aud:'authenticated',role:'authenticated',exp})).toString('base64url'),'isolated-signature'].join('.');
const user=id=>({id,aud:'authenticated',role:'authenticated',email:'isolated@example.invalid',invited_at:'2026-10-27T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}});
const session=(id=A,sid=SID)=>({access_token:token(id,sid),refresh_token:'isolated-refresh',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user(id)});
const callback='#type=invite&access_token='+token()+'&refresh_token=isolated-refresh&expires_in=3600&token_type=bearer';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=()=>new Promise(r=>setImmediate(r));
async function page({url=callback,existing,local=new Map(),invalid=false,pending=false,beforeStart,beforeVerify}={}){
 const {document,HTMLElement}=parseHTML(fs.readFileSync('src/accept-user-invite.html','utf8'));
 if(!Object.getOwnPropertyDescriptor(HTMLElement.prototype,'elements'))Object.defineProperty(HTMLElement.prototype,'elements',{get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(x=>[x.name||x.getAttribute('name'),x]));}});
 const form=document.getElementById('user-invite-form');form.reset=()=>form.querySelectorAll('input').forEach(x=>x.value='');
 if(existing)local.set('elara.transport.auth',JSON.stringify(existing));
 let location=new URL('https://elara.example.invalid/accept-user-invite.html'+url),destination;
 location.replace=value=>destination=value;
 const listeners=new Map(),calls=[],state={getHook:null,putHook:null,rpcHook:null,pending,putStatus:200,putIdentity:A},changes=[];
 const storage={getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)};
 const sandbox={document,URL,URLSearchParams,Headers,Request,Response,AbortController,TextEncoder,TextDecoder,atob,btoa,crypto:crypto.webcrypto,WebSocket,setTimeout,clearTimeout,setInterval,clearInterval,console,localStorage:storage,sessionStorage:storage,location,history:{replaceState(a,b,p){location.href=new URL(p,location).href;}},navigator:{},
  addEventListener(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},removeEventListener(name,fn){listeners.get(name)?.delete(fn);},
  fetch:async(input,init={})=>{
   const u=new URL(String(input));assert.equal(u.origin,'https://auth.example.invalid','External request forbidden');
   const bearer=new Headers(init.headers).get('Authorization')?.replace(/^Bearer /,'');let subject=null;
   try{subject=JSON.parse(Buffer.from(bearer.split('.')[1],'base64url')).sub;}catch{}
   const method=init.method||'GET';calls.push({path:u.pathname,method,subject});
   if(invalid)return new Response(JSON.stringify({msg:'Expired invitation',code:'bad_jwt'}),{status:401});
   if(u.pathname==='/auth/v1/verify')return new Response(JSON.stringify(session()),{status:200,headers:{'Content-Type':'application/json'}});
   if(u.pathname==='/auth/v1/user'&&method==='GET'){
    if(state.getHook)await state.getHook({subject,init});return new Response(JSON.stringify(user(subject)),{status:200,headers:{'Content-Type':'application/json'}});
   }
   if(u.pathname==='/auth/v1/user'&&method==='PUT'){
    assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.referrerPolicy,'no-referrer');
    if(state.putHook)await state.putHook({subject,init});
    if(!init.signal.aborted&&state.putStatus===200)changes.push(subject);
    // Some tests deliberately return after cancellation, as a network can do.
    return new Response(JSON.stringify(user(state.putIdentity)),{status:state.putStatus,headers:{'Content-Type':'application/json'}});
   }
   if(u.pathname==='/rest/v1/rpc/initialize_app_session'){
    assert.equal(JSON.parse(init.body).p_requested_context,null);if(state.rpcHook)await state.rpcHook({subject,init});
    return new Response(JSON.stringify([{active_context:'administrativo'}]),{status:state.pending?403:200,headers:{'Content-Type':'application/json'}});
   }
   throw Error('Unexpected isolated transport request');
  }
 };
 sandbox.window=sandbox;sandbox.self=sandbox;vm.createContext(sandbox);vm.runInContext(source,sandbox);vm.runInContext(sdk,sandbox);
 sandbox.ElaraConfig={supabase:{url:'https://auth.example.invalid',anonKey:'isolated-public-key',options:{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:false,storageKey:'elara.transport.auth',storage}}}};
 vm.runInContext(fs.readFileSync('src/js/supabase.js','utf8'),sandbox);const client=sandbox.ElaraSupabase.client;
 await client.auth.getSession();
 const emit=(name,event)=>{for(const fn of [...listeners.get(name)||[]])fn(event);};
 const h={sandbox,client,form,local,state,calls,changes,get destination(){return destination;},status:()=>document.getElementById('user-invite-status').textContent,retry:document.getElementById('user-invite-retry'),emit,
  switch:async(id=B,sid=SID)=>client.auth.setSession({access_token:token(id,sid),refresh_token:'isolated-refresh'}),
  logout:()=>client.auth.signOut({scope:'local'}),
  async submit(){form.elements.password.value=form.elements.confirmation.value='Local-password-123';await form.onsubmit?.({preventDefault(){}});},
  writes:()=>calls.filter(c=>c.method==='PUT'),rpcs:()=>calls.filter(c=>c.path.includes('/rest/v1/rpc/')),
 };
 if(beforeStart)await beforeStart(h);if(beforeVerify)state.getHook=beforeVerify(h);
 await sandbox.ElaraUserInviteAcceptance.start();state.getHook=null;return h;
}
test('0057 valid invitation writes only invited identity with fixed bearer and default context',async()=>{const h=await page();assert.equal(h.form.hidden,false,h.status());h.client.auth.updateUser=()=>{throw Error('Mutable SDK write forbidden');};h.client.rpc=()=>{throw Error('Mutable RPC forbidden');};await h.submit();assert.deepEqual(h.changes,[A]);assert(h.rpcs().every(c=>c.subject===A));assert.equal(h.destination,'index.html#dashboard');});
test('0057 expired/invalid link and pre-existing session cannot expose password setup',async()=>{for(const options of [{invalid:true},{url:'',existing:session(B)},{url:'#type=invite&access_token=invalid&refresh_token=invalid',existing:session(B)}]){const h=await page(options);assert(h.form.hidden);assert.equal(h.writes().length,0);}});
test('0057 token-hash invitation remains supported without mutable SDK writes',async()=>{const h=await page({url:'?type=invite&token_hash=isolated-token-hash'});assert.equal(h.form.hidden,false,h.status());await h.submit();assert.deepEqual(h.changes,[A]);});
test('0057 account switched before verification aborts without any update',async()=>{const h=await page({beforeStart:h=>h.switch()});assert(h.form.hidden);assert.equal(h.writes().length,0);});
test('0057 account switched during initial verification discards late identity response',async()=>{let fired=false;const h=await page({beforeVerify:h=>async()=>{if(!fired){fired=true;h.state.getHook=null;await h.switch();}}});assert(h.form.hidden);assert.equal(h.writes().length,0);});
test('0057 account switched after verification aborts before password submission',async()=>{const h=await page();await h.switch();await h.submit();assert(h.form.hidden);assert.equal(h.writes().length,0);assert.equal(h.destination,undefined);});
test('0057 preflight verification response cannot redirect password update to replacement account',async()=>{const h=await page();let fired=false;h.state.getHook=async()=>{if(!fired){fired=true;h.state.getHook=null;await h.switch();}};await h.submit();assert.equal(h.writes().length,0);assert(h.form.hidden);});
test('0057 silent replacement at last getSession is detected before update',async()=>{const h=await page();const original=h.client.auth.getSession.bind(h.client.auth);let reads=0;h.client.auth.getSession=async()=>{const r=await original();if(++reads===2)return {data:{session:session(B)}};return r;};await h.submit();assert.equal(h.writes().length,0);assert(h.form.hidden);});
test('0057 last-instant replacement cannot change the bearer of a dispatched update',async()=>{const h=await page();h.state.putHook=async({subject})=>{assert.equal(subject,A);await h.switch();};await h.submit();assert(h.writes().every(c=>c.subject===A));assert(!h.changes.includes(B));assert.equal(h.destination,undefined);assert(h.form.hidden);});
test('0057 account change while update pending aborts signal and ignores late success',async()=>{const h=await page(),gate=deferred(),started=deferred();let signal;h.state.putHook=async info=>{signal=info.init.signal;started.resolve();await gate.promise;};const pending=h.submit();await started.promise;await h.switch();assert(signal.aborted);gate.resolve();await pending;assert(h.form.hidden);assert.equal(h.destination,undefined);assert(!h.changes.includes(B));assert.equal(h.rpcs().length,0);});
test('0057 signout during verification prevents any password update',async()=>{const h=await page();h.state.getHook=async()=>{h.state.getHook=null;await h.logout();};await h.submit();assert(h.form.hidden);assert.equal(h.writes().length,0);});
test('0057 signout during pending update never targets another account or reports success',async()=>{const h=await page(),gate=deferred(),started=deferred();h.state.putHook=async()=>{started.resolve();await gate.promise;};const p=h.submit();await started.promise;await h.logout();gate.resolve();await p;assert(h.form.hidden);assert.equal(h.destination,undefined);assert(h.writes().every(c=>c.subject===A));});
test('0057 same account with different session invalidates invitation binding',async()=>{const h=await page();await h.switch(A,'dddddddd-dddd-4ddd-8ddd-dddddddddddd');await h.submit();assert(h.form.hidden);assert.equal(h.writes().length,0);});
test('0057 duplicate submit sends one request; uncertain delivery cannot be resent',async()=>{const h=await page(),gate=deferred(),started=deferred();h.state.putHook=async()=>{started.resolve();await gate.promise;throw Error('Response lost');};const first=h.submit();await started.promise;await h.submit();assert.equal(h.writes().length,1);gate.resolve();await first;await h.submit();assert.equal(h.writes().length,1);assert(h.form.hidden);assert.equal(h.destination,undefined);});
test('0057 confirmed password retries only operational access without another update',async()=>{const h=await page({pending:true});await h.submit();assert.deepEqual(h.changes,[A]);assert(!h.retry.hidden);h.state.pending=false;await h.retry.onclick();assert.equal(h.writes().length,1);assert.equal(h.destination,'index.html#dashboard');});
test('0057 invalid password can be corrected after explicit Auth rejection',async()=>{const h=await page();h.state.putStatus=422;await h.submit();assert.equal(h.form.hidden,false);assert.equal(h.changes.length,0);h.state.putStatus=200;await h.submit();assert.deepEqual(h.changes,[A]);});
test('0057 two tabs: shared storage change invalidates pending invitation in first tab',async()=>{const local=new Map(),a=await page({local}),b=await page({local,url:''});await b.switch();a.emit('storage',{key:'elara.transport.auth'});await a.submit();assert(a.form.hidden);assert.equal(a.writes().length,0);assert.equal(b.writes().length,0);});
test('0057 two tabs: change during pending write retains original recipient even on late response',async()=>{const local=new Map(),a=await page({local}),b=await page({local,url:''}),gate=deferred(),started=deferred();a.state.putHook=async()=>{started.resolve();await gate.promise;};const p=a.submit();await started.promise;await b.switch();a.emit('storage',{key:'elara.transport.auth'});gate.resolve();await p;assert(a.writes().every(c=>c.subject===A));assert(!a.changes.includes(B));assert.equal(a.destination,undefined);});
test('0057 late operational response after session replacement never navigates',async()=>{const h=await page();h.state.rpcHook=async()=>{await h.switch();};await h.submit();assert.deepEqual(h.changes,[A]);assert(h.rpcs().every(c=>c.subject===A));assert.equal(h.destination,undefined);});
test('0057 page navigation aborts pending write and suppresses its late response',async()=>{const h=await page(),gate=deferred(),started=deferred();h.state.putHook=async()=>{started.resolve();await gate.promise;};const p=h.submit();await started.promise;h.emit('pagehide',{});gate.resolve();await p;assert.equal(h.destination,undefined);assert(h.form.hidden);assert(h.writes().every(c=>c.subject===A));});
test('0057 identity verification discrepancy is terminal before password update',async()=>{const h=await page();h.client.auth.getUser=async()=>({data:{user:user(B)}});await h.submit();assert(h.form.hidden);assert.equal(h.writes().length,0);await h.submit();assert.equal(h.writes().length,0);});
test('0057 password response for a different identity cannot announce success or be retried',async()=>{const h=await page();h.state.putIdentity=B;await h.submit();assert(h.form.hidden);assert.equal(h.destination,undefined);assert.equal(h.rpcs().length,0);assert(h.writes().every(c=>c.subject===A));await h.submit();assert.equal(h.writes().length,1);});
test('0057 unrelated storage events do not interrupt a valid invitation',async()=>{const h=await page();h.emit('storage',{key:'unrelated-preference'});await h.submit();assert.deepEqual(h.changes,[A]);assert.equal(h.destination,'index.html#dashboard');});
