/* Usuarios: consulta autorizada, sin operaciones de escritura. */
"use strict";
window.ElaraUsers = (() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = {superadmin:'Superadmin',administrativo:'Administrativo',conductor:'Conductor',active:'Activo',inactive:'Inactivo'};
  const label = value => labels[value] || value || 'No disponible';
  const allowed = () => Boolean(window.ElaraAuth?.getCurrentUser?.() && window.ElaraAuth?.getActiveContext?.() === 'superadmin');
  const scope = () => {const a=window.ElaraAuth,u=a?.getCurrentUser?.();return JSON.stringify([u?.id,u?.supabaseUserId,u?.appSessionId,a?.getActiveContext?.()]);};
  const visible = () => Boolean($('usuarios') && !$('usuarios').hidden);
  let bound=false,revision=0,data=null,filter='todos',search='',page=1,dialog=null;
  const pageSize=20;
  function currentRole(role, catalog, now=Date.now()) {
    return role.status==='active' && !role.revoked_at && catalog.some(r=>r.key===role.role_key && r.is_active===true) &&
      Number.isFinite(Date.parse(role.starts_at)) && Date.parse(role.starts_at)<=now &&
      (role.ends_at===null || role.ends_at===undefined || Date.parse(role.ends_at)>now);
  }
  const field = (name,value) => `<div class="modal__field"><dt class="modal__field-label">${esc(name)}</dt><dd class="modal__field-value">${esc(value || 'No disponible')}</dd></div>`;
  function close(restore=true) {
    if(!dialog)return;
    const owner=dialog;dialog=null;$('user-detail-modal').hidden=true;$('user-detail-view').replaceChildren();
    if(restore && owner.scope===scope() && allowed() && visible() && owner.opener?.isConnected)owner.opener.focus({preventScroll:true});
  }
  function invalidate() {revision++;data=null;close(false);$('users-list')?.replaceChildren();$('users-summary')?.replaceChildren();$('users-pagination')?.replaceChildren();}
  function filtered() {
    const term=search.trim().toLocaleLowerCase('es');
    return data.users.filter(u=>(filter==='todos'||(filter==='activo'?u.status==='active':filter==='inactivo'?u.status==='inactive':u.roles.some(r=>r.role_key===filter))) &&
      (!term || `${u.name} ${u.person?.contact_email||''}`.toLocaleLowerCase('es').includes(term)));
  }
  function render() {
    if(!data||!allowed()||!visible())return;
    const metrics=[['Total usuarios',data.users.length,'neutral'],['Activos',data.users.filter(u=>u.status==='active').length,'success'],['Inactivos',data.users.filter(u=>u.status==='inactive').length,'danger'],['Conductores',data.users.filter(u=>u.roles.some(r=>r.role_key==='conductor')).length,'info']];
    $('users-summary').innerHTML=metrics.map(([name,value,tone])=>`<article class="summary-card summary-card--${tone}"><span>${name}</span><strong>${value}</strong></article>`).join('');
    const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages);
    $('users-list').innerHTML=rows.slice((page-1)*pageSize,page*pageSize).map(u=>`<article class="user-card user-card--${u.status==='active'?'success':u.status==='inactive'?'danger':'neutral'}"><div class="user-card__identity"><strong>${esc(u.name)}</strong><span>${esc(u.person?.contact_email || 'Sin correo de contacto')}</span></div><div class="user-role-pill-list" aria-label="Roles vigentes">${u.roles.length?u.roles.map(r=>`<span class="user-role-pill">${esc(label(r.role_key))}</span>`).join(''):'Sin roles vigentes'}</div><span class="user-status-pill user-status-pill--${u.status==='active'?'success':'danger'}">${esc(label(u.status))}</span><time>No disponible</time><div class="user-card__actions"><button class="button button--compact button--muted" type="button" data-user-detail="${esc(u.id)}">Detalle</button></div></article>`).join('') || '<p class="users-empty">No hay usuarios que coincidan con el filtro actual.</p>';
    $('users-pagination').innerHTML=`<button class="button button--compact button--secondary" type="button" data-users-page="-1" ${page===1?'disabled':''}>Anterior</button><span>Página ${page} de ${pages} · ${rows.length} usuarios</span><button class="button button--compact button--secondary" type="button" data-users-page="1" ${page===pages?'disabled':''}>Siguiente</button>`;
    for(const button of $('usuarios').querySelectorAll('[data-users-filter]')){const active=button.dataset.usersFilter===filter;button.classList.toggle('users-filter-button--active',active);button.setAttribute('aria-pressed',String(active));}
  }
  async function showUsers() {
    initUsers();invalidate();if(!allowed()){$('usuarios').hidden=true;return;}
    for(const [id,text] of [['page-eyebrow','Administración'],['page-title','Usuarios'],['page-summary','Consulta de usuarios, roles y accesos.']])if($(id))$(id).textContent=text;
    if($('primary-action'))$('primary-action').hidden=true;
    window.ElaraUsersAdmin?.prepare();
    $('users-list').innerHTML='<p class="users-empty" role="status">Cargando usuarios…</p>';
    const ticket=revision,owner=scope(),valid=()=>ticket===revision&&owner===scope()&&allowed()&&visible();
    try {
      const names=['app_users','persons','user_roles','roles','user_driver_links','drivers'];
      const results=await Promise.all(names.map(name=>window.ElaraOperationalData.readAll(name,name==='roles'?'key':'id')));
      if(!valid())return;
      const sources=Object.fromEntries(names.map((name,i)=>[name,results[i]]));
      data={...sources,users:sources.app_users.map(u=>{const person=sources.persons.find(p=>p.id===u.person_id);return {...u,person,name:person?`${person.first_name||''} ${person.last_name||''}`.trim()||u.human_code:u.human_code||'Identidad no disponible',roles:sources.user_roles.filter(r=>r.user_id===u.id&&currentRole(r,sources.roles))};})};render();
    } catch {if(valid())$('users-list').innerHTML='<p class="users-empty" role="alert">No se pudieron cargar los usuarios completos. Vuelve a abrir Usuarios para reintentar.</p>';}
  }
  async function openDetail(id,opener) {
    if(!allowed()||!visible()||!data)return;
    const user=data.users.find(u=>u.id===id);if(!user)return;
    close(false);const owner={scope:scope(),opener,revision,id};dialog=owner;
    const assigned=data.user_roles.filter(r=>r.user_id===id);
    const history=assigned.map(r=>`${label(r.role_key)}: ${currentRole(r,data.roles)?'Vigente':r.status==='revoked'?'Revocado':'No vigente'}${r.ends_at?' · hasta '+r.ends_at:''}`).join('; ');
    const links=data.user_driver_links.filter(l=>l.user_id===id&&l.status==='active');
    const drivers=links.map(l=>{const d=data.drivers.find(d=>d.id===l.driver_id);return d?.human_code||'Identificación no disponible';}).join(', ');
    $('user-detail-modal-title').textContent=user.name;
    $('user-detail-modal-description').textContent='Información de consulta. La administración de cuentas estará disponible en una fase posterior.';
    $('user-detail-view').innerHTML=field('Usuario funcional',user.human_code||user.id)+field('Correo de contacto',user.person?.contact_email)+field('Estado administrativo',label(user.status))+field('Roles asignados',history||'Sin roles registrados')+field('Contexto predeterminado',label(user.default_context))+field('Contexto activo','Depende de cada sesión; no disponible en esta ficha')+field('Conductor vinculado',drivers||'Sin vínculo activo registrado')+field('Último acceso','No disponible')+field('Nota interna',user.internal_note||'Sin nota interna')+'<div class="modal__field" id="user-audit" role="status">Consultando historial…</div>';
    $('user-detail-modal').hidden=false;$('user-detail-modal').querySelector('[data-modal-close]')?.focus({preventScroll:true});
    window.ElaraUsersAdmin?.detail(user,assigned,data.roles,links);
    try {
      const roleIds=new Set(assigned.map(r=>r.id));
      const logs=await window.ElaraOperationalData.readAll('audit_logs','id',{column:'entity_id',values:[id,...roleIds]});
      if(dialog!==owner||owner.revision!==revision||owner.scope!==scope()||!allowed()||!visible())return;
      const relevant=logs.filter(a=>(a.entity_table==='app_users'&&a.entity_id===id)||(a.entity_table==='user_roles'&&roleIds.has(a.entity_id))).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)));
      $('user-audit').innerHTML=field('Historial administrativo',relevant.length?relevant.map(a=>`${a.occurred_at} · ${a.action}${a.reason?' · '+a.reason:''}`).join('\n'):'Sin cambios registrados para este usuario');
    }catch {if(dialog===owner&&owner.scope===scope()&&allowed())$('user-audit').textContent='Historial no disponible.';}
  }
  function initUsers() {
    if(bound)return;bound=true;
    $('user-detail-view-actions').querySelector('#user-detail-edit-button')?.remove();
    $('user-detail-edit-actions').remove();$('user-detail-edit-form').remove();
    $('users-list').insertAdjacentHTML('afterend','<nav class="form-actions-inline cash-pagination" id="users-pagination" aria-label="Páginas de usuarios"></nav>');
    $('usuarios').addEventListener('input',event=>{if(event.target.id==='users-search'&&allowed()){search=event.target.value;page=1;render();}});
    $('usuarios').addEventListener('click',event=>{
      if(!allowed()||!visible())return;
      const f=event.target.closest('[data-users-filter]'),p=event.target.closest('[data-users-page]'),d=event.target.closest('[data-user-detail]');
      if(f){filter=f.dataset.usersFilter;page=1;render();}else if(p&&!p.disabled){page+=Number(p.dataset.usersPage);render();}else if(d)openDetail(d.dataset.userDetail,d);
    });
    const modal=$('user-detail-modal');
    modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-modal-close]'))close();});
    modal.addEventListener('keydown',event=>{
      if(!dialog)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
      if(event.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(n=>!n.hidden);if(!nodes.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    });
    window.addEventListener('elara:auth-session-updated',()=>{invalidate();if(!allowed())$('usuarios').hidden=true;else if(visible())showUsers();});
    if(window.MutationObserver)new window.MutationObserver(()=>{if(!visible())invalidate();}).observe($('usuarios'),{attributes:true,attributeFilter:['hidden']});
  }
  return {initUsers,showUsers};
})();
