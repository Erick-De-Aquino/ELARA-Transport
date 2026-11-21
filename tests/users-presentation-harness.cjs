const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const {readClient,uuid,settle}=require('./services-presentation-harness.cjs');
function fixture(count=25){return {
 app_users:Array.from({length:count},(_,i)=>({id:uuid(i+1),person_id:uuid(1000+i),human_code:'USR-'+String(i+1).padStart(6,'0'),status:i%2?'inactive':'active',default_context:'superadmin',internal_note:i===0?'Nota administrativa local':''})),
 persons:Array.from({length:count},(_,i)=>({id:uuid(1000+i),first_name:'Usuario',last_name:'Local '+i,contact_email:'contacto'+i+'@example.test'})),
 roles:['superadmin','administrativo','conductor'].map(key=>({key,is_active:true})),
 user_roles:[{id:uuid(3000),user_id:uuid(1),role_key:'superadmin',status:'active',starts_at:'2020-01-01T00:00:00Z',ends_at:null},{id:uuid(3001),user_id:uuid(1),role_key:'conductor',status:'active',starts_at:'2020-01-01T00:00:00Z',ends_at:null},{id:uuid(3002),user_id:uuid(2),role_key:'conductor',status:'active',starts_at:'2020-01-01T00:00:00Z',ends_at:'2021-01-01T00:00:00Z'},{id:uuid(3003),user_id:uuid(1),role_key:'administrativo',status:'revoked',starts_at:'2020-01-01T00:00:00Z',ends_at:'2021-01-01T00:00:00Z',revoked_at:'2021-01-01T00:00:00Z'}],
 user_driver_links:[{id:uuid(4000),user_id:uuid(1),driver_id:uuid(5000),status:'active'}],drivers:[{id:uuid(5000),human_code:'DRV-000001'}],
 audit_logs:[{id:uuid(6000),entity_table:'user_roles',entity_id:uuid(3000),occurred_at:'2026-01-01T00:00:00Z',action:'permission_change',reason:'Motivo local'},{id:uuid(6001),entity_table:'app_users',entity_id:uuid(2),occurred_at:'2026-01-01T00:00:00Z',action:'update',reason:'Otro usuario'}]
};}
function setup({tables=fixture(),role='superadmin',beforeRead}={}){
 const {window,document}=parseHTML(fs.readFileSync('src/index.html','utf8')),calls=[];let actor='operator',contextRole=role;
 for(const view of document.querySelectorAll('[data-view]'))view.hidden=view.id!=='usuarios';
 window.ElaraAuth={getCurrentUser:()=>actor?{id:actor,appSessionId:'session'}:null,getActiveContext:()=>contextRole};window.ElaraSupabase={client:readClient(tables,calls,beforeRead)};
 for(const key of ['ElaraUsersMock','ElaraCollaboratorsMock'])Object.defineProperty(window,key,{configurable:true,get(){throw Error('Mock accessed');}});
 const context={window,document,console,Date,Intl,Map,Set};vm.createContext(context);for(const file of ['operational-data','users'])vm.runInContext(fs.readFileSync('src/js/'+file+'.js','utf8'),context);
 const click=node=>node.dispatchEvent(new window.Event('click',{bubbles:true}));
 return {window,document,context,tables,calls,api:window.ElaraUsers,show:()=>window.ElaraUsers.showUsers(),click,role(value){contextRole=value;window.dispatchEvent(new window.CustomEvent('elara:auth-session-updated'));},actor(value){actor=value;window.dispatchEvent(new window.CustomEvent('elara:auth-session-updated'));}};
}
module.exports={setup,fixture,uuid,settle};
