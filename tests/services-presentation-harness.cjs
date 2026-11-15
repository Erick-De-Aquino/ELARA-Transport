const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const uuid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fixtureRows(count=32){return Array.from({length:count},(_,i)=>({service_id:uuid(i+1),human_code:'SRV-'+String(i+1).padStart(6,'0'),service_type:'transfer',operational_status:['pending','confirmed','in_progress','completed','cancelled','no_show','not_performed'][i%7],scheduled_start_at:'2026-11-10T10:00:00Z',customer_id:uuid(500),customer_display_name:i===0?'Cliente con nombre largo para comprobar la presentaci\u00f3n responsive en todos los tama\u00f1os':'Cliente '+i,current_assignment_id:i%3?uuid(1000+i):null,assignment_status:i%3?'accepted':null,driver_id:i%3?uuid(600):null,driver_display_name:i%3?'Conductor de prueba con nombre largo':null,vehicle_id:i%3?uuid(700):null,plate_normalized:i%3?'1234-BCD':null,pricing_status:i%4?'finalized':'draft',total_amount:i%5?20:0,paid_amount:i%6?0:5,pending_amount:i%5?20:0,currency_code:'EUR'}));}
function fixtureTables(rows=fixtureRows()){
 return {persons:[],companies:[],customers:[{id:uuid(500),status:'active'}],drivers:[{id:uuid(600),administrative_status:'active'}],vehicles:[{id:uuid(700),plate_normalized:'1234-BCD'}],cash_accounts:[],services:rows.map(r=>({id:r.service_id,...r})),service_assignments:[],cash_counts:[],cash_discrepancies:[],v_admin_service_overview:rows,
 service_locations:rows.flatMap((r,i)=>[{id:uuid(2000+i*2),service_id:r.service_id,location_type:'origin',label:'Origen '+i+' con direcci\u00f3n larga de prueba, avenida y referencia del pasajero'},{id:uuid(2001+i*2),service_id:r.service_id,location_type:'destination',label:'Destino '+i+' con una direcci\u00f3n extensa que debe poder leerse sin cortar la vista'}]),service_driver_progress:[],service_closures:[],service_status_history:[],service_financials:[]};
}
function readClient(tables,calls,beforeRead){return {from(table){let ids=null,column=null;return {select(){return this;},in(c,v){column=c;ids=v;return this;},order(){return this;},async range(start,end){
 let rows=(tables[table]||[]).filter(r=>!ids||ids.includes(r[column]));const count=rows.length;rows=rows.slice(start,end+1);
 calls.push({table,column,ids,start,end});if(beforeRead)await beforeRead(table,rows);return {data:rows,count,error:null};
 }};},rpc(){throw Error('Unexpected RPC write/read from presentation');}};}
function setup({rows=fixtureRows(),beforeRead,detail}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),tables=fixtureTables(rows),calls=[],actions=[];
 for(const view of document.querySelectorAll('.view'))view.hidden=true;document.getElementById('servicios').hidden=false;
 window.ElaraAuth={getCurrentUser:()=>({id:uuid(900)}),getActiveContext:()=> 'administrativo'};
 window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 window.ElaraFinancialClose={context:async id=>({financial_close:id.endsWith('4')?'pending':'resolved',no_charge:false})};
 window.ElaraServicesMock={};Object.defineProperty(window.ElaraServicesMock,'services',{get(){throw Error('Mock services used');}});
 const context={window,document,console,Intl,Set,Map,Date};vm.createContext(context);
 vm.runInContext(fs.readFileSync('src/js/operational-data.js','utf8'),context);
 if(detail)window.ElaraOperationalData={...window.ElaraOperationalData,serviceDetail:detail};
 vm.runInContext(fs.readFileSync('src/js/services.js','utf8'),context);
 context.recordAction=(...args)=>actions.push(args);vm.runInContext('serviceAdminOpen=(...args)=>recordAction(...args);',context);
 return {window,document,context,tables,calls,actions,op:window.ElaraOperationalData,show:()=>context.showOperationalServices(),click:node=>node.dispatchEvent(new window.Event('click',{bubbles:true})),panel:()=>document.querySelector('#servicios [data-operational-panel]')};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
module.exports={setup,uuid,fixtureRows,fixtureTables,readClient,settle};
