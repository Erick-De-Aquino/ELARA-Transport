/* Invitation bearer is immutable for sensitive requests; shared Auth is observed only. */
"use strict";
window.ElaraUserInviteAcceptance=(()=>{
 let callback=window.location?.href?new URL(window.location.href):null,activeFlow=null;
 const changed='La sesi\u00f3n cambi\u00f3. La invitaci\u00f3n se ha detenido; abre de nuevo el enlace recibido.';
 function claims(token){
  try{return JSON.parse(window.atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw Error('Sesi\u00f3n de invitaci\u00f3n no v\u00e1lida.');}
 }
 function binding(session){
  if(!session?.user?.id||!session.access_token)throw Error('No se pudo confirmar la invitaci\u00f3n.');
  const payload=claims(session.access_token);
  if(payload.sub!==session.user.id||!payload.session_id||!Number.isFinite(payload.exp)||payload.exp*1000<=Date.now())throw Error('Invitaci\u00f3n no v\u00e1lida o caducada.');
  return Object.freeze({userId:session.user.id,sessionId:payload.session_id,token:session.access_token,expiresAt:payload.exp*1000});
 }
 const matches=(session,b)=>Boolean(session?.user?.id===b.userId&&session.access_token===b.token&&claims(session.access_token).session_id===b.sessionId);
 async function verify(client,url,check=()=>{},observe=()=>{}){
  const hash=new URLSearchParams(url.hash.slice(1)),query=url.searchParams;
  if(hash.has('error')||query.has('error'))throw Error('Invitaci\u00f3n no v\u00e1lida o caducada.');
  let session;
  if(query.get('type')==='invite'&&query.get('token_hash')){
   const r=await client.auth.verifyOtp({type:'invite',token_hash:query.get('token_hash')});check();
   if(r.error)throw Error('Invitaci\u00f3n no v\u00e1lida o caducada.');session=r.data?.session;
  }else if(hash.get('type')==='invite'&&hash.get('access_token')&&hash.get('refresh_token')){
   const r=await client.auth.getSession();check();if(r.error)throw Error('Invitaci\u00f3n no v\u00e1lida.');session=r.data?.session;
   if(session?.access_token!==hash.get('access_token'))throw Error('La sesi\u00f3n no corresponde a esta invitaci\u00f3n.');
  }else throw Error('Abre el enlace de invitaci\u00f3n recibido por correo.');
  const fixed=binding(session);observe(fixed);check();
  const user=await client.auth.getUser(fixed.token);check();
  if(user.error||user.data?.user?.id!==fixed.userId)throw Error('Identidad no confirmada.');
  const current=await client.auth.getSession();check();
  if(current.error||!matches(current.data?.session,fixed))throw Error(changed);
  return fixed;
 }
 async function start(){
  activeFlow?.cancel();
  const client=window.ElaraSupabase?.client,config=window.ElaraConfig?.supabase;
  const form=document.getElementById('user-invite-form'),status=document.getElementById('user-invite-status'),retry=document.getElementById('user-invite-retry');
  const controllers=new Set(),events=[];
  let fixed=null,cancelled=false,busy=false,passwordDone=false,subscription=null;
  let base='',publicKey='',storageKey='';
  const check=()=>{if(cancelled||activeFlow!==flow)throw Error(changed);if(fixed&&fixed.expiresAt<=Date.now()){cancel('Invitaci\u00f3n caducada. Abre un enlace v\u00e1lido.');throw Error(changed);}if(base&&(window.ElaraSupabase?.client!==client||window.ElaraConfig?.supabase!==config||client.supabaseUrl.replace(/\/$/,'')!==base||config.url.replace(/\/$/,'')!==base))throw Error(changed);};
  function clean(){subscription?.unsubscribe();window.removeEventListener('storage',storageChanged);window.removeEventListener('pagehide',leaving);}
  function cancel(message=changed){if(cancelled)return;cancelled=true;for(const c of controllers)c.abort();clean();form.reset();form.hidden=true;retry.hidden=true;status.textContent=message;}
  const flow={cancel};activeFlow=flow;
  const storageChanged=event=>{if(event.key===null||event.key===storageKey)cancel();};
  const leaving=()=>cancel();
  function authChanged(event,session){
   if(cancelled)return;
   if(event==='SIGNED_OUT'){cancel();return;}
   if(event==='INITIAL_SESSION')return;
   if(fixed){try{if(!matches(session,fixed))cancel();}catch{cancel();}}
   else events.push(session);
  }
  const observe=value=>{fixed=value;for(const session of events)if(!matches(session,fixed)){cancel();break;}events.length=0;};
  async function identity(){
   check();const current=await client.auth.getSession();check();if(current.error||!matches(current.data?.session,fixed))throw Error(changed);
   const verified=await client.auth.getUser(fixed.token);check();if(verified.error||verified.data?.user?.id!==fixed.userId)throw Error(changed);
   const latest=await client.auth.getSession();check();if(latest.error||!matches(latest.data?.session,fixed))throw Error(changed);
  }
  // These requests never read a replacement SDK session. Auth chooses the subject
  // of this exact validated bearer, never a browser-supplied target user ID.
  async function request(path,method,body){
   check();const controller=new AbortController();controllers.add(controller);
   const timer=setTimeout(()=>controller.abort(),15000);
   try{
    const response=await window.fetch(base+path,{method,headers:{Authorization:'Bearer '+fixed.token,apikey:publicKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer'});
    check();const data=await response.json();check();return {ok:response.ok,status:response.status,data};
   }finally{clearTimeout(timer);controllers.delete(controller);}
  }
  async function enter(){
   await identity();check();
   const r=await request('/rest/v1/rpc/initialize_app_session','POST',{p_requested_context:null});
   if(!r.ok)throw Error('Administraci\u00f3n todav\u00eda debe completar o revisar tu acceso.');
   const row=Array.isArray(r.data)?r.data[0]:r.data;
   if(!['superadmin','administrativo'].includes(row?.active_context))throw Error('No se confirm\u00f3 un contexto administrativo autorizado.');
   await identity();check();clean();window.location.replace('index.html#dashboard');
  }
  try{
   if(!client||!callback||!config?.url||!config.anonKey||!client.auth.onAuthStateChange)throw Error('Servicio de acceso no configurado.');
   base=config.url.replace(/\/$/,'');publicKey=config.anonKey;storageKey=config.options?.auth?.storageKey||client.auth.storageKey;
   check();subscription=client.auth.onAuthStateChange(authChanged).data.subscription;
   window.addEventListener('storage',storageChanged);window.addEventListener('pagehide',leaving);
   fixed=await verify(client,callback,check,observe);check();
   form.hidden=false;status.textContent='Invitaci\u00f3n comprobada. Elige una contrase\u00f1a de al menos 12 caracteres.';
  }catch(error){cancel(error.message);return;}
  finally{callback=null;window.history.replaceState(null,'',window.location.pathname);}
  form.onsubmit=async event=>{
   event.preventDefault();if(busy||passwordDone||cancelled)return;busy=true;form.querySelector('button').disabled=true;
   let sent=false;
   try{
    const password=form.elements.password.value;
    if(password.length<12||password!==form.elements.confirmation.value)throw Error('Las contrase\u00f1as deben coincidir y tener al menos 12 caracteres.');
    await identity();check();sent=true;
    const r=await request('/auth/v1/user','PUT',{password});
    if(!r.ok){if([400,422].includes(r.status)){sent=false;throw Error('La contrase\u00f1a no cumple los requisitos. Revisa e int\u00e9ntalo de nuevo.');}throw Error('No se pudo confirmar el cambio de contrase\u00f1a.');}
    if(r.data?.id!==fixed.userId)throw Error('La respuesta no corresponde a la identidad de la invitaci\u00f3n.');
    passwordDone=true;form.reset();form.hidden=true;await enter();
   }catch(error){
    if(cancelled)return;
    if(error.message===changed){cancel();return;}
    if(sent&&!passwordDone){cancel('No se pudo confirmar el resultado. No se reenviar\u00e1 el cambio; vuelve al inicio de sesi\u00f3n para comprobar el acceso de la cuenta invitada.');return;}
    status.textContent=error.message;retry.hidden=!passwordDone;
   }finally{busy=false;if(!passwordDone&&!cancelled)form.querySelector('button').disabled=false;}
  };
  retry.onclick=async()=>{if(busy||cancelled)return;busy=true;retry.disabled=true;try{await enter();}catch(error){if(!cancelled){if(error.message===changed)cancel();else status.textContent=error.message;}}finally{busy=false;retry.disabled=false;}};
 }
 document.addEventListener('DOMContentLoaded',()=>{void start();});
 return Object.freeze({verify:async(client,url)=>(await verify(client,url)).userId,start});
})();
