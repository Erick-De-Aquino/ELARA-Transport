/* Offline Auth transport, real pinned browser SDK. Download the public bundle to
 * TEMP once; set ELARA_SUPABASE_SDK_FILE to it. No real Auth requests are allowed.
 * ELARA_INVITE_SOURCE can point to the pre-fix source to demonstrate regression. */
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const sdk=fs.readFileSync(process.env.ELARA_SUPABASE_SDK_FILE,'utf8');
assert.equal(crypto.createHash('sha256').update(sdk).digest('hex'),'ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3');
const source=fs.readFileSync(process.env.ELARA_INVITE_SOURCE||'src/js/accept-invite.js','utf8');
const userId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',sid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user={id:userId,aud:'authenticated',role:'authenticated',email:'driver@example.invalid',invited_at:'2026-10-27T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{}};
const token=(id=userId,session_id=sid)=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,session_id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'local-signature'].join('.');
const access=token(),session=(access_token=access)=>({access_token,refresh_token:'local-refresh-only',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user});
const callback='#type=invite&access_token='+access+'&refresh_token=local-refresh-only&expires_in=3600&token_type=bearer';
const storage=map=>({getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)});
async function page({url=callback,existing,tab=new Map(),local=new Map(),sdkFirst=true,invalid=false,pending=false}={}){
 const {document,HTMLElement}=parseHTML(fs.readFileSync('src/accept-invite.html','utf8'));
 if(!Object.getOwnPropertyDescriptor(HTMLElement.prototype,'elements'))Object.defineProperty(HTMLElement.prototype,'elements',{get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(x=>[x.name||x.getAttribute('name'),x]));}});
 const form=document.getElementById('invite-form');form.reset=()=>form.querySelectorAll('input').forEach(x=>x.value='');
 if(existing)local.set('elara.transport.auth',JSON.stringify(existing));
 let location=new URL('https://elara.example.invalid/accept-invite.html'+url),updates=0,rpcs=0,destination;
 location.replace=v=>destination=v;
 const calls=[],sandbox={document,URL,URLSearchParams,Headers,Request,Response,AbortController,TextEncoder,TextDecoder,atob,btoa,crypto:crypto.webcrypto,WebSocket,setTimeout,clearTimeout,setInterval,clearInterval,console,localStorage:storage(local),sessionStorage:storage(tab),location,history:{replaceState(a,b,p){location.href=new URL(p,location).href;}},addEventListener(){},removeEventListener(){},navigator:{},fetch:async(input,init={})=>{
  const u=new URL(String(input));assert.equal(u.origin,'https://auth.example.invalid','No external Auth transport permitted');calls.push(u.pathname);
  const headers=new Headers(init.headers),bearer=headers.get('Authorization');
  if(invalid||bearer==='Bearer invalid')return new Response(JSON.stringify({msg:'Expired invitation',code:'bad_jwt'}),{status:401,headers:{'Content-Type':'application/json'}});
  if(init.method==='PUT')updates++;
  return new Response(JSON.stringify(user),{status:200,headers:{'Content-Type':'application/json'}});
 }};
 sandbox.window=sandbox;sandbox.self=sandbox;vm.createContext(sandbox);
 // The actual page loads acceptance before client initialization, even when
 // SDK initialization completes before its DOMContentLoaded handler executes.
 vm.runInContext(source,sandbox);vm.runInContext(sdk,sandbox);
 sandbox.ElaraConfig={supabase:{url:'https://auth.example.invalid',anonKey:'local-public-key',options:{auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:false,storageKey:'elara.transport.auth',storage:storage(local)}}}};
 vm.runInContext(fs.readFileSync('src/js/supabase.js','utf8'),sandbox);
 const client=sandbox.ElaraSupabase.client;
 client.rpc=async()=>{rpcs++;return pending?{error:{code:'28000'}}:{data:[{active_context:'conductor'}]};};
 if(sdkFirst){await client.auth.getSession();if(url===callback&&!invalid)assert.equal(location.hash,'','Real SDK must consume callback before acceptance starts');}
 await sandbox.ElaraInviteAcceptance.start();
 return {sandbox,client,form,tab,local,calls,get updates(){return updates},get rpcs(){return rpcs},get destination(){return destination},status:()=>document.getElementById('invite-status').textContent,retry:document.getElementById('invite-retry'),async submit(){form.elements.password.value=form.elements.confirmation.value='Local-password-123';await form.onsubmit({preventDefault(){}});}};
}
test('callback SDK real: SDK consumes first, clears hash, valid invitation shows password form',async()=>{
 const p=await page();assert.ok((await p.client.auth.getSession()).data.session);assert.equal(p.form.hidden,false,p.status());assert.equal(p.sandbox.location.hash,'');assert.ok(p.tab.size);assert.doesNotMatch([...p.tab.values()].join(''),/access_token|refresh_token|Local-password/);
});
test('callback SDK real: acceptance starts first and awaits SDK initialization',async()=>{const p=await page({sdkFirst:false});assert.equal(p.form.hidden,false,p.status());assert.equal(p.sandbox.location.hash,'');});
test('callback SDK real: existing administrative session without callback cannot enable form',async()=>{const p=await page({url:'',existing:session()});assert.equal(p.form.hidden,true);assert.equal(p.updates,0);assert.equal(p.rpcs,0);});
test('callback SDK real: existing normal driver session without callback cannot enable form',async()=>{const p=await page({url:'',existing:session(token(userId,'cccccccc-cccc-4ccc-8ccc-cccccccccccc'))});assert.equal(p.form.hidden,true);assert.equal(p.tab.size,0);});
test('callback SDK real: invalid or expired invitation fails closed and clears URL',async()=>{const p=await page({invalid:true});assert.equal(p.form.hidden,true);assert.match(p.status(),/válida|confirmada|corresponde/);assert.equal(p.sandbox.location.hash,'');assert.equal(p.tab.size,0);});
test('callback SDK real: reload before password remains bound to verified invitation session',async()=>{const p=await page();const reload=await page({url:'',tab:p.tab,local:p.local});assert.equal(reload.form.hidden,false,reload.status());});
test('callback SDK real: pending functional link reload only retries access, not password',async()=>{
 const p=await page({pending:true});await p.submit();assert.equal(p.updates,1);assert.equal(p.form.hidden,true);assert.equal(p.retry.hidden,false);assert.match(p.status(),/Administración/);
 const reload=await page({url:'',tab:p.tab,local:p.local,pending:true});assert.equal(reload.form.hidden,true);assert.equal(reload.retry.hidden,false);await reload.retry.onclick();assert.equal(reload.updates,0);assert.equal(reload.rpcs,1);
});
test('callback SDK real: completed acceptance clears continuation; reload cannot reopen form',async()=>{const p=await page();await p.submit();assert.equal(p.destination,'index.html#mis-servicios');assert.equal(p.tab.size,0);const reload=await page({url:'',tab:p.tab,local:p.local});assert.equal(reload.form.hidden,true);});
test('callback SDK real: another user or another session cannot reuse continuation',async()=>{
 for(const replacement of [token('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),token(userId,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')]){
  const p=await page();const next=session(replacement);if(replacement!==access&&JSON.parse(Buffer.from(replacement.split('.')[1],'base64url')).sub!==userId)next.user={...user,id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'};
  const reload=await page({url:'',tab:p.tab,existing:next});assert.equal(reload.form.hidden,true);assert.equal(reload.tab.size,0);assert.equal(reload.updates,0);
 }
});
test('callback SDK real: explicit callback error cannot fall back to a previous receipt',async()=>{const p=await page();const next=await page({url:'#error=access_denied&error_description=expired',tab:p.tab,local:p.local});assert.equal(next.form.hidden,true);assert.equal(next.tab.size,0);assert.equal(next.sandbox.location.hash,'');});
test('callback SDK real: changed identity before password submission cannot update password',async()=>{const p=await page();await p.client.auth.setSession({access_token:token(userId,'ffffffff-ffff-4fff-8fff-ffffffffffff'),refresh_token:'local-other-refresh'});await p.submit();assert.equal(p.updates,0);assert.equal(p.rpcs,0);});
test('callback wiring: early capture and pinned real SDK precede shared client initialization',()=>{const html=fs.readFileSync('src/accept-invite.html','utf8');assert.ok(html.indexOf('js/accept-invite.js')<html.indexOf('js/supabase.js'));assert.match(html,/@supabase\/supabase-js@2\.118\.0\/dist\/umd\/supabase.js/);assert.doesNotMatch(source,/console\.|localStorage|service_role/);});
