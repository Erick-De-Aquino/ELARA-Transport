/* 0051 control plane. Stored payloads are transport envelopes, never balances. */
"use strict";
window.ElaraAdminControls=(()=>{
 let busy=false,dialog=null;
 const labels={none:'Sin acceso',pending:'Invitación pendiente',active:'Acceso activo',linked:'Acceso vinculado',requires_review:'Requiere revisión',revoked:'Revocado'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const actor=()=>window.ElaraAuth?.getCurrentUser?.()?.supabaseUserId||window.ElaraAuth?.getCurrentUser?.()?.id;
 const authorized=()=>Boolean(actor())&&window.ElaraAuth?.getActiveContext?.()==='superadmin';
 function check(expected=actor()){if(!authorized()||expected!==actor())throw Error('Se requiere la misma sesión de superadmin.');}
 async function rpc(name,args={}){const r=await window.ElaraSupabase.client.rpc(name,args);if(r?.error)throw Object.assign(new Error(r.error.message||'Operación rechazada.'),{code:r.error.code});if(r?.data==null)throw Error('Respuesta no confirmada.');return r.data;}
 const context=id=>rpc('get_admin_driver_portal_access_context',{p_driver_id:id});
 const centralContext=()=>rpc('get_admin_operational_central_context');
 const storageKey=(kind,id)=>`elara.0051/${actor()}/${kind}/${id}`;
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
 function restore(kind,id){check();const raw=window.sessionStorage.getItem(storageKey(kind,id));if(!raw)return null;try{const a=JSON.parse(raw);if(a.actor!==actor()||a.kind!==kind||a.id!==id||!uuid(a.payload?.request_id))throw Error();return a;}catch{throw Error('Intento local incompatible. Revisión de recibo requerida; no se permite otro envío.');}}
 function prepare(kind,id,payload){check();const old=restore(kind,id);if(old)return old;const a={actor:actor(),kind,id,payload:{request_id:window.crypto.randomUUID(),...payload}};window.sessionStorage.setItem(storageKey(kind,id),JSON.stringify(a));return a;}
 async function receipt(a){check(a.actor);return rpc('get_admin_control_receipt',{p_request_id:a.payload.request_id,p_scope:a.kind,p_phase:a.kind==='access'?'link':a.kind});}
 async function run(a,approval={}){
  if(busy)throw Error('Hay una operación en curso.');check(a.actor);busy=true;
  try{
   let result;
   if(a.kind==='access'){
    const c=await context(a.id);check(a.actor);if(c.state==='revoked')throw Error('Acceso revocado: requiere revisión separada.');
    const response=await window.ElaraSupabase.client.functions.invoke('driver-portal-access',{body:{...a.payload,...approval}});
    if(response?.error||!response?.data)throw Error('Resultado incierto. Conserva el intento y revisa el estado remoto.');
    result=response.data;
    if(!['pending','linked','requires_review','conflict','failed'].includes(result.state))throw Error('Respuesta no confirmada.');
   }else{
    const r=await receipt(a);check(a.actor);
    if(r.status==='applied')return {...r.result,audit_id:r.audit_id,replayed:true};
    if(r.status!=='not_found')throw Error('Estado de recibo incompatible.');
    if(a.kind==='central'){
     const c=await centralContext();check(a.actor);
     if(JSON.stringify(c.snapshot)!==JSON.stringify(a.payload.p_expected_snapshot))throw Object.assign(Error('Snapshot cambiado. Revisa de nuevo; no hay bypass.'),{code:'40001'});
     const {request_id,...args}=a.payload;result=await rpc('admin_initialize_operational_central',{p_request_id:request_id,...args});
    }else if(a.kind==='revoke')result=await rpc('admin_revoke_driver_portal_access',{p_request_id:a.payload.request_id,p_driver_id:a.id,p_reason:a.payload.reason});
    else throw Error('Operación no disponible.');
   }
   check(a.actor);return result;
  }finally{busy=false;}
 }
 function reset(){if(dialog){dialog.element.remove();dialog=null;}}
 function shell(title){reset();const previous=document.activeElement,element=document.createElement('div');element.className='modal-backdrop';element.innerHTML=`<section class="modal financial-close-modal" role="dialog" aria-modal="true" aria-labelledby="admin-control-title"><header class="modal__header"><h2 id="admin-control-title">${esc(title)}</h2><button type="button" data-control-close>Cerrar</button></header><div class="modal__body" data-control-body><p role="status" aria-live="polite">Consultando estado remoto…</p></div></section>`;document.body.append(element);dialog={element,previous};element.querySelector('[data-control-close]').onclick=()=>{if(!busy){reset();previous?.focus?.();}};element.querySelector('button').focus();return element;}
 const input=(name,label,type='text',value='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" required></label>`;
 const lock=(element,value)=>element.querySelectorAll('button,input,textarea').forEach(x=>x.disabled=value);
 async function openDriver(id){
  if(busy)return;check();const expected=actor(),element=shell('Acceso al portal conductor'),body=element.querySelector('[data-control-body]');
  try{
   const c=await context(id);check(expected);if(!element.isConnected)return;
   let attempt=restore('access',id);
   if(!attempt&&c.attempt){if(!c.attempt.owned)throw Error('Otro superadmin tiene un intento. Requiere revisión.');attempt=prepare('access',id,{request_id:c.attempt.request_id,driver_id:id,email:c.attempt.email,email_confirmation:c.attempt.email,reason:c.attempt.reason,confirm_existing:c.attempt.confirm_existing});}
   body.innerHTML=`<p>Estado remoto: ${esc(labels[c.state]||c.state)}</p><p>El alta en catálogo no concede acceso. La invitación y el vínculo se confirman por separado.</p>`;
   if(!['active','revoked'].includes(c.state)){
    const p=attempt?.payload||{};body.innerHTML+=`<form data-access-form>${input('email','Email','email',p.email)}${input('email_confirmation','Confirmar email','email',p.email_confirmation)}${input('reason','Motivo','text',p.reason)}<div data-identity-review></div><p role="status" aria-live="polite"></p><button type="submit">${attempt?'Reintentar el mismo intento':'Dar acceso al portal'}</button></form>`;
    const form=body.querySelector('[data-access-form]'),status=form.querySelector('[role="status"]'),review=form.querySelector('[data-identity-review]');let candidate=c.candidate_auth_user_id;
    const showReview=()=>{if(candidate)review.innerHTML=`<p>Identidad Auth existente: ${esc(candidate)}. Verifica que pertenece a este conductor.</p><label><input name="approve" type="checkbox">Confirmo explícitamente la identidad indicada</label>`;};showReview();
    const freeze=()=>{if(attempt)for(const name of ['email','email_confirmation','reason'])form.elements[name].disabled=true;};freeze();
    form.onsubmit=async event=>{
     event.preventDefault();if(busy)return;lock(element,true);let completed=false;
     try{
      check(expected);const email=form.elements.email.value.trim().toLowerCase(),confirmation=form.elements.email_confirmation.value.trim().toLowerCase(),reason=form.elements.reason.value.trim();
      if(!email||email!==confirmation||!reason)throw Error('Confirma el mismo email e indica el motivo.');
      if(!attempt)attempt=prepare('access',id,{driver_id:id,email,email_confirmation:confirmation,reason,confirm_existing:false});
      const approval=candidate&&form.elements.approve?.checked?{approve_existing:true,expected_auth_user_id:candidate}:{};
      const result=await run(attempt,approval);check(expected);
      if(result.state==='linked'){const remote=await context(id);check(expected);status.textContent=`Confirmado: ${labels[remote.state]||remote.state}.`;completed=true;}
      else{status.textContent=`${labels[result.state]||result.state}: ${result.code||'Revisar estado remoto.'}`;candidate=result.expected_auth_user_id||candidate;showReview();}
     }catch(e){status.textContent=e.message;}finally{lock(element,false);freeze();if(completed)form.querySelector('button').disabled=true;}
    };
   }
   if(c.state!=='revoked'&&c.state!=='none'){
    const form=document.createElement('form');form.innerHTML=`${input('reason','Motivo de revocación')}<p role="status"></p><button type="submit">Revocar acceso</button>`;body.append(form);
    form.onsubmit=async e=>{e.preventDefault();if(busy)return;lock(element,true);try{check(expected);const a=prepare('revoke',id,{reason:form.elements.reason.value.trim()});await run(a);await openDriver(id);}catch(error){form.querySelector('[role="status"]').textContent=error.message;}finally{if(element.isConnected)lock(element,false);}};
   }
  }catch(error){if(element.isConnected)body.textContent=error.message;}
 }
 async function openCentral(){
  if(busy)return;check();const expected=actor(),element=shell('Preparar central operativa'),body=element.querySelector('[data-control-body]');
  try{
   let attempt=restore('central','initialize');
   if(attempt){const r=await receipt(attempt);check(expected);if(r.status==='applied'){body.textContent=`Confirmado por recibo: old central ${r.result.old_status}; new central ${r.result.new_status}; ID ${r.result.new_id}; auditoría ${r.audit_id}.`;return;}if(r.status!=='not_found')throw Error('Recibo incompatible.');}
   const c=await centralContext();check(expected);if(!c.eligible)throw Error('La central activa no corresponde a la transición QA autorizada.');
   const s=c.snapshot,a=s.account,remittances=s.remittances||[];
   body.innerHTML=`<p>Central actual: ${esc(a.name)} · ID ${esc(a.id)} · ${esc(a.currency_code)} · apertura ${esc(a.opening_balance)} · movimientos ${s.movements.length}.</p><ul>${remittances.map(r=>`<li>${esc(r.id)} · ${esc(r.status)} · ${esc(r.declared_amount)} ${esc(r.currency_code)}</li>`).join('')}</ul><p>Las dos rendiciones QA conservarán su destino original y quedarán congeladas. No se transferirá saldo ni se modificarán sus registros. Nueva central activa EUR con apertura 0.</p><form>${input('name','Nombre de nueva central','text',attempt?.payload.p_new_name||'')}${input('reason','Motivo','text',attempt?.payload.p_reason||'')}<label><input name="ack" type="checkbox" required>Reconozco explícitamente las dos rendiciones QA pendientes y su congelación</label><p role="status" aria-live="polite"></p><button type="submit">Confirmar preparación de central operativa</button></form>`;
   const form=body.querySelector('form');if(attempt){form.elements.name.disabled=true;form.elements.reason.disabled=true;}
   form.onsubmit=async e=>{
    e.preventDefault();if(busy)return;lock(element,true);const status=form.querySelector('[role="status"]');
    try{
     check(expected);if(!form.elements.ack.checked)throw Error('Debes reconocer expresamente las rendiciones pendientes.');
     attempt=attempt||prepare('central','initialize',{p_expected_old_id:c.old_id,p_expected_snapshot:s,p_new_name:form.elements.name.value.trim(),p_reason:form.elements.reason.value.trim(),p_acknowledge_frozen_qa:true,p_currency_code:'EUR'});
     const result=await run(attempt);const r=await receipt(attempt);check(expected);if(r.status!=='applied')throw Error('Auditoría pendiente de comprobar.');
     status.textContent=`Confirmado: old central ${result.old_status}; new central ${result.new_status}; ID ${result.new_id}; auditoría ${r.audit_id}.`;
    }catch(error){status.textContent=error.message;if(error.code==='40001'){
      const review=document.createElement('button');review.type='button';review.textContent='Revisar snapshot nuevo';body.append(review);review.onclick=async()=>{try{const r=await receipt(attempt);if(r.status!=='not_found')throw Error('Existe recibo aplicado; no se permite otro intento.');window.sessionStorage.removeItem(storageKey('central','initialize'));await openCentral();}catch(e){status.textContent=e.message;}};
     }}finally{element.querySelector('[data-control-close]').disabled=false;}
   };
  }catch(error){if(element.isConnected)body.textContent=error.message;}
 }
 async function driverActions(id){if(!authorized())return '';try{const expected=actor(),c=await context(id);check(expected);return `<p>Portal: ${esc(labels[c.state]||c.state)}</p><button type="button" data-admin-control="driver" data-admin-id="${esc(id)}">${c.state==='active'?'Revisar / revocar acceso':'Dar acceso al portal'}</button>`;}catch{return '<p>Portal: requiere revisión; lectura no disponible.</p>';}}
 function attachCash(){if(!authorized())return;const panel=document.querySelector('#caja [data-operational-panel]');if(!panel||panel.querySelector('[data-admin-control="central"]'))return;const button=document.createElement('button');button.type='button';button.dataset.adminControl='central';button.textContent='Preparar central operativa';panel.prepend(button);}
 document.addEventListener('click',e=>{const b=e.target.closest?.('[data-admin-control]');if(!b)return;void(b.dataset.adminControl==='central'?openCentral():openDriver(b.dataset.adminId)).catch(error=>window.ElaraNotifications?.showToast(error.message,'error'));});
 document.addEventListener('keydown',e=>{if(!dialog)return;if(e.key==='Escape'&&!busy){const previous=dialog.previous;reset();previous?.focus?.();}if(e.key==='Tab'){const controls=[...dialog.element.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 return Object.freeze({authorized,context,centralContext,prepare,restore,receipt,run,openDriver,openCentral,driverActions,attachCash,reset});
})();
