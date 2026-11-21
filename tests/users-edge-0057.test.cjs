const {test}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const origin='https://local.example.invalid';
async function fixture(overrides={}){
 const {createUserAdministrationHandler}=await import('../supabase/functions/user-administration/core.mjs');const calls=[],user=randomUUID(),session=randomUUID(),id=randomUUID();
 const deps={allowedOrigins:[origin],callbackUrl:origin+'/accept-user-invite.html',getUser:async()=>({id:user}),rpc:async(jwt,name,args)=>{calls.push({name,args});if(name==='admin_get_user_control')return{contract:'0057',manage:false,authorized:true,availability_contract:'0057.availability.v1',operations:{invite:true},callback_url:origin+'/accept-user-invite.html'};if(name==='admin_prepare_user_invitation')return{state:'prepared',session_id:session};return{state:'applied',user_id:id};},claim:async args=>{calls.push({name:'claim',args});return{send:true,email:'test@example.invalid'};},invite:async email=>{calls.push({name:'invite',email});return{id};},...overrides};
 const handler=createUserAdministrationHandler(deps),key=randomUUID(),details={email:'test@example.invalid'};
 const send=async(body={request_id:key,details},headers={origin,authorization:'Bearer isolated-test-token'})=>{const r=await handler(new Request('https://local.invalid/functions/v1/user-administration',{method:'POST',headers,body:JSON.stringify(body)}));return{status:r.status,body:await r.json()};};return {send,calls,deps,key,details,user,session};
}
test('0057 Edge checks user, SQL authorization and durable claim before invitation',async()=>{const h=await fixture();const r=await h.send();assert.equal(r.body.state,'applied');assert.deepEqual(h.calls.map(c=>c.name),['admin_get_user_control','admin_prepare_user_invitation','claim','invite','admin_complete_user_invitation']);assert.equal(h.calls[2].args.p_actor_auth_id,h.user);assert.equal(h.calls[2].args.p_actor_session_id,h.session);});
test('0057 Edge capabilities are read only and require authorization',async()=>{const h=await fixture();assert.equal((await h.send({action:'capabilities'})).body.operations.invite,true);assert.deepEqual(h.calls.map(c=>c.name),['admin_get_user_control']);});
test('0057 Edge forbidden origin, missing auth and malformed body never invite',async()=>{const h=await fixture();assert.equal((await h.send({}, {origin:'https://other.invalid'})).status,403);assert.equal((await h.send({}, {origin})).status,401);assert.equal((await h.send({})).status,400);assert.equal(h.calls.length,0);});
test('0057 Edge permission rejection occurs before privileged calls',async()=>{const h=await fixture({rpc:async()=>{throw{code:'42501'};}});assert.equal((await h.send()).status,403);assert.equal(h.calls.length,0);});
test('0057 Edge uncertain invitation is pending and never repeats without new claim',async()=>{let sends=0,claimed=false;const h=await fixture({claim:async()=>{if(claimed)return{send:false,state:'pending'};claimed=true;return{send:true,email:'test@example.invalid'};},invite:async()=>{sends++;throw Error('timeout after dispatch');}});assert.equal((await h.send()).body.state,'pending');assert.equal((await h.send()).body.state,'pending');assert.equal(sends,1);});
test('0057 Edge retry reconciles existing Auth identity without resending',async()=>{const identity=randomUUID();const h=await fixture({claim:async()=>({send:false,state:'reconcile',auth_user_id:identity})});assert.equal((await h.send()).body.state,'applied');assert(!h.calls.some(c=>c.name==='invite'));assert.equal(h.calls.at(-1).args.p_auth_user_id,identity);});
test('0057 Edge parallel attempts use durable dispatch claim',async()=>{let claimed=false,sends=0;const id=randomUUID();const h=await fixture({claim:async()=>{if(claimed)return{send:false,state:'pending'};claimed=true;return{send:true,email:'test@example.invalid'};},invite:async()=>{sends++;return{id};}});await Promise.all([h.send(),h.send()]);assert.equal(sends,1);});
test('0057 Edge completion failure remains pending without false success',async()=>{const h=await fixture();const base=h.deps.rpc;h.deps.rpc=async(...args)=>{if(args[1]==='admin_complete_user_invitation')throw Error('lost response');return base(...args);};assert.equal((await h.send()).body.state,'pending');});

test('0057 Edge installed but invitations not activated exposes only read-only readiness',async()=>{
 const h=await fixture();const original=h.deps.rpc;h.deps.rpc=async(...args)=>args[1]==='admin_get_user_control'?{...await original(...args),operations:{invite:false}}:original(...args);
 assert.equal((await h.send({action:'capabilities'})).body.operations.invite,false);assert.equal((await h.send()).body.code,'invitation_unavailable');assert(h.calls.every(c=>c.name==='admin_get_user_control'));
});
test('0057 Edge does not trust manage=true from an older availability contract',async()=>{
 const h=await fixture({rpc:async()=>({contract:'0057',manage:true})});assert.equal((await h.send()).body.code,'contract_unavailable');assert.equal(h.calls.length,0);
});
test('0057 Edge requires the runtime callback to match the server-approved URL',async()=>{
 const h=await fixture({callbackUrl:origin+'/different/accept-user-invite.html'});assert.equal((await h.send({action:'capabilities'})).body.operations.invite,false);assert.equal((await h.send()).body.code,'invitation_unavailable');assert(!h.calls.some(c=>c.name==='claim'||c.name==='invite'));
});
test('0057 Edge cannot send when activation is withdrawn before the durable claim',async()=>{
 const h=await fixture({claim:async()=>{throw {code:'55000'};}});assert.equal((await h.send()).body.state,'pending');assert(!h.calls.some(c=>c.name==='invite'||c.name==='admin_complete_user_invitation'));
});
