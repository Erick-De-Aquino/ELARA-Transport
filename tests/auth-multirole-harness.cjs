const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const source=fs.readFileSync('src/js/auth.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function environment(roles=['administrativo','superadmin','conductor']){
  const user={id:'auth-user',email:'local@example.invalid'};
  const session={user,access_token:'x.'+Buffer.from(JSON.stringify({session_id:'auth-session'})).toString('base64url')+'.x'};
  return {session,context:roles[0],rows:roles.map(role_key=>({user_id:'app-user',role_key,status:'active',starts_at:'2020-01-01',ends_at:null,revoked_at:null})),catalog:roles.map(key=>({key,is_active:true})),channels:[],tail:Promise.resolve(),calls:[],beforeRpc:null,beforeRead:null,readError:null,driver:true};
}
function setup(env=environment()){
  const {window:domWindow,document}=parseHTML(fs.readFileSync('src/index.html','utf8'));
  const navigator={locks:{request(_key,fn){const p=env.tail.then(fn);env.tail=p.catch(()=>{});return p;}}};
  const window=new Proxy(domWindow,{get(target,key){return key==='navigator'?navigator:Reflect.get(target,key);}});
  const storage=new Map(),messages=[],events=[],timers=[],resets=[],routes=[];let signedOut=false,authCallback;
  const query=table=>{const filters=[];let single=false;
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},order(){return q;},limit(){return q;},maybeSingle(){single=true;return q;},then(resolve,reject){return (async()=>{
      await env.beforeRead?.(table);
      if(env.readError&&['roles','user_roles'].includes(table))return {error:env.readError};
      let data=table==='user_roles'?env.rows:table==='roles'?env.catalog:table==='user_driver_links'?(env.driver?[{user_id:'app-user',driver_id:'driver',status:'active',started_at:'2020-01-01',ended_at:null,...env.link}]:[]):table==='drivers'?[{id:'driver',person_id:'person',administrative_status:env.driverStatus||'active'}]:table==='persons'?[{id:'person',first_name:'Local',last_name:'Driver'}]:[];
      data=data.filter(row=>filters.every(([k,v])=>row[k]===v));return {data:single?data[0]||null:data.map(r=>({...r}))};
    })().then(resolve,reject);}};return q;};
  const client={from:query,async rpc(name,args){env.calls.push({name,args});if(name==='end_current_app_session')return {data:true};
    const custom=await env.beforeRpc?.(name,args);if(custom)return custom;
    const role=args?.p_requested_context;
    const available=r=>env.rows.some(row=>row.role_key===r&&row.status==='active'&&!row.revoked_at&&Date.parse(row.starts_at)<=Date.now()&&(row.ends_at==null||Date.parse(row.ends_at)>Date.now()))&&env.catalog.some(row=>row.key===r&&row.is_active);
    if(signedOut)return {error:{code:'28000',message:'Ended session'}};
    if(!available(role||env.context))return {error:{code:'42501',message:'Current application session active_context is no longer an active role.'}};
    if(role)env.context=role;return {data:[{app_session_id:'app-session',app_user_id:'app-user',active_context:env.context}]};
  },auth:{getSession:async()=>({data:{session:signedOut?null:env.session}}),onAuthStateChange(fn){authCallback=fn;},async signOut(){signedOut=true;authCallback?.('SIGNED_OUT',null);return {};}}};
  Object.defineProperty(window,'BroadcastChannel',{configurable:true,value:class {constructor(){env.channels.push(this);}postMessage(data){for(const c of env.channels)if(c!==this)c.onmessage?.({data});}}});
  window.ElaraSupabase={client};window.atob=s=>Buffer.from(s,'base64').toString();
  window.setInterval=fn=>{timers.push(fn);return timers.length;};window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;
  window.location={hash:'#clientes',pathname:'/',search:''};window.history={replaceState(_a,_b,url){window.location.hash=url.includes('#')?'#'+url.split('#')[1]:'';}};
  window.ElaraNotifications={showToast:(message,type)=>messages.push({message,type})};
  for(const name of ['ElaraAdminControls','ElaraFinancialClose','ElaraOperationalData'])window[name]={reset(){resets.push(name);}};
  window.ElaraRouter={refreshNavigationForActiveContext(){routes.push(window.ElaraAuth.getActiveContext());document.querySelector('#sidebar-nav').textContent=window.ElaraAuth.getActiveContext();},navigateTo(){},showCurrentRoute(){}};
  window.addEventListener('elara:auth-session-updated',e=>events.push(e.detail.reason));
  const ctx={window,document,CustomEvent:window.CustomEvent,console,localStorage:{removeItem:k=>storage.delete(k),getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(source,ctx);
  const api=window.ElaraAuth;
  const init=async()=>{ctx.bindContextSynchronization();ctx.bindContextSwitcher();await ctx.initializeAuthenticatedAppSession(env.session,env.session.user);ctx.renderAuthState();};
  return {window,document,env,client,ctx,api,init,storage,messages,events,resets,routes,timers,tick,
    changeUser(session){env.session=session;ctx.clearAuthenticatedState();},emitAuth(event,session){ctx.bindSupabaseAuthState();authCallback(event,session);}};
}
module.exports={setup,environment,deferred,tick};
