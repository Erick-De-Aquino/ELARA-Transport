// Auth Admin is injected only by the server runtime. No secrets or SDK in this core.
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export function createUserAdministrationHandler(deps){
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(!deps.allowedOrigins.includes(origin))return new Response(JSON.stringify({state:'failed',code:'origin_denied'}),{status:403,headers});
  Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'});
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({state:'failed',code:'method_denied'},405);
  const jwt=request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!jwt)return reply({state:'failed',code:'authentication_required'},401);
  let body,operator;
  try{const raw=await request.text();if(raw.length>8192)throw Error();body=JSON.parse(raw);if(body.action!=='capabilities'&&(!uuid(body.request_id)||!body.details||typeof body.details!=='object'||Array.isArray(body.details)))throw Error();}catch{return reply({state:'failed',code:'invalid_body'},400);}
  try{operator=await deps.getUser(jwt);if(!uuid(operator?.id))throw Error();}catch{return reply({state:'failed',code:'authentication_required'},401);}
  let control;
  try{control=await deps.rpc(jwt,'admin_get_user_control',{p_user_id:null});}
  catch{return reply({state:'failed',code:'operator_not_authorized'},403);}
  if(control?.contract!=='0057'||control.authorized!==true||control.availability_contract!=='0057.availability.v1')return reply({state:'failed',code:'contract_unavailable'},409);
  const available=control.operations?.invite===true&&typeof deps.callbackUrl==='string'&&control.callback_url===deps.callbackUrl;
  if(body.action==='capabilities')return reply({contract:'0057',availability_contract:'0057.availability.v1',operations:{invite:available},callback_url:available?deps.callbackUrl:null});
  if(!available)return reply({state:'failed',code:'invitation_unavailable'},409);
  let prepared;
  try{prepared=await deps.rpc(jwt,'admin_prepare_user_invitation',{p_request_id:body.request_id,p_details:body.details});}
  catch(e){const denied=['42501','28000'].includes(e.code);return reply({state:'failed',code:denied?'operator_not_authorized':'prepare_rejected'},denied?403:409);}
  if(prepared.state==='applied')return reply(prepared);
  try{
   const claim=await deps.claim({p_request_id:body.request_id,p_actor_auth_id:operator.id,p_actor_session_id:prepared.session_id});
   if(claim.state==='applied')return reply(claim.result);
   let identity=claim.auth_user_id;
   if(claim.send){
    // The DB claim is durable and one-shot across instances. Unknown delivery never resends.
    const invited=await deps.invite(claim.email);
    identity=invited?.id;
   }
   if(!uuid(identity))return reply({state:'pending',code:'reconcile_before_retry',request_id:body.request_id});
   const result=await deps.rpc(jwt,'admin_complete_user_invitation',{p_request_id:body.request_id,p_auth_user_id:identity});
   if(result?.state!=='applied'||!uuid(result.user_id))return reply({state:'pending',code:'completion_not_confirmed',request_id:body.request_id});
   return reply(result);
  }catch{return reply({state:'pending',code:'reconcile_before_retry',request_id:body.request_id});}
 };
}
