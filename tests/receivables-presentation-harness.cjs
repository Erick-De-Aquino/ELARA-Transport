const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {uuid,readClient,settle}=require('./services-presentation-harness.cjs');
function fixture(count=32){
 const rows=Array.from({length:count},(_,i)=>({receivable_id:uuid(i+1),human_code:'REC-'+String(i+1).padStart(6,'0'),service_id:uuid(i+100),service_human_code:'SRV-'+String(i+1).padStart(6,'0'),customer_id:uuid(500),customer_human_code:'CUS-000001',customer_display_name:'Cliente local con nombre completo para la prueba de lectura',status:i%3?'partial':'open',original_amount:'100.30',collected_amount:i%3?'0.10':'0.00',pending_amount:i%3?'100.20':'100.30',currency_code:'EUR',opened_at:'2026-10-24T23:30:00Z',due_at:i%2?'2025-01-01T00:00:00Z':null}));
 return {persons:[],companies:[],customers:[{id:uuid(500),status:'active'}],drivers:[],vehicles:[],services:rows.map(r=>({id:r.service_id,operational_status:'completed'})),service_assignments:[],cash_accounts:[],cash_counts:[],cash_discrepancies:[],v_admin_receivable_overview:rows,receivable_allocations:[{id:uuid(800),receivable_id:uuid(1),payment_id:uuid(801)}],service_payments:[{id:uuid(801),human_code:'PAY-000001',service_id:uuid(100),payment_status:'reversed',payment_method:'cash',amount:'0.10',currency_code:'EUR',paid_at:'2026-10-24T23:30:00Z'}]};
}
function setup({tables=fixture(),beforeRead,role='administrativo',rpc}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[],actions=[];let actor=uuid(900);
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===v);}});
 for(const v of document.querySelectorAll('.view'))v.hidden=v.id!=='cuentas-por-cobrar';
 window.ElaraAuth={getCurrentUser:()=>({id:actor}),getActiveContext:()=>role};
 window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 window.ElaraSupabase.client.rpc=async(name,args)=>{calls.push({rpc:name,args});if(rpc)return rpc(name,args);if(name==='get_admin_cash_movements')return {data:[{cash_movement_id:uuid(802),human_code:'CASH-000001',source_type:'service_payment',source_id:uuid(801),cash_account_name:'Central local',total_count:1}]};if(name!=='get_service_financial_close_context')throw Error('Unexpected write');const r=tables.v_admin_receivable_overview.find(r=>r.service_id===args.p_service_id);return {data:{service_id:r.service_id,pricing_status:'finalized',operational_status:'completed',receivable:{id:r.receivable_id}}};};
 window.ElaraFinancialClose={open:(...args)=>actions.push(args),reset:()=>actions.push('reset')};
 window.ElaraReceivablesCore=new Proxy({},{get(){throw Error('Legacy data accessed');}});
 const context={window,document,console,Intl,Set,Map,Date};vm.createContext(context);
 for(const file of ['operational-data','receivables'])vm.runInContext(fs.readFileSync('src/js/'+file+'.js','utf8'),context);
 const panel=()=>document.querySelector('#cuentas-por-cobrar [data-operational-panel]');
 return {window,document,context,tables,calls,actions,show:()=>window.ElaraReceivables.showReceivables(),panel,actor:v=>actor=v,
 detail:async(i=0)=>{await panel().querySelector('[data-operational-results]').onclick({target:panel().querySelectorAll('[data-operational-detail]')[i]});}};
}
module.exports={fixture,setup,uuid,settle,readClient};
