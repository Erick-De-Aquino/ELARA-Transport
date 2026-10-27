/* 0050 cash-only financial close. Backend owns balances, receipts and custody.
 * Session storage is only a retry envelope; all financial facts come from RPC receipts.
 */
"use strict";
window.ElaraFinancialClose = (() => {
  const attempts=new Map(); let writing=false,dialog=null;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=v=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v||'');
  const auth=()=>window.ElaraAuth;
  const actor=()=>auth()?.getCurrentUser?.()?.supabaseUserId || auth()?.getCurrentUser?.()?.id;
  const isAdmin=()=>['administrativo','superadmin'].includes(auth()?.getActiveContext?.());
  async function rpc(name,args){const response=await window.ElaraSupabase.client.rpc(name,args);if(response?.error)throw Object.assign(new Error(response.error.message||'Operación rechazada.'),{code:response.error.code});if(!response||response.data==null)throw Error('Respuesta remota no confirmada.');return response.data;}
  const context=id=>rpc('get_service_financial_close_context',{p_service_id:id});
  function key(){if(window.crypto?.randomUUID)return window.crypto.randomUUID();const b=window.crypto?.getRandomValues?.(new Uint8Array(16));if(!b)throw Error('Generador seguro no disponible.');b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
  const journalKey=id=>`elara.0050.retry/${actor()}/${auth()?.getActiveContext?.()}/${id}`;
  function restore(id){
    let raw;try{raw=window.sessionStorage.getItem(journalKey(id));}catch(_){throw Error('No se puede conservar el intento. Habilita almacenamiento de sesión antes de cobrar.');}
    if(!raw)return null;
    try{const a=JSON.parse(raw),p=JSON.parse(a.sent);if(a.actor!==actor()||a.context!==auth()?.getActiveContext?.()||a.id!==id||!uuid(a.key)||p.p_request_key!==a.key||!['driver','admin','receivable'].includes(a.kind)||
      (a.kind==='receivable'?p.p_receivable_id!==a.receivableId:p.p_service_id!==id))throw Error();return {...a,result:null,busy:false,operationalDone:false,refreshPending:false,recovered:true};}
    catch(_){throw Error('Intento de cobro ambiguo. Revisar estado del cobro: conserva esta sesión; no se permite otro intento.');}
  }
  function persist(a){
    const current=restore(a.id);if(current&&current.key!==a.key)throw Error('Existe otro intento pendiente. Revisar estado del cobro antes de continuar.');
    window.sessionStorage.setItem(journalKey(a.id),JSON.stringify({kind:a.kind,id:a.id,receivableId:a.receivableId,actor:a.actor,context:a.context,key:a.key,sent:a.sent}));
  }
  function forgetAttempt(a){
    check(a);window.sessionStorage.removeItem(journalKey(a.id));
    for(const [cachedKey,cached] of attempts)if(cached.id===a.id&&cached.actor===a.actor&&cached.context===a.context)attempts.delete(cachedKey);
  }
  function operation(kind,id,receivableId=null){if(!['driver','admin','receivable'].includes(kind)||!uuid(id)||!actor())throw Error('Operación o sesión no válida.');return restore(id)||{kind,id,receivableId,actor:actor(),context:auth().getActiveContext(),key:null,sent:null,result:null,busy:false,operationalDone:false,refreshPending:false};}
  function check(a){if(a.actor!==actor()||a.context!==auth()?.getActiveContext?.())throw Error('La sesión/contexto cambió. Vuelve a la misma sesión y revisa el intento.');if(a.kind==='driver'?auth().getActiveContext()!=='conductor':!isAdmin())throw Error('Contexto no autorizado.');}
  function args(a,v,c){
    if(c.pricing_status!=='finalized')throw Error('Precio pendiente de Administración. El cierre financiero está bloqueado.');
    const result=c.no_charge?'no_charge':v.result,amount=result==='full'?Number(c.pending_amount):['unpaid','no_charge'].includes(result)?0:Number(v.amount),reason=String(v.reason||'').trim()||null;
    if(!['full','partial','unpaid','no_charge'].includes(result)||!Number.isFinite(amount)||amount<0||Math.abs(amount*100-Math.round(amount*100))>1e-7||
      (result==='full'&&amount<=0)||(result==='partial'&&(amount<=0||amount>=Number(c.pending_amount)))||((result==='partial'||result==='unpaid')&&!reason))throw Error('Revisa importe y motivo obligatorio.');
    if(!a.key)a.key=key();
    const p={p_payment_result:result,p_amount_received:amount,p_request_key:a.key,p_reason_code:reason,p_notes:String(v.notes||'').trim()||null};
    if(a.kind==='receivable')p.p_receivable_id=a.receivableId;else p.p_service_id=a.id;
    if(a.kind!=='driver'){if(!['unpaid','no_charge'].includes(result)&&!uuid(v.account))throw Error('Selecciona la cuenta central/administrativa receptora.');p.p_cash_account_id=result==='no_charge'?null:v.account||null;}
    return p;
  }
  async function execute(a,values,refresh=async()=>{},onOperationalComplete=async()=>{}){
    if(writing||a.busy)throw Error('Ya hay una operación en curso.');writing=true;a.busy=true;
    try{
      check(a);
      if(!a.result){
        const c=await context(a.id);check(a);
        if(a.recovered){
          const receipt=await rpc('get_financial_close_receipt',{p_service_id:a.id,p_request_key:a.key});check(a);
          if(receipt.status==='applied'){
            const p=JSON.parse(a.sent),r=receipt.result;
            if(r?.service_id!==a.id||r.financial_close!=='resolved'||r.payment_result!==p.p_payment_result||Number(r.amount_received)!==p.p_amount_received)throw Error('Recibo incompatible. Revisar estado del cobro; no se permite otro intento.');
            a.result=r;a.operationalDone=true;
            try{await refresh(r);a.refreshPending=false;}catch(_){a.refreshPending=true;}
            return {result:r,refreshPending:a.refreshPending};
          }
          if(receipt.status!=='not_found')throw Error('Estado del intento ambiguo. Revisar estado del cobro.');
        }
        // Freeze the payload BEFORE completing; a retry never recalculates the received amount.
        if(!a.sent)a.sent=JSON.stringify(args(a,values,c));
        persist(a);
        if(a.kind==='driver'&&c.operational_status!=='completed'){
          if(c.operational_status!=='in_progress')throw Error('El servicio no está listo para finalizar.');
          try{await rpc('advance_driver_service_progress',{p_service_id:a.id,p_target_stage:'finished'});}
          catch(error){const recovered=await context(a.id);if(recovered.operational_status!=='completed')throw error;}
          a.operationalDone=true;
        }else a.operationalDone=c.operational_status==='completed';
        if(!a.operationalDone)throw Error('Completa primero el servicio mediante el flujo del conductor.');
        if(a.kind==='driver'&&!a.operationalRefreshed){
          try{await onOperationalComplete();a.operationalRefreshed=true;}catch(_){a.operationalRefreshed=false;}
        }
        check(a);
        const name=a.kind==='driver'?'close_driver_service_financial':a.kind==='receivable'?'collect_receivable_cash':'close_admin_service_financial';
        a.rejected=false;
        let result;
        try{result=await rpc(name,JSON.parse(a.sent));}catch(error){a.rejected=['22023','23503','23514','42501','28000','0A000'].includes(error.code);throw error;}
        const sent=JSON.parse(a.sent),paid=Number(result?.paid_amount),pending=Number(result?.pending_amount),total=Number(result?.total_amount);
        if(!result||result.service_id!==a.id||result.financial_close!=='resolved'||result.payment_result!==sent.p_payment_result||Number(result.amount_received)!==sent.p_amount_received||
          ![paid,pending,total].every(Number.isFinite)||paid<0||pending<0||Math.abs(paid+pending-total)>0.001||
          (sent.p_amount_received>0&&(!uuid(result.payment_id)||!uuid(result.cash_movement_id))))throw Error('Respuesta financiera no confirmada; conserva este intento.');
        a.result=result;
      }
      try{await refresh(a.result);a.refreshPending=false;}catch(_){a.refreshPending=true;}
      return {result:a.result,refreshPending:a.refreshPending};
    }finally{writing=false;a.busy=false;}
  }
  async function reload(a){
    check(a);a.latestContext=await context(a.id);
    if(a.kind==='driver'){
      await window.ElaraDriver?.refreshFinancialClose?.({finance:true});
    }else{
      const op=window.ElaraOperationalData;
      await Promise.all([op.readAll('v_admin_receivable_overview','receivable_id'),op.readRpc('get_admin_cash_movements')]);
      if(a.kind==='receivable')await window.ElaraReceivables?.showReceivables?.();else await window.ElaraServices?.showServices?.();
    }
  }
  function reset(){if(dialog){dialog.element.remove();dialog=null;}/* uncertain receipts remain keyed by actor in memory */}
  function field(name,label,type='text',value=''){return `<label>${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" step="0.01"':''}></label>`;}
  function reviewOnly(id,message){
    const element=document.createElement('div');element.className='modal-backdrop';
    element.innerHTML='<section class="modal financial-close-modal" role="dialog" aria-modal="true" aria-labelledby="financial-review-title"><header class="modal__header"><h2 id="financial-review-title">Revisar estado del cobro</h2><button type="button" data-financial-dismiss>Cerrar</button></header><div class="modal__body" data-financial-body role="status"></div></section>';
    document.body.append(element);dialog={element};
    const body=element.querySelector('[data-financial-body]');body.textContent=message;
    element.querySelector('[data-financial-dismiss]').onclick=()=>{element.remove();if(dialog?.element===element)dialog=null;};
    const review=document.createElement('button');review.type='button';review.textContent='Revisar estado del cobro';body.append(review);
    review.onclick=async()=>{review.disabled=true;try{const c=await context(id);body.textContent=`Estado remoto: ${c.financial_close}. Pagado: ${c.paid_amount}; pendiente: ${c.pending_amount} ${c.currency_code}. ${c.last_receipt?'Existe un recibo propio aplicado.':'No se puede identificar inequívocamente el intento anterior.'} El intento local requiere revisión; no se habilita otro cobro.`;}catch(error){body.textContent=error.message;review.disabled=false;body.append(review);}};
  }
  async function open(kind,id,receivableId=null,additional=false){
    if(writing)return;
    if(dialog){if(dialog.attempt?.busy)return;dialog.element.remove();dialog=null;}
    const requestedKind=kind,requestedReceivableId=receivableId;
    const mapKey=`${actor()}/${auth()?.getActiveContext?.()}/${kind}/${id}`;
    let a;try{a=attempts.get(mapKey);if(!a){a=operation(kind,id,receivableId);attempts.set(mapKey,a);}check(a);}catch(error){return reviewOnly(id,error.message);}kind=a.kind;receivableId=a.receivableId;
    const element=document.createElement('div');element.className='modal-backdrop';element.id='financial-close-dialog';
    element.innerHTML='<section class="modal financial-close-modal" role="dialog" aria-modal="true" aria-labelledby="financial-close-title"><header class="modal__header"><h2 id="financial-close-title">Cierre financiero · efectivo</h2><button type="button" data-financial-dismiss>Cerrar</button></header><div class="modal__body" data-financial-body role="status">Consultando precio y saldo remotos…</div></section>';
    document.body.append(element);dialog={element,attempt:a};
    element.querySelector('[data-financial-dismiss]').onclick=()=>{if(!a.busy){element.remove();if(dialog?.element===element)dialog=null;}};
    try{
      const c=await context(id);check(a);if(!element.isConnected)return;
      a.operationalDone=c.operational_status==='completed';
      if(kind==='driver'&&a.operationalDone){try{await window.ElaraDriver?.refreshFinancialClose?.();}catch(_){/* Context above remains authoritative; no operational mutation is retried. */}}
      const body=element.querySelector('[data-financial-body]');body.removeAttribute('role');
      let recovered=null;
      if(a.sent){const receipt=await rpc('get_financial_close_receipt',{p_service_id:id,p_request_key:a.key});check(a);if(receipt.status==='applied'){const p=JSON.parse(a.sent);if(receipt.result?.service_id!==id||receipt.result.payment_result!==p.p_payment_result||Number(receipt.result.amount_received)!==p.p_amount_received)throw Error('Recibo incompatible; revisar estado del cobro.');recovered=receipt.result;a.result=recovered;}else if(receipt.status!=='not_found')throw Error('Estado ambiguo; revisar estado del cobro.');}
      else if(!additional&&c.last_receipt)recovered=c.last_receipt.result;
      if(recovered){
        body.textContent=`${c.no_charge?'Sin importe a cobrar. ':''}Cierre financiero resuelto. Resultado remoto: ${recovered.payment_result}; recibido ${recovered.amount_received} ${c.currency_code}. Pendiente actual: ${c.pending_amount} ${c.currency_code}.`;
        if(kind!=='driver'&&Number(c.pending_amount)>0){const next=document.createElement('button');next.type='button';next.textContent='Iniciar un nuevo cobro adicional sobre el saldo';body.append(next);next.onclick=async()=>{try{forgetAttempt(a);await open(requestedKind,id,requestedReceivableId,true);}catch(error){window.ElaraNotifications?.showToast(error.message,'error');}};}return;
      }
      if(kind==='driver'&&c.financial_close==='resolved'&&!a.sent){body.textContent=`Cierre financiero ya registrado. Pendiente: ${c.pending_amount} ${c.currency_code}. Los cobros posteriores corresponden a Administración.`;return;}
      if(c.pricing_status!=='finalized'){
        body.textContent=`${c.operational_status==='completed'?'Servicio completado; cierre financiero pendiente. ':''}Precio draft: Administración debe finalizar el precio. No se registrará ningún cobro.`;
        if(kind==='driver'&&c.operational_status!=='completed'){
          const finish=document.createElement('button');finish.type='button';finish.textContent='Completar servicio; dejar cierre financiero pendiente';body.append(finish);
          finish.onclick=async()=>{if(writing)return;writing=true;a.busy=true;finish.disabled=true;try{check(a);await rpc('advance_driver_service_progress',{p_service_id:id,p_target_stage:'finished'});a.operationalDone=true;await window.ElaraDriver?.refreshFinancialClose?.();body.textContent='Servicio completado; cierre financiero pendiente de precio. Reabre desde Historial después de que Administración fije el precio.';}catch(error){body.textContent=(a.operationalDone?'Servicio completado; cierre financiero pendiente. Actualización de la vista pendiente. ':'Resultado operativo pendiente de comprobar. Reabre desde Historial o Servicios. ')+error.message;}finally{writing=false;a.busy=false;}};
        }return;
      }
      if(c.no_charge){
        body.textContent='Sin importe a cobrar. Resolver el cierre sin pago, movimiento de caja ni CxC.';
        const resolve=document.createElement('button');resolve.type='button';resolve.textContent=a.operationalDone?'Resolver cierre sin importe':'Finalizar servicio sin importe';body.append(resolve);
        resolve.onclick=async()=>{if(writing||a.busy)return;resolve.disabled=true;try{await execute(a,{},()=>reload(a),()=>window.ElaraDriver?.refreshFinancialClose?.());body.textContent='Sin importe a cobrar. Cierre financiero resuelto.';}catch(e){body.textContent=e.message;resolve.disabled=false;body.append(resolve);}};return;
      }
      let accounts=[];if(kind!=='driver'){const op=window.ElaraOperationalData;op.indexRecords({cash_accounts:await op.readAll('cash_accounts')});accounts=op.getCollection('cash_accounts').filter(r=>r.status==='active'&&['central','administrative'].includes(r.account_type)&&r.currency_code===c.currency_code);}
      if(!element.isConnected)return;
      const frozen=a.sent?JSON.parse(a.sent):null;
      body.innerHTML=`<p data-financial-summary>Precio final: ${esc(c.total_amount)} ${esc(c.currency_code)} · Ya pagado: ${esc(c.paid_amount)} · Pendiente: ${esc(c.pending_amount)}</p>
       <p data-financial-payments>Pagos registrados: ${esc((c.payments||[]).map(p=>`${p.payment_id}: ${p.amount} (${p.status})`).join(' · ')||'Ninguno')}</p>
       <p>${kind==='driver'?'El efectivo queda en tu cuenta de conductor; no entra en central.':'Cobro administrativo en la cuenta central/administrativa receptora.'}</p>
       ${kind==='driver'&&!c.cash_account_ready?'<p>Administración debe preparar tu cuenta driver antes de registrar efectivo. No cobrado no requiere cuenta.</p>':''}
       <form data-financial-form><label>Resultado del cobro<select name="result"><option value="full">Cobrado completo</option><option value="partial">Cobrado parcialmente</option><option value="unpaid">No cobrado</option></select></label>
       ${field('amount','Importe recibido si parcial','number',frozen?.p_amount_received??'')}
       <p data-financial-pending></p>${field('reason','Motivo obligatorio si parcial/no cobrado','text',frozen?.p_reason_code||'')}
       <label>Observaciones<textarea name="notes" maxlength="2000">${esc(frozen?.p_notes||'')}</textarea></label>
       ${kind==='driver'?'':`<label>Cuenta receptora<select name="account"><option value="">Selecciona…</option>${accounts.map(r=>`<option value="${esc(r.id)}">${esc(r.name)} · ${esc(r.account_type)}</option>`).join('')}</select></label>`}
       <p data-financial-status role="status" aria-live="polite">${a.operationalDone?(c.financial_close==='resolved'?'Cierre inicial registrado; cobro adicional sobre el saldo.':'Servicio completado; cierre financiero pendiente.'):''}</p>
       <button type="submit">${c.operational_status==='completed'?'Registrar / reintentar cierre financiero':'Finalizar servicio y registrar cierre'}</button></form>`;
      const form=body.querySelector('form'),status=form.querySelector('[data-financial-status]');
      if(frozen){form.elements.result.value=frozen.p_payment_result;if(form.elements.account)form.elements.account.value=frozen.p_cash_account_id||'';}
      const update=()=>{const mode=form.elements.result.value,received=mode==='full'?Number(c.pending_amount):mode==='unpaid'?0:Number(form.elements.amount.value);form.querySelector('[data-financial-pending]').textContent=`Pendiente estimado: ${(Number(c.pending_amount)-received).toFixed(2)} ${c.currency_code}. El backend validará el saldo.`;form.elements.amount.disabled=mode!=='partial'||Boolean(a.sent);};
      form.elements.result.onchange=update;form.elements.amount.oninput=update;update();
      if(a.sent)form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=true);
      form.onsubmit=async event=>{
        event.preventDefault();if(writing||a.busy)return;
        const values={result:form.elements.result.value,amount:form.elements.amount.value,reason:form.elements.reason.value,notes:form.elements.notes.value,account:form.elements.account?.value};
        const controls=[...element.querySelectorAll('button,input,select,textarea')];controls.forEach(el=>el.disabled=true);status.textContent='Esperando confirmación remota…';
        try{const result=await execute(a,values,()=>reload(a),()=>window.ElaraDriver?.refreshFinancialClose?.());const current=a.latestContext||a.result;status.textContent=result.refreshPending?'Cierre confirmado; actualización pendiente. Reintenta para actualizar solo lecturas.':`Cierre confirmado. Pendiente actual: ${current.pending_amount} ${current.currency_code}.`;const summary=body.querySelector('[data-financial-summary]');if(summary)summary.textContent=`Precio final: ${current.total_amount} ${current.currency_code} · Ya pagado: ${current.paid_amount} · Pendiente: ${current.pending_amount}`;const payments=body.querySelector('[data-financial-payments]');if(payments&&current.payments)payments.textContent='Pagos registrados: '+(current.payments.map(p=>`${p.payment_id}: ${p.amount} (${p.status})`).join(' · ')||'Ninguno');form.querySelector('[type="submit"]').textContent='Actualizar lectura';}
        catch(error){status.textContent=`${a.operationalDone?'Servicio completado; cierre financiero pendiente. ':''}${error.message} ${a.sent?'Reintenta este mismo intento; no registres otro cobro sin revisar el resultado.':''}`;}
        finally{
          controls.filter(el=>el.tagName==='BUTTON').forEach(el=>el.disabled=false);
          if(!a.sent){controls.forEach(el=>el.disabled=false);update();}
          if(a.rejected&&!body.querySelector('[data-financial-correct]')){
            const correct=document.createElement('button');correct.type='button';correct.dataset.financialCorrect='';correct.textContent='Corregir datos del intento rechazado';body.append(correct);
            correct.onclick=async()=>{if(writing)return;try{const receipt=await rpc('get_financial_close_receipt',{p_service_id:id,p_request_key:a.key});if(receipt.status!=='not_found')return open(kind,id,receivableId);forgetAttempt(a);await open(requestedKind,id,requestedReceivableId);}catch(error){status.textContent=error.message;}};
          }
        }
      };
    }catch(error){if(element.isConnected){const body=element.querySelector('[data-financial-body]');body.textContent=error.message;const review=document.createElement('button');review.type='button';review.textContent='Revisar estado del cobro';body.append(review);review.onclick=()=>{attempts.delete(mapKey);void open(kind,id,receivableId).catch(e=>window.ElaraNotifications?.showToast(e.message,'error'));};}}
  }
  async function adminTool(kind,id){
    if(writing)return;if(!isAdmin())throw Error('Se requiere Administración.');
    const expectedActor=actor();
    const op=window.ElaraOperationalData;await op.loadIdentity();
    if(actor()!==expectedActor||!isAdmin())throw Error('La sesión cambió.');
    if(kind==='provision'){
      if(!op.getCollection('drivers').some(d=>d.id===id))throw Error('Conductor no operativo.');
      // Provision is already idempotent on the driver account identity.
      writing=true;try{const provisioned=await rpc('provision_driver_cash_account',{p_driver_id:id});if(!uuid(provisioned))throw Error('Confirmación de cuenta no válida; revisa la cuenta remota.');window.ElaraNotifications?.showToast('Cuenta driver preparada.','success');}finally{writing=false;}return;
    }
    if(!op.getCollection('services').some(s=>s.id===id))throw Error('Servicio no operativo.');
    const c=await context(id);if(c.pricing_status==='finalized')throw Error('Precio ya finalizado; revisa el detalle remoto.');
    if(dialog?.attempt?.busy)return;if(dialog)reset();
    const element=document.createElement('div');element.className='modal-backdrop';
    element.innerHTML=`<section class="modal financial-close-modal" role="dialog" aria-modal="true" aria-labelledby="financial-pricing-title"><header class="modal__header"><h2 id="financial-pricing-title">Finalizar precio</h2><button type="button" data-financial-dismiss>Cerrar</button></header><form class="modal__body">${field('base','Base del servicio','number')}${field('tax','Impuesto (%) explícito','number')}<p>El conductor no puede modificar este precio.</p><p role="status"></p><button type="submit">Finalizar precio definitivo</button></form></section>`;
    document.body.append(element);dialog={element};element.querySelector('[data-financial-dismiss]').onclick=()=>{if(!writing){element.remove();dialog=null;}};
    element.querySelector('form').onsubmit=async e=>{e.preventDefault();if(writing)return;const form=e.target,base=Number(form.elements.base.value),tax=Number(form.elements.tax.value);if(!form.elements.base.value||!form.elements.tax.value||!Number.isFinite(base)||base<0||!Number.isFinite(tax)||tax<0||tax>100){form.querySelector('[role="status"]').textContent='Revisa base e impuesto explícito.';return;}
      writing=true;const buttons=[...element.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
      try{if(!isAdmin()||actor()!==expectedActor)throw Error('Contexto administrativo no válido.');await rpc('finalize_service_pricing',{p_service_id:id,p_base_amount:base,p_tax_rate:tax,p_notes:null});await context(id);form.querySelector('[role="status"]').textContent='Precio finalizado y consultado.';}
      catch(error){form.querySelector('[role="status"]').textContent='Revisa el precio remoto antes de otro intento. '+error.message;}
      finally{writing=false;buttons[0].disabled=false;/* no blind retry of the one-shot pricing RPC */}
    };
  }
  document.addEventListener('click',event=>{const b=event.target.closest?.('[data-financial-kind]');if(!b)return;const kind=b.dataset.financialKind,id=b.dataset.financialId;const task=['pricing','provision'].includes(kind)?adminTool(kind,id):open(kind,id,b.dataset.receivableId);void task.catch(error=>window.ElaraNotifications?.showToast(error.message,'error'));});
  return Object.freeze({operation,args,execute,context,open,reset});
})();
