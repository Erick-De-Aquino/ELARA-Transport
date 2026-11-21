/* Reportes operativos: lecturas autorizadas y agregaciones de presentación. */
"use strict";
window.ElaraReports = (() => {
  const $ = id => document.getElementById(id), op = () => window.ElaraOperationalData;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const terminal = new Set(['completed','cancelled','no_show','not_performed']);
  const labels = {completed:'Finalizado',cancelled:'Cancelado',no_show:'No show',not_performed:'No realizado'};
  const typeLabels = {transfer:'Punto a punto',airport:'Aeropuerto',hourly:'Por horas',full_day:'Full Day',pets:'Mascotas',long_distance:'Larga distancia'};
  const charts = new Map(), detailCache = new Map();
  let reportModal=null;
  let bound=false, revision=0, detailRevision=0, base=null, entities=[], selected='', kind='drivers', tab='general', preset='1', custom=null, page=1, chartSpecs=[];
  const scope = () => {const a=window.ElaraAuth,u=a?.getCurrentUser?.();return JSON.stringify([u?.id,u?.supabaseUserId,u?.appSessionId,a?.getActiveContext?.()]);};
  const allowed = () => Boolean(window.ElaraAuth?.getCurrentUser?.() && window.ElaraAuth?.getActiveContext?.()==='superadmin');
  const visible = () => Boolean($('reportes') && !$('reportes').hidden);
  const stamp = () => {const n=revision,s=scope();return ()=>n===revision&&s===scope()&&allowed()&&visible();};
  const madrid = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'});
  function day(value) {
    if (typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value ? value : null;
    if (!(value instanceof Date) && (typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value))) return null;
    const date=new Date(value);if(!Number.isFinite(date.getTime()))return null;
    const parts=Object.fromEntries(madrid.formatToParts(date).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function period(months='1',range=null,now=new Date()) {
    if(months==='custom') {if(!range||!/^\d{4}-\d{2}-\d{2}$/.test(range.from)||!/^\d{4}-\d{2}-\d{2}$/.test(range.to)||!day(range.from)||!day(range.to)||range.from>range.to)throw Error('Selecciona un periodo válido.');if((Number(range.to.slice(0,4))-Number(range.from.slice(0,4)))*12+Number(range.to.slice(5,7))-Number(range.from.slice(5,7))>=60)throw Error('Selecciona un periodo de hasta 60 meses.');return {...range};}
    if(!['1','3','6','12'].includes(String(months)))throw Error('Periodo no autorizado.');
    const today=day(now),[y,m]=today.split('-').map(Number),start=new Date(Date.UTC(y,m-Number(months),1)),end=new Date(Date.UTC(y,m,0));
    return {from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)};
  }
  const inside = (value,p) => {const d=day(value);return d!==null&&d>=p.from&&d<=p.to;};
  function months(p) {const out=[];for(let n=Number(p.from.slice(0,4))*12+Number(p.from.slice(5,7))-1,end=Number(p.to.slice(0,4))*12+Number(p.to.slice(5,7))-1;n<=end;n++)out.push(`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`);return out;}
  function minor(value) {if(value===null||value===undefined||!/^\d+(?:\.\d{1,2})?$/.test(String(value)))return null;const [whole,fraction='']=String(value).split('.');return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));}
  function moneyValue(value,currency) {return `${new Intl.NumberFormat('es-ES').format(value/100n)},${String(value%100n).padStart(2,'0')} ${currency}`;}
  function totals(rows,field) {
    if(!Array.isArray(rows))return null;const sums=new Map();
    for(const r of rows){const amount=minor(r[field]);if(amount===null||! /^[A-Z]{3}$/.test(r.currency_code||''))return null;sums.set(r.currency_code,(sums.get(r.currency_code)||0n)+amount);}return sums;
  }
  const money = sums => sums===null?'No disponible':sums.size?[...sums].sort(([a],[b])=>a.localeCompare(b)).map(([c,v])=>moneyValue(v,c)).join(' · '):'0';
  function unique(rows,key='id') {if(!Array.isArray(rows))return null;const ids=new Set();for(const r of rows){if(!r[key]||ids.has(r[key]))return null;ids.add(r[key]);}return rows;}
  function dated(rows,field,p) {if(!Array.isArray(rows)||rows.some(r=>!day(r[field])))return null;return rows.filter(r=>inside(r[field],p));}
  function terminalEvents(data) {
    if(!data.services||!data.closures||!data.history)return {events:[],complete:false};
    const events=[];let complete=true;
    for(const s of data.services){
      const history=data.history.filter(h=>h.service_id===s.id&&terminal.has(h.to_status));
      if(!terminal.has(s.operational_status)){if(history.length)complete=false;continue;}
      const closures=data.closures.filter(c=>c.service_id===s.id);
      const matching=history.filter(h=>h.to_status===s.operational_status&&day(h.changed_at));
      const dates=new Set(matching.map(h=>new Date(h.changed_at).toISOString()));
      const closure=closures.length===1&&closures[0].closure_type===s.operational_status?closures[0]:null;
      const date=s.operational_status==='cancelled'?s.cancelled_at:closure?.closed_at;
      const fallback=dates.size===1?matching[0]:null;
      const when=day(date)?date:fallback?.changed_at;
      if(!when||!day(when)||history.some(h=>h.to_status!==s.operational_status)||closures.length>1||closures.some(c=>c.closure_type!==s.operational_status)){complete=false;continue;}
      events.push({service:s,status:s.operational_status,date:when,assignmentId:closure?.assignment_id||fallback?.assignment_id||null});
    }
    return {events,complete};
  }
  function confirmedPayments(data,p,serviceIds=null) {
    if(!data.payments||!data.services||!data.financials)return null;
    const rows=data.payments.filter(r=>r.payment_status==='completed'&&(!serviceIds||serviceIds.has(r.service_id)));
    const filtered=dated(rows,'paid_at',p);if(!filtered)return null;
    if(filtered.some(r=>!data.services.some(s=>s.id===r.service_id)||!data.financials.some(f=>f.id===r.service_financial_id&&f.service_id===r.service_id&&f.currency_code===r.currency_code)))return null;
    return filtered;
  }
  function registeredExpenses(data,p) {return dated(data.expenses?.filter(r=>r.status==='approved'),'expense_date',p);}
  function overview(data,p) {
    const all=terminalEvents(data),events=all.events.filter(e=>inside(e.date,p));
    const completed=all.complete?events.filter(e=>e.status==='completed').length:null;
    return {income:totals(confirmedPayments(data,p),'amount'),expenses:totals(registeredExpenses(data,p),'amount'),completed,
      rate:!all.complete?null:events.length?`${new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(completed*100/events.length)} %`:'Sin cierres',events,complete:all.complete};
  }
  const card = (title,value,tone='neutral') => `<article class="summary-card summary-card--${tone}"><span>${esc(title)}</span><strong>${esc(value===null?'No disponible':value)}</strong></article>`;
  function economicSpec(data,p) {
    const income=confirmedPayments(data,p),expense=registeredExpenses(data,p),keys=months(p);
    if(!income||!expense||totals(income,'amount')===null||totals(expense,'amount')===null)return {id:'economic',title:'Evolución económica',note:'No disponible: faltan cobros o gastos verificables.'};
    const currencies=[...new Set([...income,...expense].map(r=>r.currency_code))].sort(),sets=[];
    for(const currency of currencies)for(const [name,rows,field,color] of [['Cobros',income,'paid_at','#2563eb'],['Gastos aprobados',expense,'expense_date','#f59e0b']]){
      const values=keys.map(k=>[...(totals(rows.filter(r=>r.currency_code===currency&&day(r[field]).startsWith(k)),'amount')||new Map()).values()].reduce((a,b)=>a+b,0n));
      if(values.some(v=>v>BigInt(Number.MAX_SAFE_INTEGER)))return {id:'economic',title:'Evolución económica',note:'No disponible: importes fuera del rango seguro del gráfico.'};
      sets.push({label:`${name} (${currency})`,data:values.map(v=>Number(v)/100),borderColor:color,backgroundColor:color,yAxisID:currency});
    }
    return {id:'economic',title:'Evolución económica',note:'Cobros confirmados y gastos aprobados; no representa beneficio neto. Escala independiente por moneda.',labels:keys,datasets:sets,currencies};
  }
  function summaryCharts(data,p,result) {
    const keys=months(p),scheduled=dated(data.services,'scheduled_start_at',p),types=new Map();
    for(const s of scheduled||[]){const raw=String(s.service_type||'').trim(),type=typeLabels[raw]||raw||'Sin clasificar';types.set(type,(types.get(type)||0)+1);}
    return [economicSpec(data,p),{id:'operation',title:'Evolución operativa',note:result.complete?'No show se incluye en «No realizados». Fechas reales de cierre o cancelación.':'No disponible: cierres sin fecha verificable.',labels:keys,
      datasets:result.complete?[['Finalizados',['completed'],'#16a34a'],['Cancelados',['cancelled'],'#dc2626'],['No realizados',['not_performed','no_show'],'#64748b']].map(([label,statuses,color])=>({label,data:keys.map(k=>result.events.filter(e=>statuses.includes(e.status)&&day(e.date).startsWith(k)).length),backgroundColor:color})):null},
      {id:'types',title:'Distribución de servicios',note:scheduled?'Servicios por fecha programada y tipo registrado.':'No disponible: fechas programadas incompletas.',labels:[...types.keys()],datasets:scheduled&&types.size?[{label:'Servicios programados',data:[...types.values()],backgroundColor:'#2563eb'}]:null}];
  }
  function openReportModal(id,opener) {
    if(!allowed()||!visible())return;
    closeReportModal(false);
    const element=$(id);reportModal={element,opener,scope:scope()};element.hidden=false;
    element.querySelector('[data-modal-close]')?.focus({preventScroll:true});
  }
  function closeReportModal(restoreFocus=true) {
    if(!reportModal)return;
    const {element,opener,scope:owner}=reportModal;reportModal=null;element.hidden=true;
    if(element.id==='report-chart-modal'){charts.get('expanded')?.destroy();charts.delete('expanded');}
    if(restoreFocus&&allowed()&&visible()&&owner===scope()&&opener?.isConnected&&!opener.disabled)opener.focus({preventScroll:true});
  }
  function modalClick(event) {
    if(!reportModal||event.currentTarget!==reportModal.element)return;
    if(event.target===reportModal.element||event.target.closest('[data-modal-close]')){event.stopPropagation();closeReportModal();}
  }
  function modalKey(event) {
    if(!reportModal||event.currentTarget!==reportModal.element)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeReportModal();}
    else if(event.key==='Tab'){
      const controls=[...reportModal.element.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')];
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  }
  function destroyCharts() {if(reportModal?.element.id==='report-chart-modal')closeReportModal(false);for(const chart of charts.values())chart.destroy();charts.clear();chartSpecs=[];if($('report-chart-modal'))$('report-chart-modal').hidden=true;}
  function invalidate() {closeReportModal(false);revision++;detailRevision++;base=null;entities=[];selected='';detailRows=[];detailColumns=[];detailCache.clear();destroyCharts();for(const id of ['reports-summary','report-blocks','report-charts'])$(id)?.replaceChildren();if($('export-report-modal'))$('export-report-modal').hidden=true;}
  function initReports() {
    if(bound)return;bound=true;
    $('reportes').innerHTML=`<section class="summary-grid compact-summary" id="reports-summary" aria-label="Resumen de reportes"></section>
      <section class="panel reports-panel" id="reports-current-panel"><div class="services-toolbar list-toolbar"><div class="list-toolbar__heading"><p class="panel__eyebrow">Datos reales</p><h2>Reportes</h2><p id="reports-period-label"></p></div>
      <div class="customer-toolbar-actions list-toolbar__actions"><div class="form-actions-inline" role="tablist" aria-label="Secciones de Reportes"><button class="button button--primary" type="button" role="tab" data-report-tab="general" aria-selected="true" aria-controls="report-charts">Resumen general</button><button class="button button--secondary" type="button" role="tab" data-report-tab="detail" aria-selected="false" aria-controls="report-blocks">Análisis detallado</button></div>
      <details class="customer-filter"><summary>Periodo</summary><div class="customer-filter__menu customer-filter__menu--chips"><div class="customer-filter__group" role="radiogroup" aria-label="Periodo de Reportes">${[['1','Mes actual'],['3','Últimos 3 meses'],['6','Últimos 6 meses'],['12','Últimos 12 meses'],['custom','Personalizado']].map(([v,t])=>`<label class="filter-chip"><input type="radio" name="reports-period" value="${v}" ${v===preset?'checked':''}><span>${t}</span></label>`).join('')}</div></div></details><button class="button button--secondary" type="button" data-report-refresh>Actualizar</button></div></div>
      <div class="form-grid" id="reports-custom-period" hidden><label class="field"><span>Desde</span><input type="date" name="reports-from"></label><label class="field"><span>Hasta</span><input type="date" name="reports-to"></label></div>
      <p role="status" aria-live="polite" id="reports-status">Selecciona Reportes para consultar datos reales.</p><div class="report-blocks" id="report-blocks"></div><div class="report-chart-grid" id="report-charts"></div></section>`;
    const exportModal=$('export-report-modal');exportModal.querySelectorAll('input,select,button:not([data-modal-close])').forEach(e=>e.disabled=true);
    exportModal.querySelector('.modal__header p:last-child').textContent='PDF, Excel y CSV todavía no están disponibles.';
    for(const id of ['report-chart-modal','export-report-modal']){$(id).addEventListener('click',modalClick);$(id).addEventListener('keydown',modalKey);}
    $('reportes').addEventListener('click',onClick);$('reportes').addEventListener('change',onChange);
    window.addEventListener('elara:auth-session-updated',()=>{if(!allowed()){invalidate();$('reportes').hidden=true;}});
    if(window.MutationObserver)new window.MutationObserver(()=>{if(!visible())invalidate();}).observe($('reportes'),{attributes:true,attributeFilter:['hidden']});
    if(window.MutationObserver)new window.MutationObserver(()=>{if($('report-chart-modal').hidden){charts.get('expanded')?.destroy();charts.delete('expanded');}}).observe($('report-chart-modal'),{attributes:true,attributeFilter:['hidden']});
  }
  async function readSources(spec,valid) {
    const entries=Object.entries(spec),results=await Promise.allSettled(entries.map(([,load])=>load()));if(!valid())throw Error('Lectura obsoleta.');
    const data=Object.fromEntries(entries.map(([key],i)=>[key,results[i].status==='fulfilled'?results[i].value:null]));
    op().indexRecords(Object.fromEntries(Object.entries(data).filter(([,v])=>Array.isArray(v))));
    for(const [key,rows]of Object.entries(data))data[key]=unique(rows,key==='expenses'?'expense_id':key==='settlements'?'settlement_id':'id')?.filter(r=>op().isOperationalRecord(r))||null;
    // Missing identity/QA coverage must never silently turn into a partial total.
    if(['customers','persons','companies','drivers'].some(key=>data[key]===null)){data.services=null;data.expenses=null;}
    return data;
  }
  async function showReports() {
    initReports();invalidate();if(!allowed()){ $('reportes').hidden=true;return; }
    tab='general';kind='drivers';page=1;const valid=stamp();
    $('page-title').textContent='Reportes';$('page-eyebrow').textContent='SUPERADMINISTRACIÓN';$('page-summary').textContent='Economía y actividad registradas. Análisis por conductor y cliente.';
    const primary=$('primary-action');primary.hidden=false;primary.textContent='Exportar reporte';primary.className='button button--primary';primary.removeAttribute('data-modal-open');primary.removeAttribute('data-modal-target');primary.onclick=()=>{if(valid())openReportModal('export-report-modal',primary);};
    $('reports-status').textContent='Cargando datos reales…';op().reset();
    try{base=await readSources({services:()=>op().readAll('services'),closures:()=>op().readAll('service_closures'),history:()=>op().readAll('service_status_history'),payments:()=>op().readAll('service_payments'),financials:()=>op().readAll('service_financials'),expenses:()=>op().readRpc('get_admin_expenses'),customers:()=>op().readAll('customers'),persons:()=>op().readAll('persons'),companies:()=>op().readAll('companies'),drivers:()=>op().readAll('drivers')},valid);
      if(!valid())return;render();
    }catch(_){if(valid())$('reports-status').textContent='No se pudo completar la lectura. Pulsa Actualizar.';}
  }
  function activePeriod() {return period(preset,custom);}
  function render() {
    if(!allowed()||!visible()||!base)return;let p;try{p=activePeriod();}catch(error){destroyCharts();for(const id of ['reports-summary','report-blocks','report-charts'])$(id).replaceChildren();$('reports-status').textContent=error.message;return;}
    destroyCharts();const result=overview(base,p);$('reports-period-label').textContent=`${p.from} — ${p.to} · Europe/Madrid`;
    $('reports-summary').hidden=tab!=='general';$('report-charts').hidden=tab!=='general';
    for(const b of $('reportes').querySelectorAll('[data-report-tab]')){b.setAttribute('aria-selected',String(b.dataset.reportTab===tab));b.className='button '+(b.dataset.reportTab===tab?'button--primary':'button--secondary');}
    $('reports-status').textContent=Object.values(base).some(v=>v===null)||!result.complete?'Cobertura incompleta: los indicadores afectados muestran «No disponible». No se presentan totales parciales.':result.events.length?'Datos reales consultados.':'No hay cierres terminales en el periodo.';
    if(tab==='detail'){void renderDetailSelector();return;}
    $('reports-summary').innerHTML=card('Ingresos cobrados',money(result.income),'success')+card('Gastos registrados · aprobados',money(result.expenses),'warning')+card('Servicios finalizados',result.completed,'info')+card('Tasa de finalización',result.rate);
    $('report-blocks').innerHTML='<p class="report-chart-card__metric">Gastos aprobados por fecha de gasto; no equivale a pagos. Tasa: finalizados / cierres terminales del periodo (finalizados, cancelados, no show y no realizados). No mide satisfacción.</p>';
    chartSpecs=summaryCharts(base,p,result);$('report-charts').innerHTML=chartSpecs.map(spec=>`<article class="report-chart-card"><header class="report-chart-card__header"><div><h3>${esc(spec.title)}</h3><p>${esc(spec.note)}</p></div><button class="button button--compact button--muted report-chart-card__expand" type="button" data-report-chart="${spec.id}" aria-label="Ampliar ${esc(spec.title)}" ${!spec.datasets?.length?'disabled':''}>↗</button></header><div class="report-chart-card__canvas">${spec.datasets?.length?`<canvas id="report-chart-${spec.id}"></canvas>`:'<p>No hay datos disponibles para representar.</p>'}</div></article>`).join('');
    for(const spec of chartSpecs)if(spec.datasets?.length)drawChart($('report-chart-'+spec.id),spec,spec.id);
  }
  function drawChart(canvas,spec,key) {
    if(!allowed()||!visible()||!window.Chart){canvas?.replaceWith(document.createTextNode('Gráfico no disponible.'));return;}
    const scales=spec.currencies?.length?Object.fromEntries(spec.currencies.map((c,i)=>[c,{type:'linear',position:i%2?'right':'left',beginAtZero:true,title:{display:true,text:c},grid:{drawOnChartArea:i===0}}])):{y:{beginAtZero:true,ticks:{precision:0}}};
    charts.set(key,new window.Chart(canvas,{type:'bar',data:{labels:spec.labels,datasets:spec.datasets},options:{responsive:true,maintainAspectRatio:false,scales,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(ctx.raw)}`}}}}}));
  }
  function entityName(row) {if(kind==='drivers')return [base.persons?.find(p=>p.id===row.person_id)?.first_name,base.persons?.find(p=>p.id===row.person_id)?.last_name].filter(Boolean).join(' ')||row.human_code||row.id;const company=base.companies?.find(c=>c.id===row.company_id),person=base.persons?.find(p=>p.id===row.person_id);return row.customer_type==='company'?(company?.trade_name||company?.legal_name||row.human_code):[person?.first_name,person?.last_name].filter(Boolean).join(' ')||row.human_code||row.id;}
  async function renderDetailSelector() {
    const valid=stamp(),n=++detailRevision;
    $('report-blocks').innerHTML=`<div class="form-grid"><label class="field"><span>Analizar</span><select name="reports-kind"><option value="drivers" ${kind==='drivers'?'selected':''}>Conductores</option><option value="customers" ${kind==='customers'?'selected':''}>Clientes</option></select></label><label class="field"><span>${kind==='drivers'?'Conductor o colaborador':'Cliente'}</span><select name="reports-entity"><option value="">Selecciona una entidad</option></select></label></div><div id="reports-entity-result"><p>Selecciona una entidad para consultar su análisis.</p></div>`;
    try{const rows=kind==='drivers'?base.drivers:base.customers;if(!valid()||n!==detailRevision||tab!=='detail')return;
      if(!Array.isArray(rows)||!base.persons||!base.companies)throw Error('Identidades incompletas.');op().indexRecords({entities:rows});entities=rows.filter(r=>op().isOperationalRecord(r));
      const select=$('reportes').querySelector('[name=reports-entity]');select.innerHTML='<option value="">Selecciona una entidad</option>'+entities.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(entityName(r))} · ${esc(r.human_code||r.id)}</option>`).join('');
      if(selected&&entities.some(r=>r.id===selected))await loadDetail();
    }catch(_){if(valid()&&n===detailRevision)$('reports-entity-result').textContent='No disponible: no se pudo verificar la lista de entidades.';}
  }
  async function related(table,column,ids,valid) {const rows=[];for(let i=0;i<ids.length;i+=100){if(!valid())throw Error('Lectura obsoleta.');rows.push(...await op().readAll(table,'id',{column,values:ids.slice(i,i+100)}));if(!valid())throw Error('Lectura obsoleta.');}return rows;}
  function cachedDetail(key,load) {
    if(detailCache.has(key))return detailCache.get(key);
    const pending=load().catch(error=>{if(detailCache.get(key)===pending)detailCache.delete(key);throw error;});
    detailCache.set(key,pending);return pending;
  }
  async function driverSources(id) {
    const valid=stamp(),own=await op().readAll('service_assignments','id',{column:'driver_id',values:[id]});if(!valid())throw Error('Lectura obsoleta.');
    const ids=[...new Set(own.map(a=>a.service_id))];
    const [assignments,headers,raw]=await Promise.all([related('service_assignments','service_id',ids,valid),op().readRpc('get_admin_settlements',{p_driver_id:id}),op().readAll('settlements','id',{column:'driver_id',values:[id]})]);if(!valid())throw Error('Lectura obsoleta.');
    if(!unique(assignments)||!unique(headers,'settlement_id')||!unique(raw)||headers.some(h=>!raw.some(r=>r.id===h.settlement_id&&r.driver_id===id)))throw Error('Liquidaciones incompletas.');
    op().indexRecords({assignments,headers,raw});const settlements=headers.filter(s=>s.driver_id===id&&op().isOperationalRecord(s));
    const payments=await related('settlement_payments','settlement_id',settlements.map(s=>s.settlement_id),valid);if(!valid())throw Error('Lectura obsoleta.');
    op().indexRecords({payments});if(!unique(payments)||payments.some(p=>!settlements.some(s=>s.settlement_id===p.settlement_id&&s.currency_code===p.currency_code)))throw Error('Pagos incompletos.');
    return {assignments,settlements,payments};
  }
  function serviceAmount(services,data) {if(!services||!data.financials)return null;const rows=[];for(const s of services){const found=data.financials.filter(f=>f.service_id===s.id);if(found.length!==1||found[0].pricing_status!=='finalized')return null;rows.push(found[0]);}return totals(rows,'total_amount');}
  function assignedEvents(data,driverId,assignments) {
    const ids=new Set(assignments.filter(a=>a.driver_id===driverId).map(a=>a.service_id));
    const result=terminalEvents({...data,services:data.services?.filter(s=>ids.has(s.id))});let complete=result.complete;const events=[];
    for(const e of result.events){const candidates=e.assignmentId?assignments.filter(a=>a.id===e.assignmentId&&a.service_id===e.service.id):assignments.filter(a=>a.service_id===e.service.id&&a.assignment_status!=='rejected'&&Date.parse(a.assigned_at)<=Date.parse(e.date)&&(a.ended_at==null||Date.parse(a.ended_at)>=Date.parse(e.date)));
      if(candidates.length!==1){if(assignments.some(a=>a.service_id===e.service.id&&a.driver_id===driverId))complete=false;continue;}if(candidates[0].driver_id===driverId)events.push(e);
    }return {events,complete};
  }
  function detailTable(rows,columns) {const pages=Math.max(1,Math.ceil(rows.length/25));page=Math.min(page,pages);return `<div class="report-history-table-wrapper"><table class="report-history-table"><thead><tr>${columns.map(([title])=>`<th scope="col">${esc(title)}</th>`).join('')}</tr></thead><tbody>${rows.slice((page-1)*25,page*25).map(r=>`<tr>${columns.map(([,get])=>`<td>${esc(get(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="form-actions-inline cash-pagination"><button class="button button--secondary button--compact" type="button" data-report-page="-1" ${page===1?'disabled':''}>Anterior</button><span>Página ${page} de ${pages} · ${rows.length} registros</span><button class="button button--secondary button--compact" type="button" data-report-page="1" ${page===pages?'disabled':''}>Siguiente</button></div>`;}
  let detailRows=[],detailColumns=[];
  async function loadDetail() {
    const valid=stamp(),n=++detailRevision,id=selected,type=kind,target=$('reports-entity-result');page=1;
    if(!allowed()||!entities.some(e=>e.id===id)||!id){target.textContent='Selecciona una entidad para consultar su análisis.';return;}
    target.textContent='Consultando análisis real…';const current=()=>valid()&&n===detailRevision&&selected===id&&kind===type&&tab==='detail';
    try{const p=activePeriod(),eventResult=terminalEvents(base);let cards='',note='',rows=[],evolutionAvailable=true;
      if(type==='customers'){
        const debt=await cachedDetail('customer/'+id,()=>op().readAll('v_admin_receivable_overview','receivable_id',{column:'customer_id',values:[id]}));if(!current())return;op().indexRecords({debt});
        const all=base.services?.filter(s=>s.customer_id===id),contracted=dated(all,'created_at',p),completed=eventResult.events.filter(e=>e.service.customer_id===id&&e.status==='completed'&&inside(e.date,p));
        const ids=all?new Set(all.map(s=>s.id)):null,payments=ids?confirmedPayments(base,p,ids):null;
        const currentDebt=unique(debt,'receivable_id')?.filter(r=>r.customer_id===id&&op().isOperationalRecord(r)&&['open','overdue','partial'].includes(r.status))||null;
        cards=card('Servicios contratados',contracted?.length??null)+card('Servicios completados',eventResult.complete?completed.length:null)+card('Días con contratación',contracted?new Set(contracted.map(s=>day(s.created_at))).size:null)+card('Importe definitivo de contrataciones',money(serviceAmount(contracted,base)))+card('Cobros confirmados en el periodo',money(totals(payments,'amount')))+card('Deuda pendiente actual',money(totals(currentDebt,'pending_amount')));
        rows=contracted?.map(s=>({date:s.created_at,code:s.human_code,status:labels[s.operational_status]||s.operational_status}))||[];
        evolutionAvailable=contracted!==null;
        note='Contratación: fecha de creación. Frecuencia: días distintos con contratación, no satisfacción. Importes: precios definitivos de esas contrataciones; cobros: fecha de pago de cualquier servicio del cliente. La deuda es actual, sin filtro histórico.';
      }else{
        const {assignments,settlements,payments}=await cachedDetail('driver/'+id,()=>driverSources(id));if(!current())return;
        const attribution=assignedEvents(base,id,assignments.filter(op().isOperationalRecord)),events=attribution.events.filter(e=>inside(e.date,p)),completed=events.filter(e=>e.status==='completed'),ids=new Set(completed.map(e=>e.service.id));
        const generated=dated(settlements.filter(s=>s.status!=='draft'),'generated_at',p),effective=generated?.filter(s=>!['cancelled','rejected'].includes(s.status)),paid=dated(unique(payments)?.filter(r=>r.payment_status==='completed'&&op().isOperationalRecord(r)),'paid_at',p);
        if(!attribution.complete)throw Error('No se puede confirmar la atribución completa de los servicios.');
        cards=card('Servicios realizados',attribution.complete?completed.length:null)+card('Cancelados asociados',attribution.complete?events.filter(e=>e.status==='cancelled').length:null)+card('Importe definitivo de servicios realizados',attribution.complete?money(serviceAmount(completed.map(e=>e.service),base)):'No disponible')+card('Cobros de esos servicios en el periodo',attribution.complete?money(totals(confirmedPayments(base,p,ids),'amount')):'No disponible')+card('Liquidaciones generadas',generated?.length??null)+card('Participación registrada en liquidaciones vigentes',money(totals(effective,'driver_amount')))+card('Pagos confirmados al conductor',money(totals(paid,'amount')));
        rows=events.map(e=>({date:e.date,code:e.service.human_code,status:labels[e.status]}));
        note='Servicios atribuidos al vínculo de cierre o al único vínculo vigente al cancelar. Importes y cobros de servicios son brutos, no participación del conductor. Participación: importes almacenados en liquidaciones generadas en el periodo, excluidas rechazadas/anuladas. Pagos: fecha real de pago, aunque la liquidación sea anterior.';
        if(!attribution.complete)note+=' No disponible la atribución completa: existen cierres o asignaciones ambiguos.';
      }
      if(!current())return;rows.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.code).localeCompare(String(b.code)));
      detailRows=rows;detailColumns=[['Fecha (Madrid)',r=>day(r.date)||'No disponible'],['Servicio',r=>r.code||'Sin código'],['Estado registrado',r=>r.status]];
      const counts=evolutionAvailable?months(p).map(month=>`${month}: ${rows.filter(r=>day(r.date)?.startsWith(month)).length}`).join(' · '):'No disponible: fechas de contratación incompletas.';
      target.innerHTML=`<div class="summary-grid compact-summary">${cards}</div><p class="report-chart-card__metric">${esc(note)}</p><h3>Evolución de servicios</h3><p>${esc(counts)}</p><div id="reports-detail-table">${!evolutionAvailable?'<p>No disponible.</p>':rows.length?detailTable(rows,detailColumns):'<p>No hay servicios registrados para este criterio y periodo.</p>'}</div>`;
    }catch(_){if(current())target.textContent='No disponible: no se pudo completar el análisis. Selecciona de nuevo la entidad o pulsa Actualizar.';}
  }
  function onClick(event) {
    if(!allowed()||!visible())return;const b=event.target.closest('button');if(!b)return;
    if(b.dataset.reportTab){tab=b.dataset.reportTab;selected='';detailRevision++;render();}
    else if(b.hasAttribute('data-report-refresh'))void showReports();
    else if(b.dataset.reportPage){page+=Number(b.dataset.reportPage);$('reports-detail-table').innerHTML=detailTable(detailRows,detailColumns);}
    else if(b.dataset.reportChart){const spec=chartSpecs.find(s=>s.id===b.dataset.reportChart);if(!spec?.datasets?.length)return;$('report-chart-modal-title').textContent=spec.title;$('report-chart-modal-description').textContent=spec.note;$('report-chart-modal-metric').textContent=$('reports-period-label').textContent;openReportModal('report-chart-modal',b);drawChart($('report-chart-modal-canvas'),spec,'expanded');}
  }
  function onChange(event) {
    if(!allowed()||!visible())return;const input=event.target;
    if(input.name==='reports-period'){preset=input.value;$('reports-custom-period').hidden=preset!=='custom';if(preset==='custom'){const p=period('1');$('reportes').querySelector('[name=reports-from]').value=custom?.from||p.from;$('reportes').querySelector('[name=reports-to]').value=custom?.to||p.to;custom={from:$('reportes').querySelector('[name=reports-from]').value,to:$('reportes').querySelector('[name=reports-to]').value};}detailRevision++;render();}
    else if(['reports-from','reports-to'].includes(input.name)){custom={from:$('reportes').querySelector('[name=reports-from]').value,to:$('reportes').querySelector('[name=reports-to]').value};detailRevision++;render();}
    else if(input.name==='reports-kind'){kind=input.value==='customers'?'customers':'drivers';selected='';void renderDetailSelector();}
    else if(input.name==='reports-entity'){selected=input.value;void loadDetail();}
  }
  return Object.freeze({initReports,showReports,math:Object.freeze({day,period,minor,totals,money,terminalEvents,confirmedPayments,overview,summaryCharts,assignedEvents,serviceAmount})});
})();
