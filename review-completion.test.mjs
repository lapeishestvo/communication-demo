import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
function classList(){
  const values=new Set();
  return {add(...names){names.forEach(name=>values.add(name));},remove(...names){names.forEach(name=>values.delete(name));},contains:name=>values.has(name)};
}
function boot(status){
  const storage=new Map(),listeners=new Map(),timers=new Map(),attributes=new Map();
  let nextTimer=0,html='',renders=0;
  const app={get innerHTML(){return html;},set innerHTML(value){html=value;renders++;}};
  const toast={textContent:'',classList:classList(),setAttribute:(name,value)=>attributes.set(name,value),getAttribute:name=>attributes.get(name)??null};
  const elements=new Map([['#app',app],['#toast',toast],['#preview-content',{innerHTML:''}]]);
  const context=vm.createContext({
    document:{querySelector:selector=>elements.get(selector)||null,getElementById:()=>null,addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout(callback,delay){const id=++nextTimer;timers.set(id,{callback,delay});return id;},clearTimeout(id){timers.delete(id);},Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run(`state.ticketId=tickets[0].id;ticket().status=${JSON.stringify(status)};ticket().events.forEach(e=>{delete e.review;delete e.businessReview;e.reviewDraft='Keep text review draft';e.businessReviewDraft='Keep business review draft';});state.nav=ticket().events[1].id;state.tab='preview';state.lang='es';state.preview={amount:'1500'};touch();render();`);
  return {run,storage,toast,timers,renders:()=>renders,html:()=>html,click(action){const trigger={dataset:{action},classList:classList(),closest:selector=>selector==='[data-action]'?trigger:null};for(const handler of listeners.get('click')||[])handler({target:trigger});},expire(){const last=[...timers.values()].at(-1);last?.callback();}};
}

const stages=[
  {status:'text_review',key:'review',other:'businessReview',send:'send-to-development',back:'return-to-writer',destination:'in_development',returned:'text_pending'},
  {status:'business_review',key:'businessReview',other:'review',send:'send-to-migration',back:'return-to-development',destination:'migration',returned:'in_development'}
];

for(const stage of stages){
  test(`${stage.status}: every finishing action rejects unreviewed events and preserves the current draft and view`,()=>{
    for(const action of [stage.send,stage.back])for(const firstDecision of [null,'approved','declined']){
      const demo=boot(stage.status);
      if(firstDecision)demo.run(`ticket().events[0][${JSON.stringify(stage.key)}]={decision:${JSON.stringify(firstDecision)},comment:'Already reviewed'};touch();`);
      const before=demo.run('JSON.stringify({tickets,state})'),saved=demo.storage.get('communication-tickets-v1'),html=demo.html(),renders=demo.renders();
      demo.click(action);
      assert.equal(demo.toast.textContent,'Review all events');
      assert.equal(demo.toast.classList.contains('toast-error'),true);
      assert.equal(demo.toast.classList.contains('visible'),true);
      assert.equal(demo.toast.getAttribute('role'),'alert');
      assert.equal(demo.toast.getAttribute('aria-live'),'assertive');
      assert.equal(demo.run('JSON.stringify({tickets,state})'),before);
      assert.equal(demo.storage.get('communication-tickets-v1'),saved);
      assert.equal(demo.html(),html);
      assert.equal(demo.renders(),renders);
    }
  });

  test(`${stage.status}: approvals from the other stage and malformed decisions do not count as completed review`,()=>{
    for(const decision of [null,'','pending','unknown']){
      const demo=boot(stage.status);
      demo.run(`ticket().events.forEach(e=>{e[${JSON.stringify(stage.other)}]={decision:'approved'};e[${JSON.stringify(stage.key)}]={decision:${JSON.stringify(decision)}};});touch();`);
      const before=demo.run('JSON.stringify(tickets)'),saved=demo.storage.get('communication-tickets-v1');
      demo.click(stage.send);
      assert.equal(demo.toast.textContent,'Review all events');
      assert.equal(demo.run('JSON.stringify(tickets)'),before);
      assert.equal(demo.storage.get('communication-tickets-v1'),saved);
    }
  });

  test(`${stage.status}: empty tickets cannot leave review`,()=>{
    for(const action of [stage.send,stage.back]){
      const demo=boot(stage.status);
      demo.run("ticket().events=[];state.nav='general';touch();render();");
      const saved=demo.storage.get('communication-tickets-v1');
      demo.click(action);
      assert.equal(demo.run('ticket().status'),stage.status);
      assert.equal(demo.storage.get('communication-tickets-v1'),saved);
      assert.equal(demo.toast.textContent,'Review all events');
    }
  });

  test(`${stage.status}: completed approvals can advance and a completed mixed review can return`,()=>{
    const approved=boot(stage.status);
    approved.run(`ticket().events.forEach(e=>{e[${JSON.stringify(stage.key)}]={decision:'approved',comment:''};});touch();`);
    approved.click(stage.send);
    assert.equal(approved.run('ticket().status'),stage.destination);
    assert.equal(JSON.parse(approved.storage.get('communication-tickets-v1'))[0].status,stage.destination);
    assert.equal(approved.toast.classList.contains('toast-error'),false);

    const mixed=boot(stage.status);
    mixed.run(`ticket().events.forEach((e,i)=>{e[${JSON.stringify(stage.key)}]={decision:i?'approved':'declined',comment:i?'':'Please revise'};});touch();`);
    mixed.click(stage.back);
    assert.equal(mixed.run('ticket().status'),stage.returned);
    const saved=JSON.parse(mixed.storage.get('communication-tickets-v1'))[0];
    assert.equal(saved.status,stage.returned);
    assert.equal(saved.events[0][stage.key].comment,'Please revise');
    assert.equal(mixed.toast.classList.contains('toast-error'),false);
  });
}

test('error toast renews its timeout on repeated attempts, expires, and regular toasts reset its appearance and live role',()=>{
  const demo=boot('business_review');
  demo.click('return-to-development');
  const firstTimer=[...demo.timers.keys()][0];
  assert.equal(demo.timers.size,1);
  demo.click('return-to-development');
  assert.equal(demo.timers.size,1);
  assert.equal(demo.timers.has(firstTimer),false);
  assert.ok([...demo.timers.values()][0].delay>0);
  demo.expire();
  assert.equal(demo.toast.classList.contains('visible'),false);

  demo.run("toast('Event saved');");
  assert.equal(demo.toast.textContent,'Event saved');
  assert.equal(demo.toast.classList.contains('toast-error'),false);
  assert.equal(demo.toast.classList.contains('visible'),true);
  assert.equal(demo.toast.getAttribute('role'),'status');
  assert.equal(demo.toast.getAttribute('aria-live'),'polite');
});
