const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {uuid,readClient,settle}=require('./services-presentation-harness.cjs');
function fixture(count=32){
 const tables={vehicles:[],drivers:[{id:uuid(5000),person_id:uuid(5001),driver_type:'internal_driver',administrative_status:'active'}],persons:[{id:uuid(5001),first_name:'Conductor',last_name:'Local',status:'active'}],driver_vehicle_assignments:[],vehicle_documents:[],vehicle_document_types:[{key:'insurance',label_es:'Seguro',is_active:true,required_for_owned:true,expires_required:true}],service_assignments:[],services:[],vehicle_technical_incidents:[],vehicle_maintenance_records:[]};
 for(let i=0;i<count;i++)tables.vehicles.push({id:uuid(i+1),human_code:'VEH-'+String(i+1).padStart(6,'0'),plate_normalized:String(1000+i)+'BCD',brand:'Marca '+i,model:'Modelo',color:'Negro',year:2024,seats:7,ownership_type:i%2?'external':'owned',manual_operational_status:['available','unavailable','blocked'][i%3],elara_approval_status:i%2?'approved':'not_required',inactive_at:i%4===3?'2026-01-01T00:00:00Z':null});
 if(count){tables.driver_vehicle_assignments.push({id:uuid(6000),driver_id:uuid(5000),vehicle_id:uuid(1),status:'active',started_at:'2026-01-01T00:00:00Z'});tables.vehicle_documents.push({id:uuid(7000),vehicle_id:uuid(1),document_type_key:'insurance',status:'valid',issued_at:'2026-01-01',expires_at:'2099-12-01',reference_number:'REF-LOCAL'});}
 return tables;
}
function setup({tables=fixture(),beforeRead,role='administrativo',inspectRefresh=false}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[];
 Object.defineProperty(window.HTMLSelectElement.prototype,'value',{configurable:true,get(){return this.querySelector('option[selected]')?.value||'';},set(value){for(const option of this.querySelectorAll('option'))option.toggleAttribute('selected',option.value===value);}});
 for(const view of document.querySelectorAll('.view'))view.hidden=view.id!=='vehiculos';
 window.ElaraAuth={getCurrentUser:()=>({id:uuid(900)}),getActiveContext:()=>role};
 window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 window.ElaraVehiclesMock=new Proxy({}, {get(){throw Error('Legacy vehicle data accessed');}});
 const context={window,document,console,Intl,Set,Map,Date,crypto:require('node:crypto').webcrypto};vm.createContext(context);
 for(const file of ['operational-data','catalog-admin','vehicles']){
  let source=fs.readFileSync('src/js/'+file+'.js','utf8');
  if(inspectRefresh&&file==='catalog-admin')source=source.replace('return Object.freeze({operation,payload,','return Object.freeze({refresh,operation,payload,');
  vm.runInContext(source,context);
 }
 return {window,document,context,tables,calls,op:window.ElaraOperationalData,show:()=>context.showOperationalVehicles(),panel:()=>document.querySelector('#vehiculos [data-operational-panel]')};
}

module.exports={fixture,setup};
