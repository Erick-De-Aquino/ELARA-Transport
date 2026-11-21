import { createUserAdministrationHandler } from './core.mjs';
const project=Deno.env.get('SUPABASE_URL'),publicKey=Deno.env.get('SUPABASE_ANON_KEY'),serverKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const redirect=Deno.env.get('ELARA_USER_INVITE_REDIRECT_URL');
const allowedOrigins=(Deno.env.get('ELARA_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
if(!project||!publicKey||!serverKey||!redirect||!allowedOrigins.length)throw new Error('User administration configuration missing.');
const callback=new URL(redirect);
if(!allowedOrigins.includes(callback.origin)||!callback.pathname.endsWith('/accept-user-invite.html')||callback.search||callback.hash||(callback.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(callback.hostname)))throw new Error('Invalid fixed invitation callback.');
async function call(path:string,bearer:string,key:string,method='GET',body?:unknown){
 const response=await fetch(project+path,{method,headers:{Authorization:'Bearer '+bearer,apikey:key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok)throw Object.assign(new Error('Upstream rejected.'),{code:typeof data?.code==='string'?data.code:String(response.status)});return data;
}
Deno.serve(createUserAdministrationHandler({allowedOrigins,callbackUrl:redirect,
 getUser:(jwt:string)=>call('/auth/v1/user',jwt,publicKey),
 rpc:(jwt:string,name:string,args:unknown)=>call('/rest/v1/rpc/'+name,jwt,publicKey,'POST',args),
 claim:(args:unknown)=>call('/rest/v1/rpc/admin_claim_user_invitation',serverKey,serverKey,'POST',args),
 invite:async(email:string)=>{const data=await call('/auth/v1/invite?redirect_to='+encodeURIComponent(redirect),serverKey,serverKey,'POST',{email});return data.user||data;},
}));
