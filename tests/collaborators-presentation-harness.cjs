const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {uuid,readClient,settle}=require('./services-presentation-harness.cjs');
function fixture(count=32){
 const tables={drivers:[],persons:[],vehicles:[],driver_vehicle_assignments:[],service_assignments:[],services:[]};
 for(let i=0;i<count;i++){
 tables.persons.push({id:uuid(1000+i),first_name:'Conductor '+i,last_name:'Apellido',status:'active',phone:'+3461000'+i,contact_email:'driver'+i+'@example.test'});
 tables.drivers.push({id:uuid(i+1),human_code:'DRV-'+String(i+1).padStart(6,'0'),person_id:uuid(1000+i),driver_type:i%2?'external_collaborator':'internal_driver',administrative_status:['active','pending_documents','suspended','inactive'][i%4],availability_preference:i%2?'unavailable':'available'});
 }
 tables.vehicles.push({id:uuid(5000),plate_normalized:'1234ABC',brand:'Marca',model:'Modelo'});tables.driver_vehicle_assignments.push({id:uuid(5100),driver_id:uuid(1),vehicle_id:uuid(5000),status:'active'});
 return tables;
}
function setup({tables=fixture(),beforeRead,role='administrativo',inspectRefresh=false}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[];
 for(const view of document.querySelectorAll('.view'))view.hidden=view.id!=='colaboradores';
 window.ElaraAuth={getCurrentUser:()=>({id:uuid(900)}),getActiveContext:()=>role};
 window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 window.ElaraCollaboratorsMock=new Proxy({}, {get(){throw Error('Legacy customer data accessed');}});
 const context={window,document,console,Intl,Set,Map,Date,crypto:require('node:crypto').webcrypto};vm.createContext(context);
 for(const file of ['operational-data','catalog-admin','collaborators']){
  let source=fs.readFileSync('src/js/'+file+'.js','utf8');
  if(inspectRefresh&&file==='catalog-admin')source=source.replace('return Object.freeze({operation,payload,','return Object.freeze({refresh,operation,payload,');
  vm.runInContext(source,context);
 }
 return {window,document,context,tables,calls,op:window.ElaraOperationalData,show:()=>context.showOperationalCollaborators(),panel:()=>document.querySelector('#colaboradores [data-operational-panel]')};
}

module.exports={fixture,setup};
