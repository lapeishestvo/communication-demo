import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const readonlyStatuses=['text_pending','in_development','in_testing','migration','in_prod_testing','done','canceled'];

function boot(status){
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
  run(`state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;state.tab='main';ticket().status=${JSON.stringify(status)};event().linkEnabled.push=true;event().links.push='plata://transfers/refund';touch();render();`);
  return {run,storage,preview:()=>elements.get('#preview-content').innerHTML};
}

for(const status of readonlyStatuses){
  test(`${status} exposes static event details, text and links with a separate Preview tab`,()=>{
    const demo=boot(status);
    const main=demo.run('eventView()');
    assert.ok(main.includes(demo.run('esc(event().name)')));
    assert.match(main,/<dl\b/);
    assert.equal((main.match(/role="tab"/g)||[]).length,4);
    for(const label of ['Main info','Texts','Content','Preview'])assert.ok(main.includes(`>${label}</button>`));
    assert.doesNotMatch(main,/<(?:input|select|textarea)\b|contenteditable="true"/);
    assert.doesNotMatch(main,/data-action="(?:add-event|delete-event|duplicate|save-event|next|previous|accept-text|decline-text)"/);
    assert.doesNotMatch(main,/<h3>Review<\/h3>/);

    const texts=demo.run("state.tab='texts';eventView()");
    assert.ok(texts.includes('Refund from '));
    assert.doesNotMatch(texts,/<(?:input|select|textarea)\b|contenteditable="true"/);
    const content=demo.run("state.tab='content';eventView()");
    assert.match(content,/<dl\b/);
    assert.ok(content.includes('plata://transfers/refund'));
    assert.doesNotMatch(content,/<(?:input|select|textarea)\b/);
  });
}

test('event edits, stale saves, duplication and review decisions cannot mutate any read-only status',()=>{
  for(const status of readonlyStatuses){
    const demo=boot(status);
    const before=demo.run('JSON.stringify(ticket())'),saved=demo.storage.get('communication-tickets-v1');
    demo.run("handleField({dataset:{field:'name',scope:'event'},value:'Unexpected edit',closest(){return null;},removeAttribute(){}});saveCurrent();saveCurrent(true);duplicateEvent(event().id);reviewEvent('approved');");
    assert.equal(demo.run('JSON.stringify(ticket())'),before,status);
    assert.equal(demo.storage.get('communication-tickets-v1'),saved,status);
  }
});

test('read-only Preview changes examples without modifying event definitions or persisted tickets',()=>{
  for(const status of readonlyStatuses){
    const demo=boot(status);
    demo.run("state.tab='preview';render();");
    const before=demo.run('JSON.stringify(ticket())'),saved=demo.storage.get('communication-tickets-v1');
    demo.run("handleField({dataset:{field:ticket().variables.find(v=>v.name==='Amount').id,scope:'preview'},value:'$987',closest(){return null;},removeAttribute(){}});");
    assert.ok(demo.preview().includes('$987 returned'),status);
    assert.equal(demo.run('JSON.stringify(ticket())'),before,status);
    assert.equal(demo.storage.get('communication-tickets-v1'),saved,status);
  }
});

test('Draft retains event editing while both review stages retain their review controls',()=>{
  const draft=boot('draft').run('eventView()');
  assert.match(draft,/data-scope="event"/);
  assert.match(draft,/data-action="duplicate"/);
  assert.match(draft,/data-action="save-event"/);
  for(const status of ['text_review','business_review']){
    const review=boot(status).run('eventView()');
    assert.match(review,/<h3>Review<\/h3>/);
    assert.match(review,/data-action="accept-text"/);
    assert.match(review,/data-action="decline-text"/);
    assert.doesNotMatch(review,/data-scope="event"|data-action="duplicate"|data-action="save-event"/);
  }
});
