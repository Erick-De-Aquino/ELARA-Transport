const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseHTML}=require(path.join(process.env.ELARA_PGLITE_ROOT,'linkedom'));
const source=fs.readFileSync('src/js/driver.js','utf8');
const html=fs.readFileSync('src/index.html','utf8');
function setup(){
  const {window,document}=parseHTML(html);
  const context={window,document,console,Intl,setTimeout,clearTimeout};
  vm.createContext(context);
  vm.runInContext(source,context);
  vm.runInContext('driverServices = '+JSON.stringify([
    {id:'assigned',status:'pending',isRealDriverService:true,type:'Transfer',customerName:'Assigned passenger',passengerName:'Passenger',date:'2026-11-06',time:'10:00',changeLog:[],stops:[]},
    {id:'history',status:'finalizado',isRealDriverService:true,type:'Transfer',customerName:'History passenger',passengerName:'Passenger',date:'2026-11-05',time:'10:00',changeLog:[],stops:[]}
  ])+';',context);
  context.bindDriverEvents();
  const modal=document.getElementById('driver-service-detail-modal');
  return {context,document,modal,click:node=>node.dispatchEvent(new window.Event('click',{bubbles:true}))};
}
for(const [label,open,id] of [['service','openServiceDetail','assigned'],['history','openHistoryDetail','history']]){
  test(label+': Close button uses delegated handler and existing modal',()=>{
    const p=setup();p.context[open](id);assert.equal(p.modal.hidden,false);
    p.click(p.modal.querySelector('[data-modal-close]'));assert.equal(p.modal.hidden,true);
  });
  test(label+': backdrop closes but content clicks do not',()=>{
    const p=setup();p.context[open](id);
    p.click(p.modal.querySelector('section'));assert.equal(p.modal.hidden,false);
    p.click(p.modal.querySelector('.driver-detail-card h3'));assert.equal(p.modal.hidden,false);
    p.click(p.modal);assert.equal(p.modal.hidden,true);
  });
}
test('repeated service/history open and close reuse one modal without stale content',()=>{
  const p=setup();for(let i=0;i<4;i++){
    p.context.openServiceDetail('assigned');assert.equal(p.modal.hidden,false);
    assert.match(p.modal.textContent,/Assigned passenger/);assert.doesNotMatch(p.modal.textContent,/History passenger/);
    p.click(p.modal.querySelector('[data-modal-close]'));assert.equal(p.modal.hidden,true);
    p.context.openHistoryDetail('history');assert.equal(p.modal.hidden,false);
    assert.match(p.modal.textContent,/History passenger/);assert.doesNotMatch(p.modal.textContent,/Assigned passenger/);
    p.click(p.modal);assert.equal(p.modal.hidden,true);
    assert.equal(p.document.querySelectorAll('#driver-service-detail-modal').length,1);
  }
});
