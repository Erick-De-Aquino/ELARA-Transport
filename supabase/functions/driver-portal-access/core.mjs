// Pure orchestration boundary. Tests inject Auth Admin; this module has no secrets.
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
export function createDriverPortalHandler(deps){
 const flights=new Map();
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(!deps.allowedOrigins.includes(origin))return new Response(JSON.stringify({state:'failed',code:'origin_denied'}),{status:403,headers});
  headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';headers['Access-Control-Allow-Methods']='POST,OPTIONS';
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(request.method!=='POST')return reply({state:'failed',code:'method_denied'},405);
  const jwt=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!jwt)return reply({state:'failed',code:'authentication_required'},401);
  let body;
  try{const raw=await request.text();if(raw.length>8192)throw Error();body=JSON.parse(raw);}catch{return reply({state:'failed',code:'invalid_body'},400);}
  const b={request_id:body.request_id,driver_id:body.driver_id,email:String(body.email||'').trim().toLowerCase(),email_confirmation:String(body.email_confirmation||'').trim().toLowerCase(),reason:String(body.reason||'').trim(),confirm_existing:body.confirm_existing===true,approve_existing:body.approve_existing===true,expected_auth_user_id:body.expected_auth_user_id||null};
  if(!uuid(b.request_id)||!uuid(b.driver_id)||b.email!==b.email_confirmation||b.email.length>254||!b.reason||b.reason.length>1000)return reply({state:'failed',code:'invalid_input'},400);
  let operator;
  try{operator=await deps.getUser(jwt);if(!uuid(operator?.id))throw Error();}catch{return reply({state:'failed',code:'authentication_required'},401);}
  let begin;
  try{
    // The RPC checks the current app_session AND superadmin context/role, before
    // any Auth Admin operation. getUser alone is never authorization.
    begin=await deps.rpc(jwt,'admin_begin_driver_portal_access',{p_request_id:b.request_id,p_driver_id:b.driver_id,p_email:b.email,p_reason:b.reason,p_confirm_existing:b.confirm_existing});
  }catch(e){const denied=['42501','28000'].includes(e.code);return reply({state:['23505','23514'].includes(e.code)?'conflict':'failed',code:denied?'operator_not_authorized':'begin_rejected'},denied?403:409);}
  // Re-authorize even a duplicate request before sharing the in-flight result.
  const key=operator.id+'/'+begin.request_id,payload=JSON.stringify({...b,request_id:begin.request_id});
  if(flights.has(key)){const f=flights.get(key);if(f.payload!==payload)return reply({state:'conflict',code:'request_changed'},409);return reply(await f.promise);}
  const promise=(async()=>{
   try{
    const context=await deps.rpc(jwt,'get_admin_driver_portal_access_context',{p_driver_id:b.driver_id});
    if(context.state==='revoked'||context.attempt?.owned===false)return{state:'requires_review',code:'access_requires_review'};
    if(context.linked_result&&['active','pending'].includes(context.state))return{state:'linked',request_id:begin.request_id,driver_id:b.driver_id,portal_state:context.state};
    let identity=context.candidate_auth_user_id,existing=Boolean(identity);
    if(existing){
     if(!b.approve_existing||b.expected_auth_user_id!==identity)return{state:'requires_review',code:'confirm_existing_identity',expected_auth_user_id:identity,request_id:begin.request_id};
     const user=await deps.getAuthUser(identity);
     if(user?.id!==identity||String(user.email).toLowerCase()!==b.email)return{state:'conflict',code:'identity_changed'};
    }else{
     // No browser-provided callback URL; only the fixed server configuration.
     const invited=await deps.invite(b.email);
     identity=invited?.id;
     if(!uuid(identity))return{state:'pending',code:'invitation_not_confirmed',request_id:begin.request_id};
    }
    try{
     const linked=await deps.rpc(jwt,'admin_link_driver_portal_access',{p_request_id:begin.request_id,p_auth_user_id:identity,p_confirm_existing_identity:existing});
     if(linked?.state!=='linked'||linked.driver_id!==b.driver_id)return{state:'requires_review',code:'link_not_confirmed',request_id:begin.request_id};
     return{state:'linked',request_id:begin.request_id,driver_id:b.driver_id,app_user_id:linked.app_user_id};
    }catch(e){return{state:e.code==='23505'?'conflict':'pending',code:'functional_link_pending',request_id:begin.request_id,expected_auth_user_id:identity};}
   }catch{return{state:'pending',code:'reconcile_before_retry',request_id:begin.request_id};}
  })();
  flights.set(key,{payload,promise});
  try{return reply(await promise);}finally{flights.delete(key);}
 };
}
