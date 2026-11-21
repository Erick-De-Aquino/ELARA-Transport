const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {uuid,readClient,settle}=require('./services-presentation-harness.cjs');
function fixture(count=32){
 const rows=Array.from({length:count},(_,i)=>({expense_id:uuid(i+1),human_code:'EXP-'+String(i+1).padStart(6,'0'),status:['draft','submitted','approved','cancelled'][i%4],expense_date:'2026-11-10',category_id:uuid(500),category_name:'Combustible',description:'Concepto local con una referencia extensa para revisar la lectura de los gastos',amount:'100.30',subtotal_amount:'100.30',tax_amount:'0.00',currency_code:'EUR',payment_responsibility:'elara',payment_status:'unpaid',reimbursement_status:'not_applicable',reimbursable:false,paid_amount:'0.00',reimbursed_amount:'0.00',pending_payment_amount:'100.30',pending_reimbursement_amount:'0.00',has_settlement_reference:false,settlement_reference_count:0,document_count:1,documents:[{document_id:uuid(600),document_number:'REF-'+('extensa-'.repeat(30)),file_name:'Documento de prueba',status:'active'}],payments:[],reimbursements:[],history:[],allocations:[]}));
 return {persons:[],companies:[],customers:[],drivers:[],vehicles:[],services:[],service_assignments:[],cash_counts:[],cash_discrepancies:[],cash_accounts:[{id:uuid(501),name:'Central local',status:'active',account_type:'central',currency_code:'EUR'}],expense_categories:[{id:uuid(500),name_es:'Combustible',is_active:true}],suppliers:[],get_admin_expenses:rows};
}
function setup({tables=fixture(),beforeRead,role='administrativo',rpc}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[],storage=new Map();let actor=uuid(900),contextRole=role;
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===v);}});
 Object.defineProperty(window,'sessionStorage',{configurable:true,value:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
 for(const v of document.querySelectorAll('.view'))v.hidden=v.id!=='gastos';
 window.ElaraAuth={getCurrentUser:()=>({id:actor}),getActiveContext:()=>contextRole};
 window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 window.ElaraSupabase.client.rpc=async(name,args)=>{calls.push({rpc:name,args});if(rpc)return rpc(name,args);if(beforeRead)await beforeRead(name);if(name==='get_admin_expense_detail')return {data:tables.get_admin_expenses.filter(r=>r.expense_id===args.p_expense_id)};if(name==='get_admin_expenses')return {data:tables.get_admin_expenses.slice(args.p_offset,args.p_offset+args.p_limit).map(r=>({...r,total_count:tables.get_admin_expenses.length}))};throw Error('Unexpected mutation '+name);};
 window.ElaraExpensesCore=new Proxy({},{get(){throw Error('Legacy expense data accessed');}});
 const context={window,document,console,Intl,Set,Map,Date};vm.createContext(context);for(const name of ['operational-data','expenses'])vm.runInContext(fs.readFileSync('src/js/'+name+'.js','utf8'),context);
 const panel=()=>document.querySelector('#gastos [data-operational-panel]');
 return {window,document,context,tables,calls,storage,api:window.ElaraExpenseAdmin,show:()=>window.ElaraExpenses.showExpenses(),panel,actor:v=>actor=v,role:v=>contextRole=v,detail:async(i=0)=>panel().querySelector('[data-operational-results]').onclick({target:panel().querySelectorAll('[data-operational-detail]')[i]})};
}
module.exports={fixture,setup,uuid,readClient,settle};
