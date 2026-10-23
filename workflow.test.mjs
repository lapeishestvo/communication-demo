import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
function boot(storage=new Map(),hash=''){
  const elements=new Map(['#app','#toast'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}}]));
  const context=vm.createContext({
    document:{querySelector:selector=>elements.get(selector)||null,getElementById:()=>null,addEventListener(){}},
    window:{addEventListener(){}},
    location:{hash,pathname:'/communication-demo.html',search:''},
    history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone
  });
  vm.runInContext(source,context);
  return {context,storage,html:()=>elements.get('#app').innerHTML,run:code=>vm.runInContext(code,context)};
}

test('Send ticket persists Text pending, returns to the list and keeps the sent row visible',()=>{
  const demo=boot();
  const id=demo.run('tickets[14].id');
  demo.run("state.ticketId=tickets[14].id;state.nav='general';state.page=2;sendTicket();");
  assert.equal(demo.run('state.ticketId'),null);
  assert.equal(demo.run('state.page'),1);
  assert.equal(demo.run(`tickets.find(ticket=>ticket.id===${JSON.stringify(id)}).status`),'text_pending');
  assert.ok(demo.html().includes(`data-id="${id}"`));
  const saved=JSON.parse(demo.storage.get('communication-tickets-v1'));
  assert.equal(saved.find(ticket=>ticket.id===id).status,'text_pending');
  const reloaded=boot(demo.storage,`#ticket/${id}`);
  assert.equal(reloaded.run('ticket().status'),'text_pending');
  assert.equal(reloaded.html().includes('data-action="send"'),false);
});

test('Send ticket keeps an incomplete draft open with actionable validation',()=>{
  const demo=boot();
  demo.run("state.ticketId=tickets[0].id;state.nav='general';ticket().events=[];sendTicket();");
  assert.notEqual(demo.run('state.ticketId'),null);
  assert.equal(demo.run('ticket().status'),'draft');
  assert.ok(demo.html().includes('Add at least one event'));
  assert.ok(demo.html().includes('data-action="go-error"'));
});

test('draft text edits survive reload without submitting the ticket',()=>{
  const demo=boot();
  const id=demo.run('tickets[0].id');
  demo.run("state.ticketId=tickets[0].id;ticket().events[0].texts.smsMessage='Updated draft message';touch();");
  const reloaded=boot(demo.storage,`#ticket/${id}`);
  assert.equal(reloaded.run('ticket().events[0].texts.smsMessage'),'Updated draft message');
  assert.equal(reloaded.run('ticket().status'),'draft');
});
