/* 0057 user administration. Capability-gated, server-confirmed writes only. */
"use strict";
window.ElaraUsersAdmin = (() => {
  const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const auth=()=>window.ElaraAuth,client=()=>window.ElaraSupabase?.client;
  const scope=()=>{const a=auth(),u=a?.getCurrentUser?.();return JSON.stringify([u?.id,u?.supabaseUserId,u?.appSessionId,a?.getActiveContext?.(),client()?.supabaseUrl]);};
  const allowed=()=>Boolean(auth()?.getCurrentUser?.()&&auth()?.getActiveContext?.()==='superadmin'&&!$('usuarios').hidden);
  const labels={superadmin:'Superadmin',administrativo:'Administrativo',conductor:'Conductor'};
  const actions=['metadata','status','assign','revoke','invite'],availabilityContract='0057.availability.v1';
  let bound=false,availability={},availabilityScope=null,serial=0,editor=null,probe=0;
  const ready=action=>allowed()&&availabilityScope===scope()&&availability[action]===true;
  const unavailable=action=>action==='invite'?'Invitaciones pendientes de preparar la página de aceptación y el servicio de correo.':'Operación pendiente de activación administrativa.';
  function resetAvailability(){availability={};availabilityScope=null;}
  function paintAvailability(){
    if(!allowed())return;
    for(const button of document.querySelectorAll('[data-user-admin]')){const action=button.dataset.userAdmin;button.disabled=!ready(action);button.title=ready(action)?'':unavailable(action);}
    const button=$('primary-action');if(button?.dataset.usersAction==='invite'){button.disabled=!ready('invite');button.title=ready('invite')?'Invitar a un usuario':unavailable('invite');}
  }
  const pending=new Map();
  const errors={'55000':'Esta operaci\u00f3n todav\u00eda no est\u00e1 disponible. Actualiza Usuarios antes de continuar.','42501':'No tienes autorización para esta operación.','28000':'La sesión ya no es válida.','40001':'El usuario cambió. Cierra la ficha y actualiza antes de continuar.','23514':'La operación no es compatible con los roles, sesiones o vínculos actuales. Revisa el contexto alternativo y las restricciones de conductor.','23505':'Existe un conflicto de identidad, duplicidad o solicitud. Revisa antes de repetir.','22023':'Revisa los campos y el motivo obligatorio.','23503':'El registro relacionado ya no está disponible.','55P03':'El usuario está siendo modificado. Actualiza antes de continuar.'};
  const message=error=>errors[error?.code]||'No se pudo confirmar la operación. Comprueba su estado antes de iniciar otra.';
  async function rpc(name,args){const response=await client().rpc(name,args);if(response.error)throw response.error;return response.data;}
  function setStatus(text){if(editor&&$('users-admin-status'))$('users-admin-status').textContent=text;}
  function lock(value){if(!editor)return;editor.busy=value;for(const e of $('users-admin-form').querySelectorAll('input,select,textarea,button'))e.disabled=value;}
  function valid(e){return editor===e&&e.scope===scope()&&allowed()&&!$('users-admin-modal').hidden;}
  function close(force=false){if(editor?.busy&&!force)return;const old=editor;editor=null;serial++;if($('users-admin-modal'))$('users-admin-modal').hidden=true;if(old&&old.scope===scope()&&allowed()){if(old.context)$('user-detail-modal').hidden=false;if(old.opener?.isConnected)old.opener.focus({preventScroll:true});}}
  const input=(name,title,value='',type='text')=>`<label class="field"><span>${esc(title)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${name==='reason'?'required maxlength="1000"':''}></label>`;
  const select=(name,title,options,value)=>`<label class="field"><span>${esc(title)}</span><select name="${name}">${options.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  function init(){
    if(bound)return;bound=true;
    document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" id="users-admin-modal" role="dialog" aria-modal="true" aria-labelledby="users-admin-title" hidden><section class="modal modal--summary modal--user-detail"><header class="modal__header"><div><p class="panel__eyebrow">Usuarios</p><h2 id="users-admin-title">Administrar usuario</h2></div><div class="modal__header-actions"><button class="button button--compact button--muted" type="button" data-users-admin-close>Cerrar</button></div></header><form class="modal__body modal__body--summary user-detail-edit-form" id="users-admin-form"><div class="form-grid" id="users-admin-fields"></div><p class="form-help" id="users-admin-explanation"></p><label class="checkbox-field"><input type="checkbox" name="confirm" required> Confirmo la operación administrativa indicada</label><p id="users-admin-status" role="status" aria-live="polite"></p><div class="form-actions"><button class="button button--secondary" type="button" data-users-admin-close>Cancelar</button><button class="button button--primary" type="submit" id="users-admin-submit">Confirmar</button><button class="button button--secondary" type="button" id="users-admin-reconcile" hidden>Comprobar resultado</button></div></form></section></div>`);
    $('users-admin-form').addEventListener('submit',submit);
    $('users-admin-reconcile').addEventListener('click',reconcile);
    const modal=$('users-admin-modal');
    modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-users-admin-close]'))close();});
    modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){const nodes=[...modal.querySelectorAll('input,select,textarea,button')].filter(n=>!n.disabled&&!n.hidden&&!n.closest('[hidden]'));if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    $('primary-action').addEventListener('click',event=>{if(allowed()&&event.currentTarget.dataset.usersAction==='invite'&&!event.currentTarget.disabled)open('invite',null,event.currentTarget);});
    window.addEventListener('elara:auth-session-updated',()=>{resetAvailability();probe++;close(true);if(allowed())prepare();});
    if(window.MutationObserver)new window.MutationObserver(()=>{if(!allowed()){resetAvailability();probe++;close(true);}}).observe($('usuarios'),{attributes:true,attributeFilter:['hidden']});
  }
  async function prepare(){
    init();const own=scope(),ticket=++probe;resetAvailability();if(!allowed())return;
    const button=$('primary-action');button.hidden=false;button.textContent='Nuevo usuario';button.dataset.usersAction='invite';button.removeAttribute('data-modal-open');button.disabled=true;button.title='Invitación pendiente de despliegue backend.';
    paintAvailability();
    try{
      const control=await rpc('admin_get_user_control',{p_user_id:null});
      if(ticket!==probe||own!==scope()||!allowed())return;
      if(control?.contract!=='0057'||control.authorized!==true||control.availability_contract!==availabilityContract)return;
      for(const action of actions)availability[action]=action!=='invite'&&control.operations?.[action]===true;
      availabilityScope=own;paintAvailability();
      if(control.operations?.invite===true&&typeof control.callback_url==='string'){
        const response=await client()?.functions?.invoke('user-administration',{body:{action:'capabilities'}});
        if(ticket!==probe||own!==scope()||!allowed())return;
        const edge=response?.data;
        availability.invite=!response?.error&&edge?.contract==='0057'&&edge.availability_contract===availabilityContract&&edge.operations?.invite===true&&edge.callback_url===control.callback_url;
      }
    }catch{if(ticket===probe&&own===scope()){availability.invite=false;}}
    finally{if(ticket===probe&&own===scope())paintAvailability();}
  }
  function detail(user,roles,catalog,links){
    init();$('users-admin-detail-actions')?.remove();
    const box=document.createElement('div');box.id='users-admin-detail-actions';box.className='form-actions-inline';
    box.innerHTML=['metadata','status','assign','revoke'].map((action,i)=>`<button class="button button--compact button--secondary" type="button" data-user-admin="${action}" ${!ready(action)?'disabled title="'+esc(unavailable(action))+'"':''}>${['Información administrativa',user.status==='active'?'Inactivar acceso':'Activar acceso','Asignar rol','Revocar rol'][i]}</button>`).join('');
    box.addEventListener('click',event=>{const button=event.target.closest('[data-user-admin]');if(button&&!button.disabled&&ready(button.dataset.userAdmin))open(button.dataset.userAdmin,{user,roles,catalog,links},button);});
    $('user-detail-view').append(box);
  }
  async function open(action,context,opener){
    if(!ready(action)||editor?.busy)return;
    const own=scope(),opening=++serial;await prepare();
    if(opening!==serial||own!==scope()||!ready(action)||editor?.busy)return;
    const oldPending=pending.get(own);
    // One unresolved request per authenticated scope, across navigation and modal closures.
    editor={action,context,opener,scope:own,ticket:++serial,busy:false,operation:oldPending||null};const e=editor;
    $('user-detail-modal').hidden=true;$('users-admin-modal').hidden=false;
    $('users-admin-title').textContent=action==='invite'?'Nuevo usuario':'Administrar usuario';
    $('users-admin-fields').innerHTML='';$('users-admin-status').textContent='Comprobando contrato y estado actual…';
    $('users-admin-form').reset?.();$('users-admin-submit').hidden=false;$('users-admin-reconcile').hidden=true;
    if(oldPending){$('users-admin-explanation').textContent='Hay una solicitud anterior sin confirmar. Comprueba su resultado antes de continuar.';uncertain(e);return;}
    try{
      e.busy=true;const control=await rpc('admin_get_user_control',{p_user_id:context?.user.id||null});if(!valid(e))return;e.control=control;
      if(control.contract!=='0057')throw Error('Unavailable');
      let fields='';
      const current=context?.roles.filter(r=>r.status==='active'&&!r.revoked_at&&Date.parse(r.starts_at)<=Date.now()&&(!r.ends_at||Date.parse(r.ends_at)>Date.now())&&context.catalog.some(c=>c.key===r.role_key&&c.is_active))||[];
      const options=current.map(r=>[r.role_key,labels[r.role_key]||r.role_key]);
      if(action==='invite')fields=input('first_name','Nombre *')+input('last_name','Apellidos *')+input('email','Correo de invitación *','','email')+`<fieldset class="user-role-checkboxes"><legend>Roles autorizados</legend>${['superadmin','administrativo'].map(key=>`<label class="checkbox-field"><input type="checkbox" name="invite-role" value="${key}">${labels[key]}</label>`).join('')}</fieldset>`+select('default_context','Contexto predeterminado',[['administrativo','Administrativo'],['superadmin','Superadmin']],'administrativo')+input('note','Nota interna')+'<label class="checkbox-field"><input type="checkbox" name="confirm_existing"> Confirmo utilizar la identidad Auth existente si este correo ya la tiene</label>';
      if(action==='metadata')fields=input('note','Nota interna',control.note||'')+select('default_context','Contexto predeterminado',options,control.default_context);
      if(action==='status')fields=`<p>Se ${control.status==='active'?'inactivará':'activará'} el acceso funcional de ${esc(context.user.name)}. ${control.status==='active'?'Se cerrarán sus sesiones operativas.':''} La cuenta Auth y la ficha del conductor se conservan.</p>`;
      if(action==='assign')fields=select('role','Rol a asignar',context.catalog.filter(r=>r.is_active&&['superadmin','administrativo','conductor'].includes(r.key)&&!current.some(c=>c.role_key===r.key)).filter(r=>r.key!=='conductor'||context.links.some(l=>l.status==='active')).map(r=>[r.key,labels[r.key]]),'');
      if(action==='revoke')fields=select('role_id','Rol a revocar',current.filter(r=>r.role_key!=='conductor'||!context.links.some(l=>l.status==='active')).map(r=>[r.id,labels[r.role_key]||r.role_key]),'')+select('default_context','Contexto alternativo si se revoca el predeterminado',[['','Seleccionar'],...options],'');
      $('users-admin-fields').innerHTML=fields+input('reason','Motivo *');
      $('users-admin-explanation').textContent=action==='invite'?'El rol Conductor y su vinculación se gestionan desde el acceso al portal de Conductores (0051). No se modificará una persona existente.':action==='revoke'?'Los accesos de Conductor vinculados se revocan desde su flujo 0051. Las sesiones que utilicen el rol retirado se cerrarán.':'Los cambios se aplicarán únicamente después de la confirmación del servidor.';
      e.busy=false;setStatus('');$('users-admin-submit').disabled=false;$('users-admin-submit').textContent=action==='invite'?'Invitar usuario':'Confirmar';
      $('users-admin-fields').querySelector('input,select')?.focus({preventScroll:true});
    }catch(error){if(valid(e)){e.busy=false;setStatus(message(error));$('users-admin-submit').disabled=true;}}
  }
  function values(){const out={};for(const element of $('users-admin-fields').querySelectorAll('[name]')){if(element.type==='checkbox')out[element.name]=element.checked;else out[element.name]=element.value.trim();}return out;}
  async function submit(event){
    event.preventDefault();const e=editor;if(!e||e.busy||e.operation||!valid(e))return;
    lock(true);await prepare();if(!valid(e))return;lock(false);
    if(!ready(e.action)){setStatus(unavailable(e.action));$('users-admin-submit').disabled=true;return;}
    const v=values();if(!v.reason||!$('users-admin-form').querySelector('[name=confirm]').checked){setStatus('Completa el motivo y confirma la operación.');return;}
    let args,details;
    if(e.action==='invite'){
      const roles=[...$('users-admin-form').querySelectorAll('[name=invite-role]:checked')].map(n=>n.value);
      if(!v.first_name||!v.last_name||!/^\S+@\S+\.\S+$/.test(v.email)||!roles.includes(v.default_context)){setStatus('Completa identidad, correo y roles. El contexto predeterminado debe estar seleccionado como rol.');return;}
      details={email:v.email.toLowerCase(),first_name:v.first_name,last_name:v.last_name,roles,default_context:v.default_context,note:v.note||null,reason:v.reason,confirm_existing:Boolean(v.confirm_existing)};
    }else{
      const changes=e.action==='metadata'?{note:v.note||null,default_context:v.default_context}:e.action==='status'?{status:e.control.status==='active'?'inactive':'active'}:e.action==='assign'?{role:v.role}:{role_id:v.role_id,default_context:v.default_context||null};
      if((e.action==='assign'&&!v.role)||(e.action==='revoke'&&!v.role_id)){setStatus('No hay roles compatibles para esta operación.');return;}
      args={p_user_id:e.context.user.id,p_expected_version:e.control.version,p_action:e.action,p_changes:changes,p_reason:v.reason};
    }
    const id=window.crypto?.randomUUID?.();if(!id){setStatus('No se pudo crear un identificador seguro.');return;}
    e.operation={id,action:e.action,args:args?{...args,p_request_id:id}:null,details,scope:e.scope};pending.set(e.scope,e.operation);lock(true);setStatus('Enviando solicitud…');
    try{
      if(!valid(e))return;
      let result;
      if(e.action==='invite'){const response=await client().functions.invoke('user-administration',{body:{request_id:id,details}});if(response.error)throw response.error;result=response.data;if(result?.state==='failed'){pending.delete(e.scope);e.operation=null;if(valid(e)){lock(false);setStatus('La invitación fue rechazada antes de completarse. Revisa la identidad y los permisos.');}return;}}
      else result=await rpc('admin_manage_user',e.operation.args);
      if(!valid(e))return;
      if((e.action==='invite'&&result?.state==='applied'&&result.user_id)||(e.action!=='invite'&&result?.user_id===e.context.user.id&&result?.action===e.action))await success(e);
      else uncertain(e);
    }catch(error){
      if(!valid(e))return;
      if(errors[error?.code]){pending.delete(e.scope);e.operation=null;lock(false);setStatus(message(error));if(error.code==='40001')$('users-admin-submit').disabled=true;}
      else uncertain(e);
    }
  }
  function uncertain(e){if(!valid(e))return;lock(true);e.busy=false;$('users-admin-submit').hidden=true;$('users-admin-reconcile').hidden=false;$('users-admin-reconcile').disabled=false;for(const b of $('users-admin-modal').querySelectorAll('[data-users-admin-close]'))b.disabled=false;setStatus('Resultado pendiente de confirmación. No envíes una solicitud nueva; comprueba esta operación.');}
  async function reconcile(){
    const e=editor;if(!e?.operation||e.busy||!valid(e))return;e.busy=true;$('users-admin-reconcile').disabled=true;
    try{
      const result=await rpc('admin_get_user_request',{p_request_id:e.operation.id});if(!valid(e))return;
      if(result.state==='applied')return await success(e);
      await prepare();if(!valid(e))return;
      if(!ready(e.operation.action)){uncertain(e);setStatus(unavailable(e.operation.action)+' La solicitud anterior se conserva sin reenviar.');return;}
      if(e.operation.action==='invite'){
        const reply=await client().functions.invoke('user-administration',{body:{request_id:e.operation.id,details:e.operation.details}});if(!valid(e))return;
        if(!reply.error&&reply.data?.state==='applied')return await success(e);
      }
      if(e.operation.action!=='invite'&&result.state==='not_found'){
        // Explicit recovery repeats only this immutable UUID/payload after a receipt check.
        const replay=await rpc('admin_manage_user',e.operation.args);if(!valid(e))return;
        if(replay?.user_id===e.operation.args.p_user_id&&replay?.action===e.operation.args.p_action)return await success(e);
      }
      uncertain(e);if(result.state==='not_found')setStatus('El servidor aún no registra la solicitud. Conserva este intento y vuelve a comprobar; no se ha reenviado.');
    }catch{if(valid(e))uncertain(e);}
  }
  async function success(e){pending.delete(e.scope);e.operation=null;if(!valid(e))return;lock(true);setStatus('Operación confirmada por el servidor. Actualizando Usuarios…');e.busy=false;close(true);await window.ElaraUsers.showUsers();if(e.scope===scope()&&allowed())window.ElaraNotifications?.showToast?.('Operación de Usuarios confirmada.','success');}
  return {prepare,detail};
})();
