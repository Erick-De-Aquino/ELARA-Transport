const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {readClient,settle}=require('./services-presentation-harness.cjs');
function fixture(){return {app_settings:[['operations.default_service_conflict_minutes','number',120],['operations.vehicle_document_expiring_days','number',30],['operations.internal_driver_priority_enabled','boolean',true],['operations.periodic_services_enabled','boolean',false],['system.environment_label','string','production'],['system.audit_retention_mode','string','indefinite']].map(([setting_key,value_type,value_json],i)=>({id:'setting-'+i,setting_key,setting_scope:setting_key.split('.')[0],value_type,value_json,is_active:true,is_sensitive:false,scope_reference_id:null,effective_from:'2020-01-01T00:00:00Z',effective_until:null})),configurable_catalogs:[{id:'catalog',catalog_key:'service_types',name_es:'Tipos de servicio',is_active:true}],configurable_catalog_items:[{id:'item',catalog_id:'catalog',item_key:'airport',label_es:'Aeropuerto',is_active:true,sort_order:1}]};}
function setup({tables=fixture(),role='superadmin',beforeRead}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[];let actor='operator',session='session',contextRole=role;
 for(const view of document.querySelectorAll('[data-view]'))view.hidden=view.id!=='configuracion';
 window.ElaraAuth={getCurrentUser:()=>actor?{id:actor,appSessionId:session}:null,getActiveContext:()=>contextRole};window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 const context={window,document,console,Date,Intl,Map,Set};vm.createContext(context);for(const file of ['operational-data','settings'])vm.runInContext(fs.readFileSync('src/js/'+file+'.js','utf8'),context);
 return {window,document,tables,calls,api:window.ElaraSettings,show:()=>window.ElaraSettings.showSettings(),role(value){contextRole=value;window.dispatchEvent(new window.CustomEvent('elara:auth-session-updated'));},actor(value){actor=value;window.dispatchEvent(new window.CustomEvent('elara:auth-session-updated'));},session(value){session=value;window.dispatchEvent(new window.CustomEvent('elara:auth-session-updated'));}};
}
module.exports={setup,fixture,settle};
