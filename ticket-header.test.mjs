import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');

function boot(storage=new Map(),hash=''){
  const elements=new Map(['#app','#toast','#preview-content'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}}]));
  const context=vm.createContext({
    document:{querySelector:selector=>elements.get(selector)||null,getElementById:()=>null,addEventListener(){}},
    window:{addEventListener(){}},location:{hash,pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  return {run,storage,html:()=>elements.get('#app').innerHTML,header:()=>elements.get('#app').innerHTML.split('<div class="editor-layout">')[0]};
}

test('header uses the assignee independently of the author and keeps the assignment date after edits and reload',()=>{
  const demo=boot();
  demo.run("state.ticketId=tickets[0].id;state.nav='general';ticket().author='Original Author';ticket().assignee='Alejandro Hernández';ticket().assignedAt='2026-10-23T12:00:00.000Z';touch();render();");
  const id=demo.run('ticket().id');
  const assignment=demo.header().match(/<p\b[^>]*class="ticket-assignment"[^>]*>([\s\S]*?)<\/p>/)?.[1];
  assert.ok(assignment,'assignment appears below the title');
  assert.match(assignment.replace(/<[^>]*>/g,'').replace(/\s+/g,' '),/Assigned to Alejandro Hernández on October 23\./);
  assert.doesNotMatch(assignment,/Original Author/);
  demo.run("ticket().updated='2026-11-19T12:00:00.000Z';ticket().events[0].comment='Later edit';touch();render();");
  assert.equal(demo.run('ticket().assignedAt'),'2026-10-23T12:00:00.000Z');
  assert.ok(demo.header().includes(assignment));
  const reloaded=boot(demo.storage,`#ticket/${id}`);
  assert.equal(reloaded.run('ticket().author'),'Original Author');
  assert.equal(reloaded.run('ticket().assignee'),'Alejandro Hernández');
  assert.equal(reloaded.run('ticket().assignedAt'),'2026-10-23T12:00:00.000Z');
  assert.ok(reloaded.header().includes(assignment));
});

test('legacy and incomplete assignment data render without an invented date or mutations',()=>{
  const fixture=boot();
  const ticket=JSON.parse(fixture.run('JSON.stringify(tickets[0])'));
  delete ticket.assignee;
  delete ticket.assignedAt;
  for(const assignment of [{},{assignee:'Other Responsible'},{assignee:'Other Responsible',assignedAt:'invalid-date'}]){
    const record={...ticket,...assignment};
    const raw=JSON.stringify([record]);
    const storage=new Map([['communication-tickets-v1',raw]]);
    const demo=boot(storage,`#ticket/${record.id}`);
    assert.equal(demo.run('JSON.stringify(tickets)'),raw);
    assert.equal(storage.get('communication-tickets-v1'),raw);
    const expected=assignment.assignee||'Alejandro Hernández';
    assert.match(demo.header(),new RegExp(`Assigned to ${expected}`));
    assert.doesNotMatch(demo.header(),/Assigned to[^<]* on |Invalid Date|History/);
    demo.run('render();');
    assert.equal(demo.run('JSON.stringify(tickets)'),raw);
    assert.equal(storage.get('communication-tickets-v1'),raw);
  }
});

test('new header retains ticket status and stage actions while omitting History',()=>{
  const demo=boot();
  demo.run("state.ticketId=tickets[0].id;state.nav='general';");
  for(const [status,label,action] of [['draft','Draft','send'],['text_pending','Text pending','start-text-review'],['text_review','Text review','send-to-development'],['business_review','Business review','return-to-development'],['done','Done',null]]){
    demo.run(`ticket().status=${JSON.stringify(status)};render();`);
    const header=demo.header();
    assert.match(header,/class="ticket-heading-main"/);
    assert.match(header,/class="ticket-title-row"/);
    assert.ok(header.includes(`class="badge ${status}"`));
    assert.ok(header.includes(`>${label}</span>`));
    assert.match(header,/aria-label="Back to tickets"/);
    if(action)assert.ok(header.includes(`data-action="${action}"`),status);
    else assert.doesNotMatch(header,/class="button send-button"/);
    assert.doesNotMatch(header,/History|data-action="[^"]*history/);
  }
});
