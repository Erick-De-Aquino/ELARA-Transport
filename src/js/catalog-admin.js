/* 0048 catalog wiring. Uses the existing authenticated client; no demo persistence. */
"use strict";
window.ElaraCatalogAdmin = (() => {
  const contracts = Object.freeze({
    customerCreate: ['admin_create_individual_customer', 'customer_id', true],
    customerStatus: ['admin_set_customer_status', 'customer_id'],
    driverCreate: ['admin_create_driver', 'driver_id', true],
    driverUpdate: ['admin_update_driver', 'driver_id'],
    vehicleCreate: ['admin_create_vehicle', 'vehicle_id', true],
    vehicleInactive: ['admin_inactivate_vehicle', 'vehicle_id'],
    document: ['admin_register_vehicle_document', 'document_id', true],
    assign: ['admin_assign_driver_vehicle', 'assignment_id', true],
    close: ['admin_close_driver_vehicle_assignment', 'assignment_id'],
  });
  const errors = {
    '28000': 'Sesión no válida; vuelve a autenticarte.',
    '42501': 'No tienes autorización administrativa para esta acción.',
    '23503': 'El registro relacionado ya no existe o no está disponible. Actualiza.',
    '23505': 'Existe un conflicto de duplicidad, vínculo o identificador de operación. Revisa antes de repetir.',
    '23514': 'La operación incumple una condición de estado, fechas o dependencias.',
    '22023': 'Falta un identificador de operación o hay un argumento no válido.',
    '0A000': 'Operación o contexto de ejecución no soportado por este contrato.',
  };
  const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
  const text = value => String(value ?? '').trim();
  const optional = value => text(value) || null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const op = () => window.ElaraOperationalData;
  function fail(message) { throw new Error(message); }
  function required(value, label) { return text(value) || fail(`Completa ${label}.`); }
  function id(value) { return uuid(value) ? value : fail('Identificador no válido.'); }
  function date(value) {
    if (!value) return null;
    const parsed=new Date(value+'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) fail('Fecha no válida.');
    return value;
  }
  function choice(value, allowed) { return allowed.includes(value) ? value : fail('Selecciona una opción válida.'); }
  function phone(v) { return text(v.phone) ? [text(v.countryCode), text(v.phone)].filter(Boolean).join(' ') : null; }
  function payload(action, v) {
    if (!contracts[action]) fail('Acción no disponible.');
    if (op().isQaRecord({notes:v.notes, internal_notes:v.internalNotes, observations:v.observations})) fail('No se permiten marcadores QA en el flujo operativo.');
    switch (action) {
      case 'customerCreate': return {p_first_name:required(v.firstName,'nombre'),p_last_name:required(v.lastName,'apellidos'),p_phone:phone(v),p_email:optional(text(v.email).toLowerCase()),p_notes:optional(v.notes),p_internal_notes:optional(v.internalNotes)};
      case 'customerStatus': return {p_customer_id:id(v.customerId),p_status:choice(v.status,['active','inactive']),p_reason:required(v.reason,'motivo')};
      case 'driverCreate': return {p_first_name:required(v.firstName,'nombre'),p_last_name:required(v.lastName,'apellidos'),p_driver_type:choice(({Chofer:'internal_driver',Colaborador:'external_collaborator'})[v.driverType] || v.driverType,['internal_driver','external_collaborator']),p_phone:phone(v),p_email:optional(text(v.email).toLowerCase()),p_license_expiration:date(v.license),p_observations:optional(v.observations),p_administrative_status:'active'};
      case 'driverUpdate': return {p_driver_id:id(v.driverId),p_reason:required(v.reason,'motivo'),p_administrative_status:v.status == null ? null : choice(v.status,['active','pending_documents','inactive']),p_license_expiration:date(v.license),p_observations:v.observations == null ? null : text(v.observations)};
      case 'vehicleCreate': return {p_plate:required(v.plate,'matrícula'),p_brand:required(v.brand,'marca'),p_model:required(v.model,'modelo'),p_ownership_type:'owned',p_manual_status:choice(v.manualStatus || 'available',['available','unavailable']),p_notes:optional(v.notes)};
      case 'vehicleInactive': return {p_vehicle_id:id(v.vehicleId),p_reason:required(v.reason,'motivo')};
      case 'document': {
        const issued=date(v.issued), expires=date(v.expires);
        if (issued && expires && issued>expires) fail('La emisión no puede ser posterior al vencimiento.');
        return {p_vehicle_id:id(v.vehicleId),p_document_type:choice(v.documentType,['insurance','itv','circulation_permit','vtc_license']),p_status:choice(v.status,['pending','valid','expiring_soon']),p_issued_at:issued,p_expires_at:expires,p_reference_number:optional(v.reference),p_notes:optional(v.notes),p_replaces_document_id:v.replaces ? id(v.replaces) : null,p_reason:v.replaces ? required(v.reason,'motivo del reemplazo') : optional(v.reason)};
      }
      case 'assign': return {p_driver_id:id(v.driverId),p_vehicle_id:id(v.vehicleId),p_started_at:null,p_notes:optional(v.notes)};
      case 'close': return {p_assignment_id:id(v.assignmentId),p_reason:required(v.reason,'motivo'),p_ended_at:null};
    }
  }
  function createRequestId() {
    const crypto = window.crypto;
    if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
    if (typeof crypto?.getRandomValues !== 'function') {
      fail('No hay un generador criptográfico de UUID disponible en este navegador.');
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  function operation(action) {
    if (!contracts[action]) fail('Acción no disponible.');
    return {action,requestId:contracts[action][2] ? createRequestId() : null,busy:false,sent:null,actor:null,result:null};
  }
  function remoteError(error) {
    const code = /^[0-9A-Z]{5}$/.test(error?.code || '') ? error.code : null;
    const failure = new Error(code ? `${errors[code] || 'La operación remota fue rechazada.'} [${code}]` : 'Resultado de transporte incierto. No se ha confirmado un rollback; conserva este intento y reintenta sin cambiar sus datos.');
    failure.code = code; failure.uncertain = !code; return failure;
  }
  function validateResult(action, args, data) {
    if (!Array.isArray(data) || data.length !== 1) return false;
    const r=data[0], key=contracts[action][1];
    if (!r || !uuid(r[key])) return false;
    const same = (a,b) => r[a] === args[b];
    switch(action) {
      case 'customerCreate': return uuid(r.person_id) && Boolean(r.customer_human_code) && r.status==='new';
      case 'customerStatus': return same('customer_id','p_customer_id') && same('status','p_status') && (r.status!=='inactive' || Boolean(r.inactive_at));
      case 'driverCreate': return uuid(r.person_id) && Boolean(r.driver_human_code) && r.administrative_status==='active' && r.availability_preference==='unavailable';
      case 'driverUpdate': return same('driver_id','p_driver_id') && ['active','pending_documents','inactive'].includes(r.administrative_status) && (!args.p_administrative_status || same('administrative_status','p_administrative_status')) && (r.administrative_status!=='inactive' || Boolean(r.inactive_at));
      case 'vehicleCreate': return Boolean(r.human_code && r.plate_normalized) && same('manual_operational_status','p_manual_status') && r.elara_approval_status==='not_required' && r.inactive_at===null;
      case 'vehicleInactive': return same('vehicle_id','p_vehicle_id') && Boolean(r.inactive_at) && r.manual_operational_status==='unavailable';
      case 'document': return same('vehicle_id','p_vehicle_id') && same('document_type_key','p_document_type') && same('status','p_status') && r.replaced_document_id===args.p_replaces_document_id;
      case 'assign': return same('driver_id','p_driver_id') && same('vehicle_id','p_vehicle_id') && r.status==='active' && Boolean(r.started_at);
      case 'close': return same('assignment_id','p_assignment_id') && r.status==='ended' && Boolean(r.started_at && r.ended_at);
    }
  }
  let writing = false;
  async function execute(attempt, values, refresh = async () => {}) {
    if (attempt.busy || writing) fail('Ya hay una operación en curso.');
    attempt.busy=true; writing=true;
    try {
      const auth=window.ElaraAuth, actor=auth?.getCurrentUser?.();
      if (!actor || !['administrativo','superadmin'].includes(auth.getActiveContext?.())) throw remoteError({code:'42501'});
      const actorId=actor.supabaseUserId || actor.id;
      if (!actorId) throw remoteError({code:'28000'});
      if (attempt.actor && attempt.actor!==actorId) fail('La sesión cambió. Cierra este intento y revisa el resultado anterior.');
      if (!attempt.result) {
        const args=payload(attempt.action,values);
        if (attempt.requestId) args.p_request_id=attempt.requestId;
        const serialized=JSON.stringify(args);
        if (attempt.sent && attempt.sent!==serialized) fail('El intento ya fue enviado. Revisa su resultado antes de iniciar una nueva operación con otros datos.');
        // A lost response may already have committed. Replay the same receipt even
        // if that success changed the document/link/status used by the precheck.
        if (!attempt.sent) await validateContext(attempt.action,args);
        if ((auth.getCurrentUser()?.supabaseUserId || auth.getCurrentUser()?.id)!==actorId || !['administrativo','superadmin'].includes(auth.getActiveContext?.())) throw remoteError({code:'28000'});
        attempt.sent=serialized; attempt.actor=actorId; attempt.rejected=false;
        let response;
        try { response=await window.ElaraSupabase.client.rpc(contracts[attempt.action][0],JSON.parse(serialized)); }
        catch (_) { throw remoteError(null); }
        if (!response) throw remoteError(null);
        if (response.error) { const error=remoteError(response.error); attempt.rejected=!error.uncertain; throw error; }
        if (!validateResult(attempt.action,args,response.data)) throw remoteError(null);
        attempt.result=response.data[0];
      }
      try { await refresh(attempt.result); return {row:attempt.result,refreshPending:false}; }
      catch (_) { return {row:attempt.result,refreshPending:true}; }
    } finally { attempt.busy=false; writing=false; }
  }
  const currentDocument = d => !d.replaced_at && !['replaced','annulled'].includes(d.status);
  async function context(action='assign') {
    await op().loadIdentity();
    const names=action==='assign'?['driver_vehicle_assignments','vehicle_documents','vehicle_document_types','vehicle_technical_incidents','vehicle_maintenance_records','vehicle_status_reasons']:
      action==='document'?['vehicle_documents','vehicle_document_types']:action==='close'?['driver_vehicle_assignments']:[];
    const rows=await Promise.all(names.map(n=>op().readAll(n,n==='vehicle_document_types'||n==='vehicle_status_reasons'?'key':'id')));
    const extra=Object.fromEntries(names.map((n,i)=>[n,rows[i].filter(op().isOperationalRecord)]));
    return {...extra,customers:op().getCollection('customers'),drivers:op().getCollection('drivers'),vehicles:op().getCollection('vehicles'),persons:op().getCollection('persons')};
  }
  function candidates(c) {
    const linked=(key,id)=>c.driver_vehicle_assignments.some(l=>l.status==='active' && l[key]===id);
    const today=new Date().toISOString().slice(0,10);
    return {
      drivers:c.drivers.filter(d=>d.administrative_status==='active' && !d.inactive_at && c.persons.some(p=>p.id===d.person_id && p.status==='active') && !linked('driver_id',d.id)),
      vehicles:c.vehicles.filter(v=>!v.inactive_at && v.manual_operational_status==='available' && (v.ownership_type==='owned'?v.elara_approval_status==='not_required':v.elara_approval_status==='approved') && !linked('vehicle_id',v.id) &&
        !c.vehicle_maintenance_records.some(m=>m.vehicle_id===v.id && m.status==='in_progress') &&
        !c.vehicle_technical_incidents.some(i=>i.vehicle_id===v.id && i.status==='open' && c.vehicle_status_reasons.some(r=>r.key===i.reason_key && r.is_active && r.blocks_operation)) &&
        c.vehicle_document_types.filter(t=>t.is_active && (v.ownership_type==='owned'?t.required_for_owned:t.required_for_external)).every(t=>c.vehicle_documents.some(d=>d.vehicle_id===v.id && d.document_type_key===t.key && currentDocument(d) && ['valid','expiring_soon'].includes(d.status) && (!t.expires_required || Boolean(d.expires_at)) && (!d.expires_at || d.expires_at>=today))))
    };
  }
  async function validateContext(action,a) {
    await op().loadIdentity();
    const find=(table,key)=>op().getCollection(table).find(r=>r.id===a[key]) || fail('Registro no operativo o no accesible. Actualiza.');
    if (action==='customerStatus') { const r=find('customers','p_customer_id'); if(r.customer_type!=='individual'||r.status==='blocked') fail('Lifecycle no disponible para este cliente.'); }
    if (action==='driverUpdate') { if(find('drivers','p_driver_id').administrative_status==='suspended') fail('Conductor suspendido: fuera de este contrato.'); }
    if (['vehicleInactive','document'].includes(action)) find('vehicles','p_vehicle_id');
    if (action==='document') {
      const types=await op().readAll('vehicle_document_types','key');
      const vehicle=find('vehicles','p_vehicle_id'), t=types.find(t=>t.key===a.p_document_type && t.is_active && (vehicle.ownership_type==='owned'?t.required_for_owned:t.required_for_external));
      if(!t || vehicle.inactive_at) fail('Tipo documental o vehículo no disponible.');
      if(['valid','expiring_soon'].includes(a.p_status) && ((t.expires_required&&!a.p_expires_at)||(a.p_expires_at&&a.p_expires_at<new Date().toISOString().slice(0,10)))) fail('El documento requiere un vencimiento real no caducado cuando corresponda.');
      const docs=(await op().related('vehicle_documents','vehicle_id',a.p_vehicle_id)).filter(d=>d.document_type_key===a.p_document_type && currentDocument(d));
      if(docs.length>1 || (docs[0]?.id || null)!==a.p_replaces_document_id) fail('El documento actual cambió. Actualiza antes de registrar o reemplazar.');
    }
    if(action==='assign') { const c=await context(), valid=candidates(c); if(!valid.drivers.some(d=>d.id===a.p_driver_id)||!valid.vehicles.some(v=>v.id===a.p_vehicle_id)) fail('Selecciona conductor y vehículo operativos elegibles sin vínculo activo.'); }
    if(action==='close') { const links=await op().readAll('driver_vehicle_assignments'); if(!links.some(l=>l.id===a.p_assignment_id && l.status==='active' && op().isOperationalRecord(l))) fail('Vínculo activo no operativo o no accesible.'); }
  }
  const labels={customerCreate:'Nuevo cliente individual',customerStatus:'Cambiar estado de cliente',driverCreate:'Nuevo conductor',driverUpdate:'Editar estado, licencia y observaciones',vehicleCreate:'Nuevo vehículo propio',vehicleInactive:'Inactivar vehículo',document:'Registrar / reemplazar metadatos documentales',assign:'Crear vínculo conductor–vehículo',close:'Cerrar vínculo'};
  const views={customers:'clientes',drivers:'colaboradores',vehicles:'vehiculos'};
  const modals={customers:'new-customer-modal',drivers:'new-collaborator-modal',vehicles:'new-vehicle-modal'};
  function input(name,label,value='',type='text',required=false) { return `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`; }
  function area(name,label,value='') { return `<label class="field"><span>${esc(label)}</span><textarea name="${name}">${esc(value)}</textarea></label>`; }
  function select(name,label,options,value='') { return `<label class="field"><span>${esc(label)}</span><select name="${name}" required><option value="">Selecciona…</option>${options.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`; }
  const statuses=[['active','Activo'],['pending_documents','Pendiente documentación'],['inactive','Inactivo']];
  function fields(action,r,c) {
    const personal=()=>input('firstName','Nombre','', 'text',true)+input('lastName','Apellidos','','text',true)+input('countryCode','Prefijo','+34')+input('phone','Teléfono','','tel')+input('email','Email','','email');
    switch(action) {
      case 'customerCreate': return personal()+area('notes','Notas de persona')+area('internalNotes','Notas internas del cliente');
      case 'customerStatus': return select('status','Estado',[['active','Activo'],['inactive','Inactivo']],r.status)+area('reason','Motivo obligatorio');
      case 'driverCreate': return personal()+select('driverType','Tipo',[['internal_driver','Chofer'],['external_collaborator','Colaborador']])+input('license','Vencimiento del permiso (opcional)','','date')+area('observations','Observaciones')+'<p>Alta activa; disponibilidad inicial no disponible. No crea acceso al portal.</p>';
      case 'driverUpdate': { const person=c.persons.find(p=>p.id===r.person_id)||{}; return `<p>${esc(op().personName(r.person_id))} · ${esc(r.driver_type)} · ${esc(person.phone)} · ${esc(person.contact_email)} · Identidad y contacto: solo lectura.</p>`+select('status','Estado',statuses,r.administrative_status)+input('license','Vencimiento; vacío conserva valor',r.license_expiration||'','date')+area('observations','Observaciones; vacío borra texto',r.observations||'')+area('reason','Motivo obligatorio'); }
      case 'vehicleCreate': return input('plate','Matrícula ES','','text',true)+input('brand','Marca','','text',true)+input('model','Modelo','','text',true)+select('manualStatus','Estado manual',[['available','Disponible'],['unavailable','No disponible']],'available')+area('notes','Notas')+'<p>Vehículo propio. Documentación se registra después; disponibilidad sujeta a validación.</p>';
      case 'vehicleInactive': case 'close': return area('reason','Motivo obligatorio');
      case 'document': return select('documentType','Tipo',c.vehicle_document_types.filter(t=>t.is_active && ['insurance','itv','circulation_permit','vtc_license'].includes(t.key) && (r.ownership_type==='owned'?t.required_for_owned:t.required_for_external)).map(t=>[t.key,t.name||t.key]))+select('status','Estado',[['pending','Pendiente'],['valid','Válido'],['expiring_soon','Próximo a vencer']])+input('issued','Emisión real','','date')+input('expires','Vencimiento real (si aplica)','','date')+input('reference','Referencia')+area('notes','Notas')+'<div data-catalog-replacement></div>'+area('reason','Motivo obligatorio si reemplaza')+'<p>Archivo físico no habilitado todavía.</p>';
      case 'assign': { const valid=candidates(c); return select('driverId','Conductor operativo',valid.drivers.map(d=>[d.id,op().personName(d.person_id)]),r?.driver_id||'')+select('vehicleId','Vehículo operativo elegible',valid.vehicles.map(v=>[v.id,v.plate_normalized]),r?.vehicle_id||'')+area('notes','Notas')+'<p>Inicio con hora del servidor. Sin transferencia automática.</p>'; }
    }
  }
  const loaders={};
  let dialog=null, opening=0;
  function button(action,label,id='') { return `<button type="button" class="button button--secondary" data-catalog-action="${action}" data-catalog-id="${esc(id)}">${esc(label)}</button>`; }
  function actions(module,r,links=[]) {
    if(module==='customers') return r.customer_type==='individual'&&r.status!=='blocked'?button('customerStatus','Activar / Inactivar',r.id):'';
    if(module==='drivers') return (r.administrative_status!=='suspended'?button('driverUpdate','Editar lifecycle',r.id):'')+button('assign','Asignar vehículo',r.id)+links.filter(l=>l.driver_id===r.id&&l.status==='active').map(l=>button('close','Cerrar vínculo',l.id)).join('');
    return (!r.inactive_at?button('vehicleInactive','Inactivar',r.id)+button('document','Registrar / Reemplazar documento',r.id)+button('assign','Asignar conductor',r.id):'')+links.filter(l=>l.vehicle_id===r.id&&l.status==='active').map(l=>button('close','Cerrar vínculo',l.id)).join('');
  }
  async function detailActions(module,r) {
    const links=module==='customers'?[]:(await op().readAll('driver_vehicle_assignments')).filter(op().isOperationalRecord);
    return `<div class="modal__actions">${actions(module,r,links)}</div>`;
  }
  function attach(module,reload) {
    loaders[module]=reload;
    const view=document.getElementById(views[module]), panel=view?.querySelector('[data-operational-panel]');
    if(!panel || view.hidden || panel.querySelector('[role="alert"]')) return false;
    if(!panel.querySelector('[data-catalog-toolbar]')) {
      const toolbar=document.createElement('div'); toolbar.dataset.catalogToolbar='';
      toolbar.innerHTML=button(({customers:'customerCreate',drivers:'driverCreate',vehicles:'vehicleCreate'})[module],({customers:'Nuevo cliente individual',drivers:'Nuevo conductor',vehicles:'Nuevo vehículo propio'})[module]); panel.prepend(toolbar);
    }
    const summary=document.getElementById('page-summary'); if(summary) summary.textContent='Catálogo real · QA/legacy excluido · Operaciones administrativas 0048';
    view.onclick=event=>{const b=event.target.closest('[data-catalog-action]');if(b) void open(module,b.dataset.catalogAction,b.dataset.catalogId);};
    return true;
  }
  async function refresh(module,row,action) {
    await op().loadIdentity();
    const key=contracts[action][1], entity=action==='document'?row.vehicle_id:action==='assign'?row.vehicle_id:row[key];
    if(action==='document') await op().related('vehicle_documents','vehicle_id',row.vehicle_id);
    const links=['assign','close','driverUpdate','vehicleInactive'].includes(action)?await op().readAll('driver_vehicle_assignments'):[];
    if(await loaders[module]()===false) fail('Recarga pendiente.');
    // Reopen the real detail by UUID through the operational renderer, never a mock index.
    const panel=document.getElementById(views[module])?.querySelector('[data-operational-panel]');
    if(panel) {
      panel.dataset.catalogLastSaved=entity;
      const closed=action==='close'?links.find(l=>l.id===row.assignment_id):null;
      const entityId=module==='drivers'?(row.driver_id || closed?.driver_id || entity):module==='vehicles'?(row.vehicle_id || closed?.vehicle_id || entity):entity;
      const index=op().getCollection(module).findIndex(r=>r.id===entityId);
      if(index>=0) {
        for(let page=0;page<Math.floor(index/25);page++) panel.querySelector('[data-operational-next]').click();
        const target=panel.querySelectorAll('[data-operational-detail]')[index%25];
        if(target) await panel.querySelector('[data-operational-results]').onclick({target});
      }
    }
  }
  async function open(module,action,entityId='') {
    if(writing || dialog?.attempt.busy) return;
    if(dialog?.attempt.sent && !dialog.attempt.result) { window.ElaraNotifications?.showToast('Resuelve o cierra el intento anterior antes de iniciar otra operación.','info'); return; }
    const ticket=++opening, modal=document.getElementById(modals[module]); if(!modal) return;
    modal.hidden=false;
    modal.innerHTML='<section class="modal"><div class="modal__body" role="status">Cargando opciones reales…</div></section>';
    try {
      const attempt=operation(action); dialog={attempt,modal};
      if(!window.ElaraAuth?.getCurrentUser?.() || !['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.())) throw remoteError({code:'42501'});
      const c=await context(action); if(ticket!==opening) return;
      const table=action==='customerStatus'?'customers':action==='driverUpdate'?'drivers':action==='close'?'driver_vehicle_assignments':'vehicles';
      let row=entityId?(c[table]||[]).find(r=>r.id===entityId):{};
      if(action==='assign') row=module==='drivers'?{driver_id:entityId}:{vehicle_id:entityId};
      if(!row) fail('Registro no operativo o no accesible.');
      modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="catalog-title"><header class="modal__header"><h2 id="catalog-title">${esc(labels[action])}</h2><button type="button" data-catalog-close>Cerrar</button></header><form class="modal__body" novalidate>${fields(action,row,c)}<p role="status" data-catalog-status></p><button type="submit" class="button button--primary">Confirmar</button><button type="button" data-catalog-close>Cancelar</button></form></section>`;
      const form=modal.querySelector('form'), status=form.querySelector('[data-catalog-status]');
      const replacement=()=>{const type=form.elements.documentType?.value;if(!type)return;const docs=c.vehicle_documents.filter(d=>d.vehicle_id===row.id&&d.document_type_key===type&&currentDocument(d));const box=form.querySelector('[data-catalog-replacement]');box.textContent=docs.length?`Reemplazo explícito del documento actual ${docs[0].id}. Motivo obligatorio.`:'Nuevo documento: no existe documento actual de este tipo.';};
      form.elements.documentType?.addEventListener('change',replacement); replacement();
      modal.onclick=event=>{if(event.target.closest('[data-catalog-close]')&&!attempt.busy){if(attempt.sent&&!attempt.result&&!attempt.rejected){status.textContent='Intento enviado: conserva este formulario para reintentar. No cambies los datos ni inicies otra alta hasta revisar el resultado.';return;}++opening;modal.hidden=true;dialog=null;}};
      form.onsubmit=async event=>{
        event.preventDefault(); if(attempt.busy || writing) return;
        const controls=Array.from(form.querySelectorAll('input,select,textarea,button')); const values=attempt.sent ? {...attempt.values} : Object.fromEntries(new FormData(form));
        if(!form.checkValidity()){form.reportValidity();return;}
        if(action==='customerStatus') values.customerId=row.id;
        if(action==='driverUpdate') values.driverId=row.id;
        if(['vehicleInactive','document'].includes(action)) values.vehicleId=row.id;
        if(action==='close') values.assignmentId=row.id;
        if(action==='document') values.replaces=c.vehicle_documents.find(d=>d.vehicle_id===row.id&&d.document_type_key===values.documentType&&currentDocument(d))?.id||null;
        attempt.values={...values};
        controls.forEach(el=>el.disabled=true);status.textContent='Enviando…';
        try {
          const result=await execute(attempt,values,r=>refresh(module,r,action));
          status.textContent=result.refreshPending?'Guardado; actualización pendiente.':'Guardado correctamente. Listado actualizado.';
          if(!result.refreshPending) window.ElaraNotifications?.showToast('Guardado correctamente.','success');
        } catch(error) { status.textContent=error.message; }
        finally {
          controls.forEach(el=>el.disabled=false);
          if(attempt.sent&&!attempt.result) controls.filter(el=>!['BUTTON'].includes(el.tagName)).forEach(el=>el.disabled=true);
          if(attempt.result) {form.querySelector('[type="submit"]').textContent='Actualizar lectura';controls.filter(el=>el.tagName!=='BUTTON').forEach(el=>el.disabled=true);}
        }
      };
    } catch(error) {modal.innerHTML=`<section class="modal"><div class="modal__body"><p role="alert">${esc(error.message)}</p><button type="button" data-catalog-close>Cerrar</button></div></section>`;modal.onclick=e=>{if(e.target.closest('[data-catalog-close]')){modal.hidden=true;dialog=null;}};}
  }
  return Object.freeze({operation,payload,execute,remoteError,validateResult,candidates,currentDocument,attach,detailActions,open});
})();
