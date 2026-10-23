import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
function boot(){
  const storage=new Map();
  const elements=new Map(['#app','#toast','#preview-content'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}}]));
  const context=vm.createContext({
    document:{querySelector:selector=>elements.get(selector)||null,getElementById:()=>null,addEventListener(){}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run("state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;state.tab='texts';ticket().status='text_review';touch();render();");
  return {run,storage,toast:()=>elements.get('#toast').textContent,saved:()=>JSON.parse(storage.get('communication-tickets-v1'))[0]};
}

test('declining without a comment keeps the event undecided and does not persist a decision',()=>{
  const demo=boot();
  const before=demo.storage.get('communication-tickets-v1');
  demo.run("event().reviewDraft='   ';reviewEvent('declined');");
  assert.equal(demo.run('event().review'),undefined);
  assert.equal(demo.run('ticket().status'),'text_review');
  assert.equal(demo.storage.get('communication-tickets-v1'),before);
  assert.equal(demo.toast(),'Add a comment before declining.');
});

test('accepting persists the event approval while the ticket remains in text review',()=>{
  const demo=boot();
  demo.run("event().reviewDraft='Looks good';reviewEvent('approved');");
  assert.equal(demo.run('ticket().status'),'text_review');
  const saved=demo.saved();
  assert.equal(saved.status,'text_review');
  assert.equal(saved.events[0].review.decision,'approved');
  assert.equal(saved.events[0].review.comment,'Looks good');
  assert.equal(saved.events[0].review.author,'Ekaterina Tarasova');
  assert.ok(Number.isFinite(Date.parse(saved.events[0].review.at)));
  assert.equal(saved.events[1].review,undefined);
  demo.run("reviewEvent('declined');");
  assert.equal(demo.run('event().review.decision'),'approved');
});

test('development requires every approval and a declined ticket can return to the writer',()=>{
  const demo=boot();
  demo.run("reviewEvent('approved');reviewStage('send-to-development');");
  assert.equal(demo.run('ticket().status'),'text_review');
  assert.equal(demo.saved().status,'text_review');
  assert.equal(demo.toast(),'Accept every event before sending to development.');
  demo.run("state.nav=ticket().events[1].id;reviewEvent('approved');reviewStage('send-to-development');");
  assert.equal(demo.run('ticket().status'),'in_development');
  assert.equal(demo.saved().status,'in_development');

  const declined=boot();
  declined.run("event().reviewDraft='Please update the wording';reviewEvent('declined');reviewStage('return-to-writer');");
  assert.equal(declined.run('ticket().status'),'text_pending');
  assert.equal(declined.saved().status,'text_pending');
  assert.equal(declined.saved().events[0].review.comment,'Please update the wording');
});
