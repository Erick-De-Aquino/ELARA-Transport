/* 0048 catalog wiring. Uses the existing authenticated client; no demo persistence. */
"use strict";
window.ElaraCatalogAdmin = (() => {
  const contracts = Object.freeze({
    customerCreate: ['admin_create_individual_customer', 'customer_id', true],
    companyCreate: ['admin_create_company_customer', 'customer_id', true],
    contactAdd: ['admin_add_company_contact', 'company_contact_id', true],
    contactPrimary: ['admin_set_company_primary_contact', 'company_contact_id', true],
    contactUpdate: ['admin_update_company_contact', 'company_contact_id', true],
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
    '40001': 'Los contactos han cambiado. Actualiza la lectura antes de iniciar otro intento.',
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
  const validCustomerEmail = value => !text(value) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
  function phone(v) { return text(v.phone) ? [text(v.countryCode), text(v.phone)].filter(Boolean).join(' ') : null; }
  const customerCreation = action => ['customerCreate','companyCreate'].includes(action);
  const contactAction = action => ['contactAdd','contactPrimary','contactUpdate'].includes(action);
  const guardedAction = action => customerCreation(action)||contactAction(action)||['customerStatus','driverCreate','driverUpdate','vehicleCreate','vehicleInactive','document'].includes(action);
  const boundAction = action => action==='companyCreate'||contactAction(action)||action==='customerStatus';
  const version = value => Number.isSafeInteger(Number(value))&&Number(value)>0 ? Number(value) : fail('Versión no válida. Actualiza los contactos.');
  // 0055 is installed. Keep the configured/bound endpoint consistent across
  // asynchronous reads and immutable retries, for both local and remote clients.
  function companyBinding() {
    const configured=window.ElaraSupabase?.getPublicConfig?.()?.url;
    const bound=window.ElaraSupabase?.client?.supabaseUrl;
    return typeof configured==='string' && typeof bound==='string' && configured && configured.replace(/\/$/,'')===bound.replace(/\/$/,'') ? configured.replace(/\/$/,'') : null;
  }
  function payload(action, v) {
    if (!contracts[action]) fail('Acción no disponible.');
    if (op().isQaRecord({notes:v.notes, internal_notes:v.internalNotes, observations:v.observations})) fail('No se permiten marcadores QA en el flujo operativo.');
    switch (action) {
      case 'contactAdd': {
        let contact;
        if(v.contactMode==='existing') contact={mode:'existing',person_id:id(v.personId),role_label:optional(v.contactRole)};
        else {
          if(v.contactMode!=='new')fail('Selecciona una modalidad de contacto.');
          if(!validCustomerEmail(v.contactEmail))fail('Introduce un correo electrónico válido.');
          contact={mode:'new',first_name:required(v.contactFirstName,'nombre'),last_name:required(v.contactLastName,'apellidos'),phone:optional(v.contactPhone),email:optional(text(v.contactEmail).toLowerCase()),role_label:optional(v.contactRole)};
          if(!contact.phone&&!contact.email)fail('Indica teléfono o correo del contacto.');
        }
        return {p_customer_id:id(v.customerId),p_contact:contact,p_is_primary:choice(v.primary,['yes','no'])==='yes',p_notes:optional(v.notes)};
      }
      case 'contactPrimary': return {p_customer_id:id(v.customerId),p_company_contact_id:id(v.contactId),p_expected_version:version(v.version),p_expected_primary_contact_id:v.primaryId?id(v.primaryId):null,p_expected_primary_version:v.primaryId?version(v.primaryVersion):null,p_reason:required(v.reason,'motivo')};
      case 'contactUpdate': return {p_customer_id:id(v.customerId),p_company_contact_id:id(v.contactId),p_expected_version:version(v.version),p_patch:v.deactivate?{status:'inactive'}:{role_label:optional(v.contactRole),notes:optional(v.notes)},p_reason:required(v.reason,'motivo')};
      case 'companyCreate': {
        if (!validCustomerEmail(v.billingEmail)||(v.contactMode==='new'&&!validCustomerEmail(v.contactEmail))) fail('Introduce un correo electrónico válido.');
        const tax=required(v.taxId,'NIF/CIF').toUpperCase();
        let contact=null;
        if(v.contactMode && v.contactMode!=='none') {
          if(v.contactMode!=='new') fail('La selección de personas existentes todavía no está disponible.');
          contact={mode:'new',first_name:required(v.contactFirstName,'nombre del contacto'),last_name:required(v.contactLastName,'apellidos del contacto'),phone:optional(v.contactPhone),email:optional(text(v.contactEmail).toLowerCase()),role_label:optional(v.contactRole)};
          if(!contact.phone&&!contact.email) fail('Indica teléfono o correo del contacto.');
        }
        const args={p_legal_name:required(v.legalName,'razón social'),p_tax_id:tax,p_trade_name:optional(v.tradeName),p_billing_phone:optional(v.billingPhone),p_billing_email:optional(text(v.billingEmail).toLowerCase()),p_billing_address:optional(v.billingAddress),p_company_notes:optional(v.companyNotes),p_customer_internal_notes:optional(v.customerInternalNotes),p_customer_billing_notes:optional(v.customerBillingNotes),p_contact:contact};
        if(op().isQaRecord({notes:v.companyNotes,internal_notes:v.customerInternalNotes,observations:v.customerBillingNotes})) fail('No se permiten marcadores QA en el flujo operativo.');
        return args;
      }
      case 'customerCreate': {
        if (!validCustomerEmail(v.email)) fail('Introduce un correo electrónico válido.');
        return {p_first_name:required(v.firstName,'nombre'),p_last_name:required(v.lastName,'apellidos'),p_phone:phone(v),p_email:optional(text(v.email).toLowerCase()),p_notes:optional(v.notes),p_internal_notes:optional(v.internalNotes)};
      }
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
    if(contactAction(action)) {
      const r=data;
      if(!r||Array.isArray(r)||!uuid(r.company_contact_id)||!uuid(r.company_id)||!uuid(r.person_id)||r.customer_id!==args.p_customer_id||!Number.isSafeInteger(r.version)||r.version<1)return false;
      if(action!=='contactAdd'&&r.company_contact_id!==args.p_company_contact_id)return false;
      if(action==='contactAdd')return r.status==='active'&&r.is_primary===args.p_is_primary&&r.version===1&&(args.p_contact.mode!=='existing'||r.person_id===args.p_contact.person_id);
      if(action==='contactPrimary')return r.status==='active'&&r.is_primary===true&&r.previous_primary_contact_id===args.p_expected_primary_contact_id&&r.version>=args.p_expected_version;
      return r.version===args.p_expected_version+1&&(args.p_patch.status==='inactive'?r.status==='inactive'&&r.is_primary===false&&Boolean(r.ended_at):r.status==='active'&&typeof r.is_primary==='boolean');
    }
    if (!Array.isArray(data) || data.length !== 1) return false;
    const r=data[0], key=contracts[action][1];
    if (!r || !uuid(r[key])) return false;
    const same = (a,b) => r[a] === args[b];
    switch(action) {
      case 'companyCreate': return uuid(r.company_id) && /^EMP-\d{4,}$/.test(r.customer_human_code||'') && r.company_status==='active' && r.customer_status==='new' && (args.p_contact ? uuid(r.contact_person_id)&&uuid(r.company_contact_id) : r.contact_person_id===null&&r.company_contact_id===null);
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
  const customerTemplate = document.getElementById('new-customer-modal')?.innerHTML;
  const customerAttempts = new Map();
  const actorKey = () => { const u=window.ElaraAuth?.getCurrentUser?.(); return u?.supabaseUserId || u?.id; };
  const sessionScope = () => JSON.stringify([actorKey(),window.ElaraAuth?.getCurrentUser?.()?.appSessionId,window.ElaraAuth?.getActiveContext?.()]);
  let writing = false;
  async function execute(attempt, values, refresh = async () => {}, isCurrent = () => true) {
    const binding=boundAction(attempt.action)?companyBinding():null;
    if(boundAction(attempt.action)&&(!binding||(attempt.binding&&attempt.binding!==binding))) fail('La conexión de Supabase cambió. Actualiza antes de enviar este intento.');
    if (attempt.busy || writing) fail('Ya hay una operación en curso.');
    attempt.busy=true; writing=true;
    try {
      const auth=window.ElaraAuth, actor=auth?.getCurrentUser?.();
      if (!actor || !['administrativo','superadmin'].includes(auth.getActiveContext?.())) throw remoteError({code:'42501'});
      const actorId=actor.supabaseUserId || actor.id;
      const scope=sessionScope();
      const checkScope=()=>{
        if(guardedAction(attempt.action) && sessionScope()!==scope) fail('La sesión cambió. El intento se conserva para su revisión.');
        if(boundAction(attempt.action)&&companyBinding()!==binding)fail('La conexión de Supabase cambió. El intento se conserva para su revisión.');
      };
      if (!actorId) throw remoteError({code:'28000'});
      if (attempt.actor && attempt.actor!==actorId) fail('La sesión cambió. Cierra este intento y revisa el resultado anterior.');
      if (!attempt.result) {
        // 0048 status has neither request_id nor receipt: never replay an unknown write.
        if(['customerStatus','driverUpdate','vehicleInactive','close'].includes(attempt.action)&&attempt.sent&&!attempt.rejected)fail('Comprueba el estado por lectura. Este envío incierto no se repetirá automáticamente.');
        const args=payload(attempt.action,values);
        if (attempt.requestId) args.p_request_id=attempt.requestId;
        const serialized=JSON.stringify(args);
        if (attempt.sent && attempt.sent!==serialized) fail('El intento ya fue enviado. Revisa su resultado antes de iniciar una nueva operación con otros datos.');
        // A lost response may already have committed. Replay the same receipt even
        // if that success changed the document/link/status used by the precheck.
        if (!attempt.sent) await validateContext(attempt.action,args,attempt);
        if ((auth.getCurrentUser()?.supabaseUserId || auth.getCurrentUser()?.id)!==actorId || !['administrativo','superadmin'].includes(auth.getActiveContext?.())) throw remoteError({code:'28000'});
        checkScope();
        if(!isCurrent())fail('Contexto invalidado; no se ha enviado este intento.');
        if(boundAction(attempt.action)) {
          if(companyBinding()!==binding)fail('La conexión de Supabase cambió. Actualiza antes de enviar este intento.');
          attempt.binding=binding;
        }
        attempt.sent=serialized; attempt.actor=actorId; attempt.rejected=false;
        let response;
        try { response=await window.ElaraSupabase.client.rpc(contracts[attempt.action][0],JSON.parse(serialized)); }
        catch (_) { throw remoteError(null); }
        if (!response) throw remoteError(null);
        if (response.error) { const error=remoteError(response.error); attempt.rejected=!error.uncertain;
          if(attempt.action==='vehicleInactive'&&response.error.message==='Vehicle has a live link, service, maintenance or incident.')error.message='No se puede inactivar: hay un conductor vinculado, una asignación de servicio, mantenimiento en curso o una incidencia abierta.';
          if(attempt.action==='customerStatus'&&error.code==='23514') {
            if(response.error.message==='Customer has nonterminal services.')error.message='No se puede inactivar: el cliente tiene servicios pendientes o en curso.';
            if(response.error.message==='Customer requires an active person.')error.message='La persona asociada debe estar activa. Actualiza y revisa su situación.';
          }
          throw error;
        }
        if (!validateResult(attempt.action,args,response.data)) throw remoteError(null);
        attempt.result=contactAction(attempt.action)?response.data:response.data[0];
      }
      checkScope();
      if(!isCurrent())return {row:attempt.result,refreshPending:true};
      try { await refresh(attempt.result); checkScope(); return {row:attempt.result,refreshPending:false}; }
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
  async function validateContext(action,a,attempt={}) {
    await op().loadIdentity();
    const find=(table,key)=>op().getCollection(table).find(r=>r.id===a[key]) || fail('Registro no operativo o no accesible. Actualiza.');
    if(contactAction(action)) {
      const customer=find('customers','p_customer_id');
      if(customer.customer_type!=='company'||!['new','active'].includes(customer.status)||!op().getCollection('companies').some(c=>c.id===customer.company_id&&c.status==='active'))fail('La gestión de contactos no está disponible para este cliente.');
      const links=await op().related('company_contacts','company_id',customer.company_id);
      if(action==='contactAdd') {
        if(a.p_contact.mode==='existing'&&!op().getCollection('persons').some(p=>p.id===a.p_contact.person_id&&p.status==='active'))fail('Selecciona una persona activa y accesible.');
      } else if(!links.some(l=>l.id===a.p_company_contact_id&&l.status==='active'))fail('El vínculo activo ya no está disponible. Actualiza los contactos.');
    }
    if (action==='customerStatus') {
      const r=find('customers','p_customer_id');
      if(r.customer_type!=='individual'||!['new','active','inactive'].includes(r.status))fail('Este contrato solo permite activar o inactivar clientes particulares no bloqueados.');
      if(attempt.expectedStatus&&r.status!==attempt.expectedStatus)fail('El estado del cliente cambió. Actualiza la lectura antes de iniciar otro cambio.');
      if(r.person_id&&!op().getCollection('persons').some(p=>p.id===r.person_id&&p.status==='active'))fail('La persona asociada debe estar activa.');
      if(a.p_status==='inactive'&&attempt.expectedStatus&&(await op().related('services','customer_id',r.id)).some(s=>!['completed','cancelled','no_show','not_performed'].includes(s.operational_status)))fail('No se puede inactivar: el cliente tiene servicios pendientes o en curso.');
    }
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
  const labels={customerCreate:'Nuevo cliente',customerStatus:'Cambiar estado de cliente',driverCreate:'Nuevo conductor',driverUpdate:'Editar estado, licencia y observaciones',vehicleCreate:'Nuevo vehículo propio',vehicleInactive:'Inactivar vehículo',document:'Registrar / reemplazar metadatos documentales',assign:'Crear vínculo conductor–vehículo',close:'Cerrar vínculo'};
  const views={customers:'clientes',drivers:'colaboradores',vehicles:'vehiculos'};
  const modals={customers:'new-customer-modal',drivers:'new-collaborator-modal',vehicles:'new-vehicle-modal'};
  function input(name,label,value='',type='text',required=false) { return `<label class="field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''}></label>`; }
  function area(name,label,value='') { return `<label class="field"><span>${esc(label)}</span><textarea name="${name}">${esc(value)}</textarea></label>`; }
  function select(name,label,options,value='') { return `<label class="field"><span>${esc(label)}</span><select name="${name}" required><option value="">Selecciona…</option>${options.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`; }
  const statuses=[['active','Activo'],['pending_documents','Pendiente documentación'],['inactive','Inactivo']];
  function fields(action,r,c) {
    const personal=()=>input('firstName','Nombre','', 'text',true)+input('lastName','Apellidos','','text',true)+input('countryCode','Prefijo','+34')+input('phone','Teléfono','','tel')+input('email','Email','','email');
    switch(action) {
      case 'customerStatus': return select('status','Estado',[['active','Activo'],['inactive','Inactivo']],r.status)+area('reason','Motivo obligatorio');
      case 'driverCreate': return personal()+select('driverType','Tipo',[['internal_driver','Chofer'],['external_collaborator','Colaborador']])+input('license','Vencimiento del permiso (opcional)','','date')+area('observations','Observaciones')+'<p>Alta activa; disponibilidad inicial no disponible. No crea acceso al portal.</p>';
      case 'driverUpdate': { const person=c.persons.find(p=>p.id===r.person_id)||{}; return `<p>${esc(op().personName(r.person_id))} · ${esc(r.driver_type)} · ${esc(person.phone)} · ${esc(person.contact_email)} · Identidad y contacto: solo lectura.</p>`+select('status','Estado',statuses,r.administrative_status)+input('license','Vencimiento; vacío conserva valor',r.license_expiration||'','date')+area('observations','Observaciones; vacío borra texto',r.observations||'')+area('reason','Motivo obligatorio'); }
      case 'vehicleCreate': return input('plate','Matrícula ES','','text',true)+input('brand','Marca','','text',true)+input('model','Modelo','','text',true)+select('manualStatus','Estado manual',[['available','Disponible'],['unavailable','No disponible']],'available')+area('notes','Notas')+'<p>Vehículo propio. Documentación se registra después; disponibilidad sujeta a validación.</p>';
      case 'vehicleInactive': case 'close': return area('reason','Motivo obligatorio');
      case 'document': return select('documentType','Tipo',c.vehicle_document_types.filter(t=>t.is_active && ['insurance','itv','circulation_permit','vtc_license'].includes(t.key) && (r.ownership_type==='owned'?t.required_for_owned:t.required_for_external)).map(t=>[t.key,t.label_es||t.name||t.key]))+select('status','Estado',[['pending','Pendiente'],['valid','Válido'],['expiring_soon','Próximo a vencer']])+input('issued','Emisión real','','date')+input('expires','Vencimiento real (si aplica)','','date')+input('reference','Referencia')+area('notes','Notas')+'<div data-catalog-replacement></div>'+area('reason','Motivo obligatorio si reemplaza')+'<p>Archivo físico no habilitado todavía.</p>';
      case 'assign': { const valid=candidates(c); return select('driverId','Conductor operativo',valid.drivers.map(d=>[d.id,op().personName(d.person_id)]),r?.driver_id||'')+select('vehicleId','Vehículo operativo elegible',valid.vehicles.map(v=>[v.id,v.plate_normalized]),r?.vehicle_id||'')+area('notes','Notas')+'<p>Inicio con hora del servidor. Sin transferencia automática.</p>'; }
    }
  }
  const loaders={},refreshers={};
  let dialog=null, opening=0;
  function button(action,label,id='') { return `<button type="button" class="button button--secondary" data-catalog-action="${action}" data-catalog-id="${esc(id)}">${esc(label)}</button>`; }
  function actions(module,r,links=[]) {
    if(module==='customers') return r.customer_type==='individual'&&r.status!=='blocked'?button('customerStatus','Activar / Inactivar',r.id):'';
    if(module==='drivers') return (r.administrative_status!=='suspended'?button('driverUpdate','Editar lifecycle',r.id):'')+button('assign','Asignar vehículo',r.id)+links.filter(l=>l.driver_id===r.id&&l.status==='active').map(l=>button('close','Cerrar vínculo',l.id)).join('');
    return (!r.inactive_at?button('vehicleInactive','Inactivar',r.id)+button('document','Registrar / Reemplazar documento',r.id)+button('assign','Asignar conductor',r.id):'')+links.filter(l=>l.vehicle_id===r.id&&l.status==='active').map(l=>button('close','Cerrar vínculo',l.id)).join('');
  }
  async function detailActions(module,r) {
    const links=module==='customers'?[]:(await op().readAll('driver_vehicle_assignments')).filter(op().isOperationalRecord);
    return `<div class="modal__actions">${actions(module,r,links)}${module==='drivers' && r.administrative_status==='active' ? `<button type="button" class="button button--secondary" data-financial-kind="provision" data-financial-id="${esc(r.id)}">Preparar cuenta de efectivo del conductor</button>` : ''}${module==='drivers' ? await window.ElaraAdminControls?.driverActions(r.id)||'' : ''}</div>`;
  }
  function attach(module,reload,options={}) {
    refreshers[module]=options.refresh;
    loaders[module]=reload;
    const view=document.getElementById(views[module]), panel=view?.querySelector('[data-operational-panel]');
    if(!panel || view.hidden || panel.querySelector('[role="alert"]')) return false;
    if(!panel.querySelector('[data-catalog-toolbar]')) {
      const toolbar=document.createElement('div'); toolbar.dataset.catalogToolbar='';
      toolbar.innerHTML=button(({customers:'customerCreate',drivers:'driverCreate',vehicles:'vehicleCreate'})[module],({customers:'Nuevo cliente',drivers:'Nuevo conductor',vehicles:'Nuevo vehículo propio'})[module]); panel.prepend(toolbar);
    }
    const summary=document.getElementById('page-summary'); if(summary) summary.textContent='Catálogo real · QA/legacy excluido · Operaciones administrativas 0048';
    view.onclick=event=>{const b=event.target.closest('[data-catalog-action]');if(b) void open(module,b.dataset.catalogAction,b.dataset.catalogId);};
    return true;
  }
  async function refresh(module,row,action) {
    if(refreshers[module])return refreshers[module](row,action);
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
        // Customer cards expose code, name and detail buttons for the same UUID.
        const target=module==='customers'
          ? panel.querySelector(`[data-operational-detail][data-customer-id="${entityId}"]`)
          : panel.querySelectorAll('[data-operational-detail]')[index%25];
        if(target) await panel.querySelector('[data-operational-results]').onclick({target});
      }
    }
  }

  // The preserved individual form uses the same operation/execute contract.
  let customerDialog=null, customerBound=false;
  function invalidateCustomer() {
    const state=customerDialog;
    if(!state)return;
    customerDialog=null;state.observer?.disconnect();state.modal.hidden=true;state.modal.innerHTML='';
    if(state.scope===sessionScope()&&state.route===window.location?.hash&&!document.getElementById('clientes')?.hidden)state.previous?.focus?.({preventScroll:true});
    state.modal.onclick=null;state.modal.onkeydown=null;
  }
  function customerListState() {
    const panel=document.querySelector('#clientes [data-operational-panel]');
    return {query:panel?.querySelector('[data-operational-search]')?.value || '',
      filters:[...(panel?.querySelectorAll('[data-operational-filter]') || [])].map(el=>[el.dataset.operationalFilter,el.value]),
      page:Number(panel?.querySelector('[data-operational-page]')?.textContent.match(/Página (\d+)/)?.[1] || 1)};
  }
  function restoreCustomerList(state) {
    const panel=document.querySelector('#clientes [data-operational-panel]');
    if(!panel)return;
    for(const [key,value] of state.filters) {
      const select=panel.querySelector(`[data-operational-filter="${key}"]`);
      if(select){select.value=[...select.querySelectorAll('option')].some(o=>o.value===value)?value:'';select.onchange?.();}
    }
    const search=panel.querySelector('[data-operational-search]');
    if(search){search.value=state.query;search.oninput?.({target:search});}
    const next=panel.querySelector('[data-operational-next]');
    for(let page=1;page<state.page&&next&&!next.disabled;page++)next.onclick?.();
  }
  async function openCustomerCreate() {
    if(writing||dialog?.attempt.busy|| (dialog?.attempt.sent&&!dialog.attempt.result))return;
    closeContacts(false);invalidateCustomer();
    const modal=document.getElementById('new-customer-modal'),view=document.getElementById('clientes');
    if(!modal||!view||view.hidden)return;
    const owner=actorKey(),scope=sessionScope(),route=window.location?.hash;
    if(!owner||!['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.()))return;
    if(!customerBound){
      customerBound=true;
      window.addEventListener?.('hashchange',invalidateCustomer);
      window.addEventListener?.('elara:auth-session-updated',()=>{if(customerDialog?.scope!==sessionScope())invalidateCustomer();});
    }
    let attempt=customerAttempts.get(owner);
    try {if(!attempt || (!attempt.busy && (!attempt.sent || attempt.rejected))) {attempt=operation('customerCreate');customerAttempts.set(owner,attempt);}}
    catch(error){modal.hidden=false;modal.innerHTML='<section class="modal"><div class="modal__body"><p role="alert">'+esc(error.message)+'</p><button type="button" data-catalog-close>Cerrar</button></div></section>';modal.onclick=e=>{if(e.target.closest('[data-catalog-close]'))modal.hidden=true;};return;}
    const state={modal,scope,route,attempt,previous:document.activeElement};customerDialog=state;
    const current=()=>customerDialog===state&&sessionScope()===scope&&window.location?.hash===route&&!view.hidden&&!modal.hidden;
    modal.hidden=false;
    modal.innerHTML='<section class="modal modal--summary"><header class="modal__header"><h2>Nuevo cliente</h2><button type="button" data-catalog-close>Cerrar</button></header><div class="modal__body" role="status">Cargando opciones reales…</div></section>';
    modal.onclick=e=>{if(e.target===modal||e.target.closest('[data-catalog-close]')){e.stopPropagation?.();invalidateCustomer();}};
    modal.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();invalidateCustomer();}};
    if(window.MutationObserver){state.observer=new window.MutationObserver(()=>{if(!current())invalidateCustomer();});state.observer.observe(view,{attributes:true,attributeFilter:['hidden']});state.observer.observe(modal,{attributes:true,attributeFilter:['hidden']});}
    try {
      await context('customerCreate');if(!current()){if(customerDialog===state)invalidateCustomer();return;}
      modal.innerHTML=customerTemplate;
      const form=modal.querySelector('form'),status=form.querySelector('[data-catalog-status]');
      const controls=[...form.querySelectorAll('input,select,textarea,button')],submit=form.querySelector('[type="submit"]');
      let type=attempt.action==='companyCreate'?'company':'individual',pendingType=null;
      const groups=[...form.querySelectorAll('[data-customer-fields]')];
      const typeButtons=[...form.querySelectorAll('[data-customer-type]')];
      const confirmation=form.querySelector('[data-type-confirm]');
      const contact=form.querySelector('[name="contactMode"]');
      const contactFields=form.querySelector('[data-new-contact]');
      const defaults=new Map(controls.filter(el=>el.name).map(el=>[el,el.value]));
      const sync=()=>{
        for(const group of groups)group.hidden=group.dataset.customerFields!==type;
        contactFields.hidden=type!=='company'||contact.value!=='new';
        form.querySelector('[data-contact-requirement]').hidden=contactFields.hidden;
        for(const el of controls)el.disabled=el.tagName==='BUTTON'?attempt.busy:attempt.busy||Boolean(attempt.sent)||Boolean(el.closest('[hidden]'));
        for(const button of typeButtons){button.disabled=attempt.busy||Boolean(attempt.sent);button.checked=button.dataset.customerType===type;}
        let companyReady=true;
        if(type==='company') {
          companyReady=Boolean(companyBinding())&&(!attempt.binding||attempt.binding===companyBinding())&&Boolean(actorKey())&&['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.())&&current();
          if(!attempt.sent)try{payload('companyCreate',Object.fromEntries(new FormData(form)));}catch(_){companyReady=false;}
        }
        submit.disabled=attempt.busy||Boolean(pendingType)||(type==='company'&&(!companyReady||writing));
        form.querySelector('[data-company-validate]').disabled=attempt.busy||Boolean(attempt.sent)||Boolean(pendingType);
        confirmation.hidden=!pendingType;
        submit.textContent=attempt.result?'Actualizar lectura':attempt.sent?'Reintentar comprobación':'Guardar cliente';
      };
      if(attempt.values)for(const el of form.querySelectorAll('[name]'))if(!el.hasAttribute('data-customer-type')&&Object.hasOwn(attempt.values,el.name))el.value=attempt.values[el.name]??'';
      const switchType=next=>{
        if(!current()||attempt.sent||attempt.busy||writing)return;
        let replacement;
        try{replacement=operation(next==='company'?'companyCreate':'customerCreate');}catch(error){status.textContent=error.message;return;}
        for(const el of form.querySelectorAll('[name]')){
          if(el.hasAttribute('data-customer-type'))continue;
          el.value=defaults.get(el)||'';
          el.closest('.field')?.classList.remove('field--invalid');el.removeAttribute('aria-invalid');
        }
        attempt=replacement;state.attempt=attempt;customerAttempts.set(owner,attempt);
        type=next;pendingType=null;status.textContent='';sync();
        groups.find(g=>!g.hidden)?.querySelector('input')?.focus();
      };
      for(const button of typeButtons)button.onclick=()=>{
        if(!current()||attempt.sent||attempt.busy||writing||button.dataset.customerType===type){sync();return;}
        const dirty=controls.some(el=>el.name&&el.closest('[data-customer-fields]')?.dataset.customerFields===type&&text(el.value)!==text(defaults.get(el)));
        if(dirty){pendingType=button.dataset.customerType;sync();form.querySelector('[data-type-keep]').focus();}
        else switchType(button.dataset.customerType);
      };
      form.querySelector('[data-type-keep]').onclick=()=>{pendingType=null;sync();typeButtons.find(b=>b.dataset.customerType===type)?.focus();};
      form.querySelector('[data-type-discard]').onclick=()=>{if(pendingType)switchType(pendingType);};
      contact.onchange=()=>{if(!current()||attempt.sent||attempt.busy)return;if(!['none','new'].includes(contact.value))contact.value='none';sync();};
      if(attempt.sent)status.textContent=attempt.result?'Guardado; actualización pendiente.':'Intento pendiente: reintenta con los mismos datos para comprobar el resultado.';
      sync();
      form.oninput=e=>{
        e.target.closest('.field')?.classList.remove('field--invalid');e.target.removeAttribute('aria-invalid');
        if(type==='company'){sync();if(!submit.disabled&&!attempt.sent)status.textContent='';}
      };
      const submitCustomer=async (e,preview=false)=>{
        e.preventDefault();if(!current()||attempt.busy||writing||pendingType)return;
        const values=attempt.sent?{...attempt.values}:Object.fromEntries(new FormData(form));
        for(const el of form.querySelectorAll('[name]')){el.closest('.field')?.classList.remove('field--invalid');el.removeAttribute('aria-invalid');}
        if(!attempt.sent){
          let invalid=null;
          for(const el of form.querySelectorAll('input')){
            if(el.disabled)continue;
            const bad=(el.hasAttribute('required')&&!text(el.value))||(el.type==='email'&&!validCustomerEmail(el.value));
            if(bad){el.closest('.field').classList.add('field--invalid');el.setAttribute('aria-invalid','true');invalid ||= el;}
          }
          if(invalid){status.textContent=invalid.type==='email'?'Introduce un correo electrónico válido.':type==='individual'?'Completa nombre y apellidos.':'Completa los campos obligatorios.';invalid.focus();return;}
          try{payload(attempt.action,values);}catch(error){status.textContent=error.message;return;}
        }
        if(preview){status.textContent='Validación local correcta. No se han enviado datos.';return;}
        attempt.values={...values};
        status.textContent='Enviando…';
        const pending=execute(attempt,values,async ()=>{
          if(!current())throw Error('Contexto invalidado');
          if(type==='company'&&!attempt.listState)attempt.listState=customerListState();
          // Refresh only in the originating view/session; never reopen a detail.
          await op().loadIdentity();if(!current())throw Error('Contexto invalidado');
          if(await loaders.customers?.()===false)throw Error('Recarga pendiente');
          if(!current())throw Error('Contexto invalidado');
          if(type==='company'){restoreCustomerList(attempt.listState);attempt.listState=null;}
        },current);
        sync();
        try {const result=await pending;if(current()){status.textContent=result.refreshPending?'Guardado; actualización pendiente.':'Guardado correctamente. Listado actualizado.';if(!result.refreshPending)customerAttempts.delete(owner);}}
        catch(error){if(current())status.textContent=error.message;}
        finally{if(current())sync();}
      };
      form.onsubmit=e=>submitCustomer(e);
      form.querySelector('[data-company-validate]').onclick=()=>submitCustomer({preventDefault(){}},true);
      groups.find(g=>!g.hidden)?.querySelector('input')?.focus();
    } catch(error){if(current()){modal.querySelector('[role="status"]').textContent=error.message;}}
  }

  // 0048 status is a set operation without immutable receipts or expected-version input.
  // Keep unknown attempts per actor/customer; recovery is strictly read-only.
  const statusAttempts=new Map();
  async function openCustomerStatus(customerId,{container,isCurrent=()=>false,refresh=async()=>{}}={}) {
    if(!container||!isCurrent()||writing||!companyBinding()||!actorKey()||!['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.()))return;
    const scope=sessionScope(),binding=companyBinding(),key=actorKey()+'/'+id(customerId);
    const current=()=>scope===sessionScope()&&binding===companyBinding()&&isCurrent()&&container.isConnected;
    container.querySelector('[data-customer-status-panel]')?.remove();
    const box=document.createElement('section');box.dataset.customerStatusPanel='';box.className='new-customer-form__section';container.appendChild(box);
    let task=statusAttempts.get(key),row;
    if(task?.attempt.binding&&task.attempt.binding!==binding){box.innerHTML='<p role="alert">La conexión cambió. Revisa el intento en su proyecto de origen.</p>';return;}
    const load=async()=>{await op().loadIdentity({tables:['persons','companies','customers']});if(!current())fail('Contexto invalidado.');row=op().getCollection('customers').find(c=>c.id===customerId);if(!row)fail('Cliente no accesible.');};
    const allowed=()=>row?.customer_type==='individual'?({new:['active','inactive'],active:['inactive'],inactive:['active']}[row.status]||[]):[];
    const labels={active:'Activar cliente',inactive:'Inactivar cliente'};
    const read=async uncertain=>{
      if(!current()||writing)return;
      const status=box.querySelector('[data-status-message]');status.textContent='Actualizando lecturas…';
      for(const b of box.querySelectorAll('button'))b.disabled=true;
      try{
        await refresh({uncertain,beforeOpen:()=>{if(task&&uncertain)task.checked=true;}});
        if(task&&!uncertain)statusAttempts.delete(key);
      }catch(_){if(current()){status.textContent=task?.attempt.result?'Guardado; actualización pendiente. Reintenta solo la lectura.':'No se pudo comprobar el estado. No se ha reenviado la operación.';sync();}}
    };
    const sync=()=>{
      const sent=Boolean(task?.attempt.sent),busy=Boolean(task?.attempt.busy);
      for(const el of box.querySelectorAll('input,textarea,button'))el.disabled=busy;
      const reason=box.querySelector('[name=reason]');if(reason)reason.disabled=sent||busy;
      for(const b of box.querySelectorAll('[data-status-target]')){const chosen=task?.values.status===b.dataset.statusTarget;b.disabled=sent||busy;b.setAttribute('aria-pressed',String(chosen));b.className='button '+(chosen?'button--primary':'button--secondary');}
      const confirm=box.querySelector('[type=submit]');if(confirm){confirm.disabled=busy||sent||!task?.values.status;confirm.textContent=task?.values.status==='active'?'Confirmar activación':task?.values.status==='inactive'?'Confirmar inactivación':'Confirmar cambio';}
    };
    const render=()=>{
      if(!current())return;
      const pending=task?.attempt.sent;
      box.innerHTML=`<h3 class="modal__section-title">Estado del cliente</h3><p>Estado leído: ${esc(({new:'Nuevo',active:'Activo',inactive:'Inactivo',blocked:'Bloqueado'})[row.status]||'No disponible')}.</p>`+
        (pending?`<p role="status" data-status-message>${task.attempt.result?'Cambio confirmado; actualización de lecturas pendiente.':task.checked?'Lectura actualizada. No se puede atribuir con certeza el resultado del envío anterior; no se ha repetido.':'Respuesta incierta: el cambio puede haberse confirmado. Comprueba el estado sin repetir el envío.'}</p><button type="button" class="button button--secondary" data-status-read>${task.attempt.result?'Actualizar ficha y listado':'Comprobar estado (solo lectura)'}</button>${task.checked?'<button type="button" class="button button--secondary" data-status-new>Preparar otro cambio</button>':''}`:
          `<form class="new-customer-form__section" novalidate><div class="modal__actions">${allowed().map(target=>`<button type="button" class="button button--secondary" data-status-target="${target}">${labels[target]}</button>`).join('')}</div>${area('reason','Motivo obligatorio',task?.values.reason||'')}<p role="status" data-status-message>Selecciona una acción y explica el motivo.</p><div class="modal__actions"><button type="submit" class="button button--primary">Confirmar cambio</button><button type="button" class="button button--secondary" data-status-close>Cancelar</button></div></form>`);
      if(!allowed().length&&!pending){box.innerHTML='<p role="status">El contrato actual no permite cambiar el estado de este cliente.</p>';return;}
      box.onclick=async e=>{
        const target=e.target;e.stopPropagation?.();if(!current()||writing)return;
        if(target.closest('[data-status-close]')){if(!task?.attempt.sent){statusAttempts.delete(key);box.remove();}return;}
        if(target.closest('[data-status-read]')){await read(!task.attempt.result);return;}
        if(target.closest('[data-status-new]')){if(task.checked){statusAttempts.delete(key);task=null;await load();render();}return;}
        const choice=target.closest('[data-status-target]');
        if(choice&&!task?.attempt.sent&&allowed().includes(choice.dataset.statusTarget)){
          const reason=box.querySelector('[name=reason]').value;
          task={attempt:operation('customerStatus'),values:{customerId,status:choice.dataset.statusTarget,reason}};
          task.attempt.expectedStatus=row.status;statusAttempts.set(key,task);sync();
        }
      };
      const form=box.querySelector('form');if(form)form.onsubmit=async e=>{
        e.preventDefault();e.stopPropagation?.();if(!current()||writing||!task||task.attempt.busy||task.attempt.sent)return;
        task.values.reason=form.querySelector('[name=reason]').value;
        const status=box.querySelector('[data-status-message]');
        try{payload('customerStatus',task.values);}catch(error){status.textContent=error.message;return;}
        const pending=execute(task.attempt,task.values,()=>refresh({uncertain:false}),current);sync();status.textContent='Enviando cambio…';
        try{const result=await pending;if(!result.refreshPending)statusAttempts.delete(key);else if(current())render();}
        catch(error){if(current()){
          if(task.attempt.sent&&!task.attempt.rejected){render();}
          else{const message=error.message;statusAttempts.delete(key);task=null;try{await load();render();if(current())box.querySelector('[data-status-message]').textContent=message;}catch(_){if(current())box.innerHTML='<p role="alert">No se pudo actualizar el estado. Cierra y vuelve a consultar la ficha.</p>';}}
        }}
        finally{if(current())sync();}
      };
      sync();box.scrollIntoView?.({block:'nearest'});
    };
    box.innerHTML='<p role="status">Comprobando estado actual…</p>';
    try{await load();render();}catch(_){if(current())box.innerHTML='<p role="alert">No se pudo consultar el estado actual. Cierra y vuelve a abrir esta interacción.</p>';}
  }

  // 0056 uses the existing customer modal and shared execute/receipt machinery.
  const contactAttempts=new Map();
  let contactDialog=null,contactsBound=false;
  function closeContacts(refreshDetail=true) {
    const s=contactDialog;if(!s)return;
    contactDialog=null;s.observer?.disconnect();s.modal.hidden=true;s.modal.innerHTML='';
    s.modal.style.zIndex=s.zIndex;s.modal.setAttribute('aria-labelledby',s.labelledBy);delete s.modal.dataset.contactManager;
    s.modal.onclick=null;s.modal.onkeydown=null;
    if(!s.task?.attempt.sent)contactAttempts.delete(s.owner);
    if(refreshDetail&&s.parentCurrent()&&s.scope===sessionScope()) {
      s.previous?.focus?.({preventScroll:true});
      if(s.changed)void s.refreshDetail().catch(()=>{});
    }
  }
  async function openContacts(customerId,{isCurrent=()=>false,refreshDetail=async()=>{}}={}) {
    if(writing||dialog?.attempt.busy||customerDialog?.attempt.busy)return;
    const owner=actorKey(),scope=sessionScope();
    if(!owner||!companyBinding()||!['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.())||!isCurrent())return;
    const stored=contactAttempts.get(owner);
    if(stored?.attempt.sent&&!stored.attempt.rejected&&stored.customerId!==customerId){window.ElaraNotifications?.showToast('Hay un intento pendiente en otra empresa. Abre su ficha para comprobarlo.','info');return;}
    closeContacts(false);invalidateCustomer();
    const modal=document.getElementById('new-customer-modal');if(!modal)return;
    const state={modal,owner,scope,customerId,parentCurrent:isCurrent,refreshDetail,previous:document.activeElement,zIndex:modal.style.zIndex,labelledBy:modal.getAttribute('aria-labelledby'),changed:false,task:stored?.customerId===customerId&&stored.attempt.sent&&!stored.attempt.rejected?stored:null,contacts:[],persons:[]};
    contactDialog=state;modal.dataset.contactManager='';modal.style.zIndex='21';modal.setAttribute('aria-labelledby','company-contacts-title');modal.hidden=false;
    const current=()=>contactDialog===state&&state.scope===sessionScope()&&!modal.hidden&&isCurrent()&&Boolean(companyBinding())&&!document.getElementById('clientes')?.hidden;
    if(!contactsBound){contactsBound=true;window.addEventListener?.('hashchange',()=>closeContacts(false));window.addEventListener?.('elara:auth-session-updated',()=>{if(contactDialog?.scope!==sessionScope())closeContacts(false);});}
    if(window.MutationObserver){state.observer=new window.MutationObserver(()=>{if(contactDialog===state&&!current())closeContacts(false);});state.observer.observe(document.getElementById('clientes'),{attributes:true,attributeFilter:['hidden']});state.observer.observe(modal,{attributes:true,attributeFilter:['hidden']});const parent=document.getElementById('customer-detail-modal');if(parent)state.observer.observe(parent,{attributes:true,attributeFilter:['hidden']});}
    const shell=content=>{modal.innerHTML=`<section class="modal modal--summary modal--wizard"><header class="modal__header"><div><h2 id="company-contacts-title">Contactos de empresa</h2></div><button type="button" class="button button--compact button--muted" data-modal-close data-contacts-close>Cerrar</button></header><div class="modal__body modal__body--summary service-summary new-customer-form">${content}</div></section>`;};
    const read=async()=>{
      await op().loadIdentity({tables:['persons','companies','customers']});if(!current())fail('Contexto invalidado.');
      state.customer=op().getCollection('customers').find(c=>c.id===customerId);
      if(state.customer?.customer_type!=='company'||!['new','active'].includes(state.customer.status)||!op().getCollection('companies').some(c=>c.id===state.customer.company_id&&c.status==='active'))fail('La gestión de contactos no está disponible para este cliente.');
      state.contacts=await op().related('company_contacts','company_id',state.customer.company_id);
      state.persons=op().getCollection('persons').filter(p=>p.status==='active');
      if(!current())fail('Contexto invalidado.');
    };
    const primary=()=>state.contacts.find(c=>c.status==='active'&&c.is_primary);
    const start=(action,row=null,deactivate=false)=>{
      if(!current()||writing||state.task?.attempt.sent)return;
      const p=primary();const values={customerId,contactId:row?.id,version:row?.version,primaryId:p?.id||null,primaryVersion:p?.version||null,deactivate,
        contactMode:'new',primary:'no',contactRole:row?.role_label||'',notes:row?.notes||''};
      state.task={customerId,action,values,attempt:operation(action)};contactAttempts.set(owner,state.task);render();
    };
    const render=(message='')=>{
      if(!current())return;
      const task=state.task,active=state.contacts.filter(c=>c.status==='active');
      const rows=state.contacts.map(c=>{
        const person=op().getCollection('persons').find(p=>p.id===c.person_id),editable=c.status==='active'&&Number.isSafeInteger(c.version)&&c.version>0;
        const action=(name,label)=>`<button type="button" class="button button--secondary" data-contact-action="${name}" data-contact-id="${esc(c.id)}" ${task?.attempt.sent?'disabled':''}>${label}</button>`;
        return `<section class="new-customer-form__section"><h3 class="modal__section-title">${esc(person?op().personName(person.id):'Persona no disponible')}</h3><p>${esc(c.is_primary&&c.status==='active'?'Principal':c.status==='active'?'Secundario':'Inactivo')} · ${esc(c.role_label||'Sin cargo')}</p><p>${esc(person?.phone||'Sin teléfono')} · ${esc(person?.contact_email||'Sin correo')}</p>${c.notes?`<p>${esc(c.notes)}</p>`:''}${c.status==='inactive'?`<p>Vínculo finalizado: ${esc(c.ended_at?new Date(c.ended_at).toLocaleDateString('es-ES'):'Fecha no disponible')}</p>`:''}${editable?`<div class="modal__actions">${!c.is_primary&&person?.status==='active'?action('primary','Establecer principal'):''}${action('edit','Editar vínculo')}${action('deactivate','Desactivar')}</div>`:''}</section>`;
      }).join('');
      shell(`<p>${esc(op().customerName(state.customer))}. Los datos personales compartidos no se editan aquí.</p><p role="status" data-contacts-status>${esc(message)}</p><div class="modal__actions"><button type="button" class="button button--primary" data-contact-add ${task?.attempt.sent?'disabled':''}>Añadir contacto</button><button type="button" class="button button--secondary" data-contact-reload ${task?.attempt.sent&&!task.attempt.rejected?'disabled':''}>Actualizar contactos</button></div>${task?'<div data-contact-form></div>':''}<h3 class="modal__section-title">Vínculos empresariales</h3>${rows||'<p>No hay contactos vinculados.</p>'}${!active.some(c=>c.is_primary)?'<p>La empresa no tiene contacto principal.</p>':''}`);
      if(!task)return;
      const v=task.values;
      const candidates=state.persons.filter(p=>!active.some(c=>c.person_id===p.id));
      const body=task.action==='contactAdd'
        ? select('contactMode','Modalidad',[['new','Persona nueva'],['existing','Persona existente']],'new')+
          `<div class="new-customer-form__section" data-contact-new><div class="form-grid form-grid--customer-two">${input('contactFirstName','Nombre','','text',true)+input('contactLastName','Apellidos','','text',true)+input('contactPhone','Teléfono','','tel')+input('contactEmail','Correo electrónico','','email')}</div><p>Indica al menos teléfono o correo.</p></div>`+
          `<div class="new-customer-form__section" data-contact-existing hidden>${select('personId','Persona activa accesible',candidates.map(p=>[p.id,[op().personName(p.id),p.phone||p.contact_email].filter(Boolean).join(' · ')]))}<p>Selección de personas accesibles mediante la sesión administrativa. No modifica su identidad.</p></div>`+
          input('contactRole','Función o cargo')+area('notes','Notas del vínculo')+select('primary','Principal',[['no','No'],...(!primary()?[['yes','Sí']]:[])] ,'no')
        : task.action==='contactPrimary'
          ? '<p>Se sustituirá al principal mostrado en esta lectura, si lo hay. Si los contactos han cambiado, será necesario actualizar.</p>'+area('reason','Motivo obligatorio')
          : (v.deactivate?'<p>Se desactivará solo este vínculo y se retirará como principal. La persona se conserva.</p>':input('contactRole','Función o cargo',v.contactRole)+area('notes','Notas del vínculo',v.notes))+area('reason','Motivo obligatorio');
      modal.querySelector('[data-contact-form]').innerHTML=`<form class="new-customer-form new-customer-form__section" data-contact-form-fields novalidate>${body}<p role="status" data-contact-form-status></p><div class="modal__actions"><button type="submit" class="button button--primary">Confirmar</button><button type="button" class="button button--secondary" data-contact-cancel>Cancelar operación</button></div></form>`;
      const form=modal.querySelector('form'),status=form.querySelector('[data-contact-form-status]'),submit=form.querySelector('[type=submit]');
      for(const el of form.querySelectorAll('[name]'))if(Object.hasOwn(v,el.name))el.value=v[el.name]??'';
      const sync=()=>{
        for(const el of form.querySelectorAll('[name]'))el.disabled=task.attempt.busy||Boolean(task.attempt.sent);
        const existing=form.querySelector('[name=contactMode]')?.value==='existing';
        for(const [selector,hidden]of [['[data-contact-new]',existing],['[data-contact-existing]',!existing]]){const group=form.querySelector(selector);if(group){group.hidden=hidden;for(const e of group.querySelectorAll('[name]'))e.disabled=hidden||task.attempt.busy||Boolean(task.attempt.sent);}}
        if(task.attempt.sent)for(const el of form.querySelectorAll('[name]'))el.disabled=true;
        form.querySelector('[data-contact-cancel]').disabled=Boolean(task.attempt.sent);
        submit.textContent=task.attempt.result?'Actualizar lectura':task.attempt.sent?'Reintentar comprobación':'Confirmar';
        submit.disabled=task.attempt.busy||task.attempt.rejected||!current();
        for(const b of modal.querySelectorAll('[data-contact-add],[data-contact-action]'))b.disabled=task.attempt.busy||Boolean(task.attempt.sent);
        modal.querySelector('[data-contact-reload]').disabled=task.attempt.busy||Boolean(task.attempt.sent&&!task.attempt.rejected);
      };
      form.onchange=sync;sync();
      if(task.attempt.sent)status.textContent=task.attempt.result?'Guardado; actualización pendiente.':'Resultado pendiente: reintenta con el mismo identificador y los mismos datos.';
      form.onsubmit=async e=>{
        e.preventDefault();if(!current()||state.task!==task||writing||task.attempt.busy||task.attempt.rejected)return;
        const values=task.attempt.sent?task.values:{...task.values,...Object.fromEntries(new FormData(form))};
        try{payload(task.action,values);}catch(error){status.textContent=error.message;return;}
        task.values=values;for(const el of form.querySelectorAll('input,select,textarea,button'))el.disabled=true;status.textContent='Enviando…';
        try{
          const result=await execute(task.attempt,values,async()=>{await read();state.changed=true;},()=>current()&&state.task===task);
          if(current()){
            state.changed=true;
            if(result.refreshPending){status.textContent='Guardado; actualización pendiente. Reintenta solo la lectura.';sync();}
            else{state.task=null;contactAttempts.delete(owner);render('Guardado correctamente. Contactos actualizados.');}
          }
        }catch(error){if(current()){status.textContent=error.message;sync();const reload=modal.querySelector('[data-contact-reload]');if(task.attempt.rejected)reload.disabled=false;}}
      };
      form.querySelector('input,textarea,select')?.focus?.({preventScroll:true});
    };
    modal.onclick=async e=>{
      const target=e.target;
      if(target===modal||target.closest('[data-contacts-close]')){e.stopPropagation?.();closeContacts();return;}
      if(!current()||writing||state.task?.attempt.busy)return;
      if(target.closest('[data-contact-reload]')){
        if(state.task?.attempt.sent&&!state.task.attempt.rejected)return;
        state.task=null;contactAttempts.delete(owner);
        try{await read();render('Contactos actualizados.');}catch(error){if(current())modal.querySelector('[data-contacts-status]').textContent=error.message;}
      }else if(target.closest('[data-contact-add]'))start('contactAdd');
      else if(target.closest('[data-contact-cancel]')){if(!state.task?.attempt.sent){state.task=null;contactAttempts.delete(owner);render();}}
      else{const b=target.closest('[data-contact-action]');if(b){const row=state.contacts.find(c=>c.id===b.dataset.contactId&&c.status==='active');if(row)start(b.dataset.contactAction==='primary'?'contactPrimary':'contactUpdate',row,b.dataset.contactAction==='deactivate');}}
    };
    modal.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();closeContacts();}else if(e.key==='Tab'){const buttons=[...modal.querySelectorAll('button,input,textarea,select')].filter(el=>!el.disabled&&!el.closest('[hidden]'));const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
    shell('<p role="status">Cargando contactos reales…</p>');
    try{await read();if(state.task?.attempt.result)state.changed=true;render();if(!state.task)modal.querySelector('[data-contacts-close]')?.focus?.({preventScroll:true});}
    catch(error){if(current())shell(`<p role="alert">${esc(error.message)}</p>`);}
  }

  async function open(module,action,entityId='') {
    if(action==='customerCreate') return openCustomerCreate();
    if(writing || dialog?.attempt.busy) return;
    if(dialog?.attempt.sent && !dialog.attempt.result) { window.ElaraNotifications?.showToast('Resuelve o cierra el intento anterior antes de iniciar otra operación.','info'); return; }
    closeContacts(false);invalidateCustomer();
    const ticket=++opening, modal=document.getElementById(modals[module]); if(!modal) return;
    const ownerScope=sessionScope(),ownerClient=window.ElaraSupabase?.client;
    modal.hidden=false;
    modal.innerHTML='<section class="modal"><div class="modal__body" role="status">Cargando opciones reales…</div></section>';
    try {
      const attempt=operation(action); dialog={attempt,modal};
      const owner=ownerScope,client=ownerClient;
      const current=()=>ticket===opening&&dialog?.attempt===attempt&&!modal.hidden&&!document.getElementById(views[module]).hidden&&owner===sessionScope()&&client===window.ElaraSupabase?.client;
      if(!window.ElaraAuth?.getCurrentUser?.() || !['administrativo','superadmin'].includes(window.ElaraAuth?.getActiveContext?.())) throw remoteError({code:'42501'});
      const c=await context(action); if(!current()){if(dialog?.attempt===attempt)modal.hidden=true;return;}
      const table=action==='customerStatus'?'customers':action==='driverUpdate'?'drivers':action==='close'?'driver_vehicle_assignments':'vehicles';
      let row=entityId?(c[table]||[]).find(r=>r.id===entityId):{};
      if(action==='assign') row=module==='drivers'?{driver_id:entityId}:{vehicle_id:entityId};
      if(!row) fail('Registro no operativo o no accesible.');
      const titleId=module==='vehicles'?'vehicle-catalog-title':'catalog-title';
      if(module==='vehicles')modal.setAttribute('aria-labelledby',titleId);
      modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}"><header class="modal__header"><h2 id="${titleId}">${esc(labels[action])}</h2><button type="button" data-catalog-close>Cerrar</button></header><form class="modal__body" novalidate>${fields(action,row,c)}<p role="status" data-catalog-status></p><button type="submit" class="button button--primary">Confirmar</button><button type="button" data-catalog-close>Cancelar</button></form></section>`;
      const form=modal.querySelector('form'), status=form.querySelector('[data-catalog-status]');
      if(['drivers','vehicles'].includes(module)){
        const view=document.getElementById(views[module]);
        const dispose=()=>{observer?.disconnect();window.removeEventListener?.('elara:auth-session-updated',invalidate);};
        const invalidate=()=>{if(!current()){if(dialog?.attempt===attempt)modal.hidden=true;dispose();}};
        const observer=window.MutationObserver?new window.MutationObserver(invalidate):null;
        observer?.observe(view,{attributes:true,attributeFilter:['hidden']});observer?.observe(modal,{attributes:true,attributeFilter:['hidden']});
        window.addEventListener('elara:auth-session-updated',invalidate);
        modal.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();modal.querySelector('[data-catalog-close]')?.click();}else if(e.key==='Tab'){const controls=[...modal.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&!el.closest('[hidden]'));const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
      }
      const replacement=()=>{const type=form.elements.documentType?.value;if(!type)return;const docs=c.vehicle_documents.filter(d=>d.vehicle_id===row.id&&d.document_type_key===type&&currentDocument(d));const box=form.querySelector('[data-catalog-replacement]');box.textContent=docs.length?`Reemplazo explícito del documento actual ${docs[0].id}. Motivo obligatorio.`:'Nuevo documento: no existe documento actual de este tipo.';};
      form.elements.documentType?.addEventListener('change',replacement); replacement();
      modal.onclick=event=>{if(event.target.closest('[data-catalog-close]')&&!attempt.busy){if(attempt.sent&&!attempt.result&&!attempt.rejected){status.textContent='Intento enviado: conserva este formulario para reintentar. No cambies los datos ni inicies otra alta hasta revisar el resultado.';return;}++opening;modal.hidden=true;dialog=null;}};
      form.onsubmit=async event=>{
        event.preventDefault(); if(attempt.busy || writing) return;
        if(!current()){modal.hidden=true;return;}
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
          const result=await execute(attempt,values,r=>refresh(module,r,action),current);
          status.textContent=result.refreshPending?'Guardado; actualización pendiente.':'Guardado correctamente. Listado actualizado.';
          if(!result.refreshPending) window.ElaraNotifications?.showToast('Guardado correctamente.','success');
        } catch(error) { status.textContent=error.message;
          if(['drivers','vehicles'].includes(module)&&attempt.sent&&!attempt.result&&!attempt.rejected&&!form.querySelector('[data-driver-reconcile]')){
            const check=document.createElement('button');check.type='button';check.className='button button--secondary';check.dataset.driverReconcile='';check.textContent='Comprobar por lectura y cerrar';
            check.onclick=async()=>{if(!current()||attempt.busy)return;check.disabled=true;try{await op().loadIdentity();if(!current())return;if(module==='vehicles'&&refreshers[module])await refreshers[module]({vehicle_id:row.vehicle_id||row.id},action);else await loaders[module]();if(owner!==sessionScope())return;modal.hidden=true;dialog=null;++opening;}catch(_){status.textContent='No se pudo comprobar el estado. Reintenta solo la lectura.';}finally{check.disabled=false;}};form.appendChild(check);
          }
        }
        finally {
          controls.forEach(el=>el.disabled=false);
          if(attempt.sent&&!attempt.result) controls.filter(el=>!['BUTTON'].includes(el.tagName)).forEach(el=>el.disabled=true);
          if(attempt.result) {form.querySelector('[type="submit"]').textContent='Actualizar lectura';controls.filter(el=>el.tagName!=='BUTTON').forEach(el=>el.disabled=true);}
        }
      };
    } catch(error) {if(['drivers','vehicles'].includes(module)&&(ownerScope!==sessionScope()||ownerClient!==window.ElaraSupabase?.client||ticket!==opening||document.getElementById(views[module]).hidden)){modal.hidden=true;return;}modal.innerHTML=`<section class="modal"><div class="modal__body"><p role="alert">${esc(error.message)}</p><button type="button" data-catalog-close>Cerrar</button></div></section>`;modal.onclick=e=>{if(e.target.closest('[data-catalog-close]')){modal.hidden=true;dialog=null;}};}
  }
  return Object.freeze({operation,payload,execute,remoteError,validateResult,candidates,currentDocument,attach,detailActions,open,openContacts,openCustomerStatus});
})();
