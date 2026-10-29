const{test}=require('node:test'),assert=require('assert/strict'),{randomUUID}=require('crypto'),fs=require('fs');
const origin='http://127.0.0.1:54421';
async function setup(options={}){
 const{createDriverPortalHandler}=await import('../supabase/functions/driver-portal-access/core.mjs');
 const calls=[],user={id:randomUUID(),email:'driver@example.invalid'},body={request_id:randomUUID(),driver_id:randomUUID(),email:user.email,email_confirmation:user.email,reason:'Controlled local test',confirm_existing:false};
 let candidate=options.existing?user.id:null,linked=false,failLink=options.failLink;
 const deps={allowedOrigins:[origin],getUser:async()=>({id:randomUUID()}),getAuthUser:async id=>{calls.push('getAuthUser');return{...user,id}},invite:async()=>{calls.push('invite');candidate=user.id;return{...user,access_token:'must-never-return',refresh_token:'must-never-return'}},rpc:async(jwt,name,args)=>{
  calls.push(name);if(name==='admin_begin_driver_portal_access'){if(options.unauthorized)throw{code:'42501'};return{request_id:body.request_id,driver_id:body.driver_id};}
  if(name==='get_admin_driver_portal_access_context')return{state:linked?'pending':'pending',candidate_auth_user_id:candidate,linked_result:linked?{state:'linked'}:null,attempt:{owned:true}};
  if(failLink){failLink=false;throw{code:'23514'}}linked=true;return{state:'linked',driver_id:body.driver_id,app_user_id:randomUUID()};
 }};
 const operator=randomUUID();deps.getUser=async()=>({id:operator});
 const handler=createDriverPortalHandler(deps),request=(data=body,headers={})=>new Request(origin+'/functions/v1/driver-portal-access',{method:'POST',headers:{origin,authorization:'Bearer local-test-only',...headers},body:JSON.stringify(data)});
 return{handler,body,calls,user,request,deps};
}
test('0051 Edge: superadmin new email invites and links; response strips all Auth credentials',async()=>{
 const s=await setup(),r=await s.handler(s.request()),data=await r.json();assert.equal(data.state,'linked');assert.equal(s.calls.filter(x=>x==='invite').length,1);assert.doesNotMatch(JSON.stringify(data),/access_token|refresh_token|must-never-return|password/);assert.ok(s.calls.indexOf('admin_begin_driver_portal_access')<s.calls.indexOf('invite'));
});
test('0051 Edge: ordinary authenticated operator never reaches Auth Admin',async()=>{
 const s=await setup({unauthorized:true}),data=await(await s.handler(s.request())).json();assert.equal(data.code,'operator_not_authorized');assert.deepEqual(s.calls,['admin_begin_driver_portal_access']);
});
test('0051 Edge: existing identity requires explicit confirmation of the exact ID',async()=>{
 const s=await setup({existing:true});let r=await(await s.handler(s.request())).json();assert.equal(r.state,'requires_review');assert.equal(s.calls.includes('invite'),false);assert.equal(s.calls.includes('admin_link_driver_portal_access'),false);
 r=await(await s.handler(s.request({...s.body,approve_existing:true,expected_auth_user_id:randomUUID()}))).json();assert.equal(r.state,'requires_review');
 r=await(await s.handler(s.request({...s.body,approve_existing:true,expected_auth_user_id:s.user.id}))).json();assert.equal(r.state,'linked');assert.equal(s.calls.includes('invite'),false);
});
test('0051 Edge: Auth success plus DB failure remains recoverable, no deletion/second invitation',async()=>{
 const s=await setup({failLink:true});let r=await(await s.handler(s.request())).json();assert.equal(r.state,'pending');assert.equal(s.calls.filter(x=>x==='invite').length,1);
 r=await(await s.handler(s.request())).json();assert.equal(r.state,'requires_review');
 r=await(await s.handler(s.request({...s.body,approve_existing:true,expected_auth_user_id:s.user.id}))).json();assert.equal(r.state,'linked');assert.equal(s.calls.filter(x=>x==='invite').length,1);
});
test('0051 Edge: concurrent duplicate submit shares one invite; changed payload conflicts',async()=>{
 const s=await setup();let release;const gate=new Promise(r=>release=r),invite=s.deps.invite;s.deps.invite=async email=>{await gate;return invite(email)};
 const first=s.handler(s.request());await new Promise(r=>setTimeout(r,10));const second=s.handler(s.request());const changed=await s.handler(s.request({...s.body,reason:'different'}));assert.equal(changed.status,409);release();
 const out=await Promise.all([first,second]);assert.equal((await out[0].json()).state,'linked');assert.equal((await out[1].json()).state,'linked');assert.equal(s.calls.filter(x=>x==='invite').length,1);
});
test('0051 Edge: bad origin, missing JWT, wrong confirmation fail before privileged calls',async()=>{
 const s=await setup();assert.equal((await s.handler(s.request(s.body,{origin:'https://untrusted.invalid'}))).status,403);assert.equal((await s.handler(s.request(s.body,{authorization:''}))).status,401);assert.equal((await s.handler(s.request({...s.body,email_confirmation:'other@example.invalid'}))).status,400);assert.equal(s.calls.length,0);
});
test('0051 Edge: entrypoint uses fixed callback, caller JWT for DB and no external dependencies/logs',()=>{
 const source=fs.readFileSync('supabase/functions/driver-portal-access/index.ts','utf8');assert.match(source,/verify|callback/i);assert.match(source,/rpc:.*jwt/);assert.doesNotMatch(source,/console\.|deleteUser|npm:|jsr:/);assert.match(fs.readFileSync('supabase/config.toml','utf8'),/\[functions.driver-portal-access\]\s+verify_jwt = true/);
});
test('0051 Edge: actual HTTP adapter routes credentials only to intended endpoints',async()=>{
 const vm=require('vm'),{stripTypeScriptTypes}=require('node:module'),{createDriverPortalHandler}=await import('../supabase/functions/driver-portal-access/core.mjs');
 const operator=randomUUID(),driver=randomUUID(),auth=randomUUID(),key=randomUUID(),requests=[];let handler;
 const env={SUPABASE_URL:'https://project.example.invalid',SUPABASE_ANON_KEY:'local-public-key',SUPABASE_SERVICE_ROLE_KEY:'local-backend-key',ELARA_ALLOWED_ORIGINS:origin,ELARA_PORTAL_INVITE_REDIRECT_URL:origin+'/accept-invite.html'};
 const fetch=async(url,options)=>{requests.push({url,options});let data;if(url.endsWith('/auth/v1/user'))data={id:operator};else if(url.includes('/auth/v1/invite?'))data={user:{id:auth,email:'driver@example.invalid'}};else if(url.endsWith('/admin_begin_driver_portal_access'))data={request_id:key,driver_id:driver};else if(url.endsWith('/get_admin_driver_portal_access_context'))data={state:'pending',attempt:{owned:true},candidate_auth_user_id:null};else if(url.endsWith('/admin_link_driver_portal_access'))data={state:'linked',driver_id:driver};else throw Error('Unexpected HTTP endpoint');return new Response(JSON.stringify(data),{status:200});};
 const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/driver-portal-access/index.ts','utf8').replace(/^import[^\n]*\n/,''));vm.runInNewContext(source,{Deno:{env:{get:k=>env[k]},serve:h=>handler=h},createDriverPortalHandler,fetch,URL,AbortSignal,Error});
 const request=new Request(origin,{method:'POST',headers:{origin,authorization:'Bearer local-operator-session'},body:JSON.stringify({request_id:key,driver_id:driver,email:'driver@example.invalid',email_confirmation:'driver@example.invalid',reason:'Local adapter test'})});assert.equal((await(await handler(request)).json()).state,'linked');
 for(const r of requests){if(r.url.includes('/rest/v1/'))assert.equal(r.options.headers.Authorization,'Bearer local-operator-session');if(r.url.includes('/auth/v1/invite?')){assert.equal(r.options.headers.Authorization,'Bearer local-backend-key');assert.ok(r.url.includes(encodeURIComponent(env.ELARA_PORTAL_INVITE_REDIRECT_URL)));}}
});
