const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const source=fs.readFileSync('src/js/driver.js','utf8'),html=fs.readFileSync('src/index.html','utf8');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const overview={service_id:id,human_code:'SRV-TEST',service_type:'transfer',operational_status:'in_progress',assignment_status:'accepted',assignment_id:'assignment',scheduled_start_at:'2026-11-07T12:00:00Z',driver_stage:'on_way',origin_address:'Origin',destination_address:'Destination',primary_passenger_name:'Passenger'};
function setup({price={},row={},failure=false,rows}={}){
 const {window,document}=parseHTML(html),calls=[];
 window.ElaraOperationalData={isOperationalRecord:r=>!r.excluded};
 // Administrative/demo data must never override the real service's price.
 window.ElaraServicesMock={services:[{serviceId:id,financial:{totalPrice:99999}}]};
 window.ElaraServices={calculateServiceFinancialSummary:()=>{throw Error('Real price must not use demo/admin summary');}};
 window.ElaraSupabase={client:{rpc:async(name,args)=>{calls.push({name,args});
  if(name==='get_driver_service_overview')return {data:rows||[{...overview,...row}]};
  assert.equal(name,'get_service_financial_close_context');assert.deepEqual(JSON.parse(JSON.stringify(args)),{p_service_id:id});
  if(failure)throw Error('read unavailable');
  return {data:{service_id:id,pricing_status:'finalized',total_amount:20,currency_code:'EUR',paid_amount:0,pending_amount:20,
    internal_margin:'PRIVATE_MARGIN',internal_cost:'PRIVATE_COST',settlements:'PRIVATE_SETTLEMENT',last_receipt:{secret:'PRIVATE_RECEIPT'},...price}};
 }}};
 const ctx={window,document,console,Intl,setTimeout,clearTimeout};vm.createContext(ctx);vm.runInContext(source,ctx);
 return {ctx,document,calls,load:async()=>{const rows=await ctx.fetchDriverServiceOverview();return rows.map(ctx.adaptDriverServiceOverviewRow);},render:service=>{ctx.renderActiveService(service);return document.getElementById('driver-active-service');}};
}
const text=node=>node.textContent.replace(/\u00a0|\u202f/g,' ');
test('real overview -> 0050 context -> adapter -> active render shows finalized 20,00 EUR as currency',async()=>{
 const p=setup(),[service]=await p.load(),node=p.render(service);
 assert.deepEqual(JSON.parse(JSON.stringify(service.finalPrice)),{totalAmount:20,currencyCode:'EUR'});
 assert.equal(service.estimatedPrice.replace(/\u00a0/g,' '),'20,00 \u20ac');
 assert.match(text(node.querySelector('.driver-active-stats')),/20,00 \u20acPrecio definitivo/);assert.doesNotMatch(text(node),/Sin precio/);
 assert.deepEqual(p.calls.map(c=>c.name),['get_driver_service_overview','get_service_financial_close_context']);
});
test('draft amount is never presented as finalized price',async()=>{
 const p=setup({price:{pricing_status:'draft',total_amount:20}}),[service]=await p.load();assert.equal(service.finalPrice,null);
 assert.match(text(p.render(service).querySelector('.driver-active-stats')),/Sin precio/);
});
test('zero finalized total is a real price; currency is used rather than assumed',async()=>{
 for(const [amount,currency]of [[0,'EUR'],[20,'USD']]){const p=setup({price:{total_amount:amount,currency_code:currency}}),[service]=await p.load();
  assert.equal(service.finalPrice.totalAmount,amount);assert.equal(service.finalPrice.currencyCode,currency);
  const expected=new Intl.NumberFormat('es-ES',{style:'currency',currency}).format(amount).replace(/\u00a0|\u202f/g,' ');
  assert.ok(text(p.render(service)).includes(expected));}
});
test('price is display-only and context fields outside total/currency are discarded',async()=>{
 const p=setup(),[service]=await p.load(),node=p.render(service),stats=node.querySelector('.driver-active-stats');
 assert.equal(stats.querySelector('input,select,textarea,button,[contenteditable]'),null);
 assert.doesNotMatch(node.innerHTML,/PRIVATE_|finalize_service_pricing|data-financial-kind="pricing"/);
 assert.doesNotMatch(JSON.stringify(service),/PRIVATE_|internal_margin|internal_cost|settlements|last_receipt|paid_amount|pending_amount/);
 assert.equal(p.calls.every(c=>['get_driver_service_overview','get_service_financial_close_context'].includes(c.name)),true);
});
test('failed, malformed, foreign or missing final-price responses never invent an amount or hide the service',async()=>{
 for(const options of [{failure:true},{price:{service_id:'foreign'}},{price:{total_amount:null}},{price:{total_amount:''}},{price:{total_amount:-1}},{price:{currency_code:null}},{price:{pricing_status:null}}]){
  const p=setup(options),[service]=await p.load();assert.equal(service.finalPrice,null);assert.match(text(p.render(service)),/Sin precio/);
 }
});
test('only operational accepted assignments request financial context; QA rows stay excluded',async()=>{
 for(const row of [{assignment_status:'pending_acceptance'},{assignment_status:'ended',operational_status:'completed'},{ended_at:'2026-11-07T10:00:00Z'}]){
  const p=setup({row}),[service]=await p.load();assert.equal(service.finalPrice,null);assert.equal(p.calls.length,1);
 }
 const p=setup({rows:[{...overview,excluded:true}]});assert.equal((await p.load()).length,0);assert.equal(p.calls.length,1);
});
