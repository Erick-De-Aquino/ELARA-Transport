/* Configuración: consulta real; sin operaciones de modificación. */
"use strict";
window.ElaraSettings = (() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fields = [
    ['operations.internal_driver_priority_enabled','Prioridad de conductor interno','La asignación conserva sus propias reglas de prioridad.'],
    ['operations.default_service_conflict_minutes','Margen de conflicto de servicios','Valor registrado; no confirma el cálculo de conflictos.'],
    ['operations.vehicle_document_expiring_days','Aviso de vencimiento documental','Valor registrado; no confirma el cálculo de estados documentales.'],
    ['operations.periodic_services_enabled','Servicios periódicos','El flujo de servicios periódicos no está disponible.'],
    ['system.audit_retention_mode','Retención de auditoría','Valor registrado; no confirma una tarea automática de retención.'],
    ['system.environment_label','Etiqueta del entorno','Etiqueta configurada; no identifica por sí sola el entorno de despliegue.']
  ];
  const catalogNames = {service_types:'Tipos de servicio',incident_reason_codes:'Motivos de incidencia',cancellation_reason_codes:'Motivos de cancelación'};
  const allowed = () => {const a=window.ElaraAuth,u=a?.getCurrentUser?.();return Boolean(u?.id && u?.appSessionId && a?.getActiveContext?.()==='superadmin');};
  const scope = () => {const a=window.ElaraAuth,u=a?.getCurrentUser?.();return JSON.stringify([u?.id,u?.supabaseUserId,u?.appSessionId,a?.getActiveContext?.()]);};
  const visible = () => Boolean($('configuracion') && !$('configuracion').hidden);
  let bound=false,revision=0;
  const message = (text,error=false) => `<p class="settings-note" role="${error?'alert':'status'}">${esc(text)}</p>`;
  const card = (eyebrow,title,body,note='',wide=false) => `<article class="panel settings-card${wide?' settings-card--wide':''}"><div class="panel__header settings-card__header"><div><p class="panel__eyebrow">${esc(eyebrow)}</p><h2>${esc(title)}</h2></div><span class="status-pill status--neutral">Solo consulta</span></div>${body}${note?`<p class="settings-note">${esc(note)}</p>`:''}</article>`;
  function layout(operation,system,catalogs) {
    $('settings-grid').innerHTML=card('Empresa','Datos generales',message('Datos de empresa no disponibles en esta sección.'))+
      card('Operación','Preferencias generales',operation,'Parámetros registrados. La edición no está disponible.')+
      card('Notificaciones','Comunicaciones',message('La configuración de notificaciones no está disponible.'))+
      card('Seguridad y acceso','Parámetros del sistema',system,'Los permisos y las sesiones se gestionan fuera de esta sección.')+
      card('Catálogos','Catálogos operativos',catalogs,'Los catálogos describen opciones; no habilitan nuevas operaciones.',true);
  }
  function invalidate(){revision++;$('settings-grid')?.replaceChildren();}
  function initSettings(){
    if(bound)return;bound=true;invalidate();
    window.addEventListener('elara:auth-session-updated',()=>{invalidate();if(!allowed()){$('configuracion').hidden=true;}else if(visible())void showSettings();});
    if(window.MutationObserver)new window.MutationObserver(()=>{if(!visible())invalidate();}).observe($('configuracion'),{attributes:true,attributeFilter:['hidden']});
  }
  function value(row){
    if(row.value_json===null||row.value_json===undefined)return 'Sin valor disponible';
    if(row.value_type==='boolean')return typeof row.value_json==='boolean'?(row.value_json?'Sí':'No'):'Valor no válido';
    if(row.value_type==='number')return typeof row.value_json==='number'&&Number.isFinite(row.value_json)?String(row.value_json):'Valor no válido';
    if(row.value_type==='string')return typeof row.value_json==='string'?row.value_json||'Sin valor disponible':'Valor no válido';
    return 'Formato no disponible';
  }
  function parameterList(rows,prefix){
    const now=Date.now();
    return `<dl class="settings-read-list">${fields.filter(([key])=>key.startsWith(prefix)).map(([key,name,note])=>{
      const candidates=rows.filter(r=>r.setting_key===key&&r.setting_scope===key.split('.')[0]&&r.scope_reference_id==null&&r.is_active===true&&!r.is_sensitive&&Number.isFinite(Date.parse(r.effective_from))&&Date.parse(r.effective_from)<=now&&(r.effective_until==null||Date.parse(r.effective_until)>now));
      const row=candidates.length===1?candidates[0]:null;
      const unit=row?.value_type==='number'?(key.endsWith('_minutes')?' minutos':key.endsWith('_days')?' días':''):'';
      return `<div><dt>${esc(name)}</dt><dd>${esc(row?value(row)+unit:candidates.length>1?'Información no disponible': 'Sin información vigente')}<p class="settings-note">${esc(note)}</p></dd></div>`;
    }).join('')}</dl>`;
  }
  function catalogList(catalogs,items){
    const active=catalogs.filter(c=>catalogNames[c.catalog_key]&&c.is_active===true);
    if(!active.length)return message('No hay catálogos operativos disponibles.');
    return active.map(c=>`<section><h3>${esc(c.name_es||catalogNames[c.catalog_key])}</h3><dl class="settings-read-list">${items.filter(i=>i.catalog_id===c.id).sort((a,b)=>(a.sort_order??0)-(b.sort_order??0)||String(a.item_key).localeCompare(String(b.item_key))).map(i=>`<div><dt>${esc(i.label_es||'Sin nombre disponible')}</dt><dd>${esc(i.is_active===true?'Activo':i.is_active===false?'Inactivo':'Estado no disponible')} · ${esc(i.item_key||'Sin código')}</dd></div>`).join('')||'<div><dd>Sin opciones registradas.</dd></div>'}</dl></section>`).join('');
  }
  async function showSettings(){
    initSettings();invalidate();if(!allowed()){$('configuracion').hidden=true;return;}
    for(const [id,text] of [['page-eyebrow','Administración'],['page-title','Configuración'],['page-summary','Consulta de parámetros y catálogos de ELARA.']])if($(id))$(id).textContent=text;
    if($('primary-action')){$('primary-action').hidden=true;$('primary-action').removeAttribute('data-modal-open');}
    layout(message('Cargando parámetros…'),message('Cargando parámetros…'),message('Cargando catálogos…'));
    const ticket=revision,owner=scope(),valid=()=>revision===ticket&&scope()===owner&&allowed()&&visible();
    try{
      const read=window.ElaraOperationalData.readAll;
      const [rows,catalogs]=await Promise.all([read('app_settings','id',{column:'setting_key',values:fields.map(f=>f[0])}),read('configurable_catalogs','id',{column:'catalog_key',values:Object.keys(catalogNames)})]);
      if(!valid())return;
      const items=await read('configurable_catalog_items','id',{column:'catalog_id',values:catalogs.map(c=>c.id)});
      if(!valid())return;
      layout(parameterList(rows,'operations.'),parameterList(rows,'system.'),catalogList(catalogs,items));
    }catch{if(valid())layout(message('No se pudieron cargar los parámetros. Vuelve a abrir Configuración para reintentar.',true),message('Información del sistema no disponible.',true),message('No se pudieron cargar los catálogos.',true));}
  }
  return {initSettings,showSettings};
})();
