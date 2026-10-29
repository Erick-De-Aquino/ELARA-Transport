/* Only a validated invitation callback can expose password setup. No token logs. */
"use strict";
window.ElaraInviteAcceptance=(()=>{
 // Memory only: loaded before the SDK. Never persist the callback or its tokens.
 let callbackUrl=window.location?.href?new URL(window.location.href):null;
 const receiptKey='elara.invitation.continuation.v1';
 function readReceipt(){try{return JSON.parse(window.sessionStorage?.getItem(receiptKey)||'null');}catch{return null;}}
 function saveReceipt(receipt){try{if(receipt)window.sessionStorage?.setItem(receiptKey,JSON.stringify(receipt));else window.sessionStorage?.removeItem(receiptKey);}catch{/* A disabled tab store cannot grant continuation. */}}
 function sessionId(session){try{return JSON.parse(window.atob(session.access_token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).session_id||null;}catch{return null;}}
 async function confirmedSession(client){
  const r=await client.auth.getSession(),session=r.data?.session;
  if(r.error||!session?.user?.id)throw Error('Invitación no válida o caducada.');
  // getSession is SDK state; getUser confirms that exact bearer with Auth.
  const verified=await client.auth.getUser(session.access_token);
  if(verified.error||verified.data?.user?.id!==session.user.id)throw Error('Identidad no confirmada.');
  return session;
 }
 async function verifyCallback(client,url){
  const hash=new URLSearchParams(url.hash.slice(1)),query=url.searchParams;let session;
  if(hash.has('error')||query.has('error'))throw Error('Invitación no válida o caducada.');
  if(hash.get('type')==='invite'&&hash.get('access_token')&&hash.get('refresh_token')){
   const r=await client.auth.getSession();if(r.error)throw Error('Invitación no válida o caducada.');session=r.data?.session;
   // Never fall back to a pre-existing administrator session for a bad URL.
   if(!session||session.access_token!==hash.get('access_token'))throw Error('La sesión no corresponde a esta invitación.');
  }else if(query.get('token_hash')&&query.get('type')==='invite'){
   const r=await client.auth.verifyOtp({token_hash:query.get('token_hash'),type:'invite'});if(r.error)throw Error('Invitación no válida o caducada.');session=r.data?.session;
  }else if(query.get('code')){
   const r=await client.auth.exchangeCodeForSession(query.get('code'));if(r.error)throw Error('No se pudo verificar el enlace en este navegador.');session=r.data?.session;
  }else throw Error('Abre el enlace de invitación recibido por correo.');
  if(!session?.user?.id)throw Error('Invitación sin sesión confirmada.');
  const verified=await client.auth.getUser();if(verified.error||verified.data?.user?.id!==session.user.id)throw Error('Identidad no confirmada.');
  return session.user.id;
 }
 async function start(){
  const form=document.getElementById('invite-form'),status=document.getElementById('invite-status'),retry=document.getElementById('invite-retry'),client=window.ElaraSupabase?.client;
  let userId,busy=false,passwordDone=false,binding=null;
  try{
   if(!client)throw Error('Servicio de acceso no configurado.');
   const url=callbackUrl||new URL(window.location.href),hasCallback=Boolean(url.hash||url.search);
   if(hasCallback){
    saveReceipt(null);userId=await verifyCallback(client,url);
    const session=await confirmedSession(client);if(session.user.id!==userId)throw Error('La sesión cambió.');
    const sid=sessionId(session);
    if(sid){binding={userId,sessionId:sid,expiresAt:Date.now()+30*60*1000,passwordDone:false};saveReceipt(binding);}
   }else{
    // Tab-local UI continuation only, never a role or functional-access grant.
    const receipt=readReceipt();if(!receipt||receipt.expiresAt<=Date.now()||typeof receipt.passwordDone!=='boolean')throw Error('Abre el enlace de invitación recibido por correo.');
    const session=await confirmedSession(client);
    if(session.user.id!==receipt.userId||sessionId(session)!==receipt.sessionId||!receipt.sessionId)throw Error('La sesión cambió. Abre de nuevo tu invitación.');
    binding=receipt;userId=receipt.userId;passwordDone=receipt.passwordDone;
   }
   form.hidden=passwordDone;retry.hidden=!passwordDone;
   status.textContent=passwordDone?'Contraseña ya establecida. Revisa el acceso preparado por Administración.':'Invitación comprobada. Elige una contraseña de al menos 12 caracteres.';
  }
  catch(e){saveReceipt(null);form.hidden=true;retry.hidden=true;status.textContent=e.message;return;}
  finally{callbackUrl=null;window.history.replaceState(null,'',window.location.pathname);}
  async function checkIdentity(){
   const session=await confirmedSession(client);
   if(session.user.id!==userId||(binding&&(binding.expiresAt<=Date.now()||sessionId(session)!==binding.sessionId)))throw Error('La sesión cambió. Abre de nuevo tu invitación.');
  }
  async function enter(){
   await checkIdentity();
   const r=await client.rpc('initialize_app_session',{p_requested_context:'conductor'});
   if(r.error)throw Error('Contraseña establecida; Administración todavía debe completar o revisar tu acceso.');
   const row=Array.isArray(r.data)?r.data[0]:r.data;if(row?.active_context!=='conductor')throw Error('Contexto conductor no confirmado.');
   saveReceipt(null);
   window.location.replace('index.html#mis-servicios');
  }
  form.onsubmit=async e=>{
   e.preventDefault();if(busy)return;busy=true;form.querySelector('button').disabled=true;
   try{
    const password=form.elements.password.value;if(password.length<12||password!==form.elements.confirmation.value)throw Error('Las contraseñas deben coincidir y tener al menos 12 caracteres.');
    await checkIdentity();
    const r=await client.auth.updateUser({password});if(r.error)throw Error('No se pudo establecer la contraseña. Revisa los requisitos de seguridad.');
    passwordDone=true;if(binding){binding.passwordDone=true;saveReceipt(binding);}form.reset();form.hidden=true;await enter();
   }catch(error){status.textContent=error.message;retry.hidden=!passwordDone;}finally{busy=false;if(!passwordDone)form.querySelector('button').disabled=false;}
  };
  retry.onclick=async()=>{if(busy)return;busy=true;retry.disabled=true;try{await enter();}catch(e){status.textContent=e.message;}finally{busy=false;retry.disabled=false;}};
 }
 document.addEventListener('DOMContentLoaded',()=>{void start();});
 return Object.freeze({verifyCallback,start});
})();
