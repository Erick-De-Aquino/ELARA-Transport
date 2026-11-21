const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {uuid,readClient,settle}=require('./services-presentation-harness.cjs');
function fixture(count=32){
 const tables={persons:[],companies:[],customers:[],drivers:[],vehicles:[],services:[],service_assignments:[],cash_accounts:[{id:uuid(500),name:'Central local',account_type:'central',currency_code:'EUR',status:'active',opening_balance:'100.00'}],cash_counts:[],cash_discrepancies:[],get_admin_cash_movements:[],get_admin_cash_remittances:[],get_admin_cash_discrepancies:[],v_admin_cash_account_overview:[]};
 let cents=10000n;
 for(let i=0;i<count;i++){const out=i%2===1;tables.get_admin_cash_movements.push({cash_movement_id:uuid(i+1),human_code:'CASH-'+String(i+1).padStart(6,'0'),cash_account_id:uuid(500),cash_account_name:'Central local',cash_account_type:'central',movement_type:out?'outflow':'inflow',movement_category:'manual_adjustment',source_type:'manual_adjustment',source_id:uuid(1000+i),amount:'0.10',currency_code:'EUR',description:'Concepto '+i,occurred_at:'2026-10-24T23:30:00Z',metadata:{}});cents+=out?-10n:10n;}
 tables.v_admin_cash_account_overview.push({cash_account_id:uuid(500),name:'Central local',account_type:'central',currency_code:'EUR',status:'active',opening_balance:'100.00',theoretical_balance:String(cents/100n)+'.'+String(cents%100n).padStart(2,'0')});
 tables.get_admin_cash_remittances.push({remittance_id:uuid(600),human_code:'REM-000001',status:'submitted',driver_id:uuid(501),driver_name:'Conductor local',declared_amount:'500.00',verified_amount:null,currency_code:'EUR',created_at:'2026-10-25T10:00:00Z',source_cash_account_id:uuid(502),destination_cash_account_id:uuid(500)});
 tables.get_admin_cash_discrepancies.push({discrepancy_id:uuid(700),human_code:'DIF-000001',status:'open',discrepancy_type:'remittance',expected_amount:'500.00',actual_amount:'480.00',difference_amount:'-20.00',currency_code:'EUR'});
 tables.cash_movements=tables.get_admin_cash_movements.map(m=>({...m,id:m.cash_movement_id}));
 return tables;
}
function setup({tables=fixture(),beforeRead,role='administrativo',inspectRefresh=false}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[];
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});
 for(const view of document.querySelectorAll('.view'))view.hidden=view.id!=='caja';
 window.ElaraAuth={getCurrentUser:()=>({id:uuid(900)}),getActiveContext:()=>role};
 window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 window.ElaraSupabase.client.rpc=async(name,args)=>{calls.push({rpc:name,args});if(beforeRead)await beforeRead(name);if(name==='get_admin_cash_remittance_detail')return {data:[tables.get_admin_cash_remittances.find(r=>r.remittance_id===args.p_remittance_id)]};if(name==='get_admin_cash_discrepancy_detail')return {data:[tables.get_admin_cash_discrepancies.find(r=>r.discrepancy_id===args.p_discrepancy_id)]};if(!tables[name])throw Error('Unexpected write '+name);let rows=tables[name];if(args.p_cash_account_id)rows=rows.filter(r=>r.cash_account_id===args.p_cash_account_id);return {data:rows.slice(args.p_offset,args.p_offset+args.p_limit).map(r=>({...r,total_count:rows.length}))};};
 window.ElaraFinanceMock=new Proxy({}, {get(){throw Error('Legacy finance data accessed');}});
 const context={window,document,console,Intl,Set,Map,Date,crypto:require('node:crypto').webcrypto};vm.createContext(context);
 for(const file of ['operational-data','cash']){
  let source=fs.readFileSync('src/js/'+file+'.js','utf8');
  if(inspectRefresh&&file==='catalog-admin')source=source.replace('return Object.freeze({operation,payload,','return Object.freeze({refresh,operation,payload,');
  vm.runInContext(source,context);
 }
 return {window,document,context,tables,calls,op:window.ElaraOperationalData,show:()=>context.showOperationalCash(),panel:()=>document.querySelector('#caja [data-operational-panel]')};
}

module.exports={fixture,setup};
