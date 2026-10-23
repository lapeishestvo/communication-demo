import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');

function boot(status='text_review',storage=new Map(),restore=false){
  const elements=new Map(['#app','#toast','#preview-content'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}}]));
  const context=vm.createContext({
    document:{querySelector:selector=>elements.get(selector)||null,getElementById:()=>null,addEventListener(){}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run("state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;state.tab='texts';");
  if(!restore)run(`ticket().status=${JSON.stringify(status)};ticket().events.forEach(e=>{delete e.review;delete e.businessReview;e.reviewDraft='';e.businessReviewDraft='';});touch();`);
  run('render();');
  return {run,storage,html:()=>elements.get('#app').innerHTML,nav:index=>run(`navButton(ticket().events[${index}].id,'Event ${index+1}',${index})`)};
}

function expectStatus(html,status){
  const marker=html.match(/<span\b[^>]*class="[^"]*\breview-nav-status\b[^"]*"[^>]*>/)?.[0];
  if(!status){assert.equal(marker,undefined);return;}
  assert.ok(marker,`expected ${status} icon in event navigation`);
  assert.match(marker,/\brole="img"/);
  assert.ok(marker.includes(`aria-label="${status}"`));
  assert.ok(marker.includes(`title="${status}"`));
  const asset=status==='Approved'?'figma-nav-approved.svg':'figma-nav-declined.svg';
  assert.ok(html.includes(`src="./assets/${asset}"`));
}

for(const [stage,key,draft] of [['text_review','review','reviewDraft'],['business_review','businessReview','businessReviewDraft']]){
  test(`${stage}: only completed decisions mark their own event in navigation`,()=>{
    const demo=boot(stage);
    expectStatus(demo.nav(0),null);
    expectStatus(demo.nav(1),null);
    for(const comment of ['',' \n\t ']){
      const saved=demo.storage.get('communication-tickets-v1');
      demo.run(`event()[${JSON.stringify(draft)}]=${JSON.stringify(comment)};reviewEvent('declined');`);
      expectStatus(demo.nav(0),null);
      assert.equal(demo.run(`event()[${JSON.stringify(key)}]`),undefined);
      assert.equal(demo.storage.get('communication-tickets-v1'),saved);
    }
    demo.run("reviewEvent('approved');");
    expectStatus(demo.nav(0),'Approved');
    expectStatus(demo.nav(1),null);
    demo.run(`state.nav=ticket().events[1].id;event()[${JSON.stringify(draft)}]='Please revise';reviewEvent('declined');`);
    expectStatus(demo.nav(0),'Approved');
    expectStatus(demo.nav(1),'Declined');
    demo.run("state.nav='general';render();");
    expectStatus(demo.nav(0),'Approved');
    expectStatus(demo.nav(1),'Declined');
    expectStatus(demo.run("navButton('general','General info')"),null);
    expectStatus(demo.run("navButton('values','Values')"),null);
    const reloaded=boot(stage,demo.storage,true);
    expectStatus(reloaded.nav(0),'Approved');
    expectStatus(reloaded.nav(1),'Declined');
  });
}

test('navigation uses the current review stage and never leaks text approvals into business review',()=>{
  const demo=boot('text_review');
  demo.run("ticket().events[0].review={decision:'approved'};ticket().events[1].review={decision:'declined'};ticket().status='business_review';render();");
  expectStatus(demo.nav(0),null);
  expectStatus(demo.nav(1),null);
  demo.run("ticket().events[0].businessReview={decision:'declined'};ticket().events[1].businessReview={decision:'approved'};render();");
  expectStatus(demo.nav(0),'Declined');
  expectStatus(demo.nav(1),'Approved');
  demo.run("ticket().status='text_review';render();");
  expectStatus(demo.nav(0),'Approved');
  expectStatus(demo.nav(1),'Declined');
});

test('starting a new review iteration removes the previous stage navigation decisions',()=>{
  for(const [before,action,after,key] of [['text_pending','start-text-review','text_review','review'],['in_testing','start-business-review','business_review','businessReview']]){
    const demo=boot(after);
    demo.run(`ticket().events.forEach((e,i)=>e[${JSON.stringify(key)}]={decision:i?'declined':'approved'});render();`);
    expectStatus(demo.nav(0),'Approved');
    expectStatus(demo.nav(1),'Declined');
    demo.run(`ticket().status=${JSON.stringify(before)};reviewStage(${JSON.stringify(action)});`);
    assert.equal(demo.run('ticket().status'),after);
    expectStatus(demo.nav(0),null);
    expectStatus(demo.nav(1),null);
  }
});

test('navigation hides stored review decisions outside the two review stages',()=>{
  const demo=boot();
  demo.run("ticket().events.forEach(e=>{e.review={decision:'approved'};e.businessReview={decision:'declined'};});");
  for(const status of ['draft','text_pending','in_development','in_testing','migration','in_prod_testing','done','canceled']){
    demo.run(`ticket().status=${JSON.stringify(status)};render();`);
    expectStatus(demo.nav(0),null);
    expectStatus(demo.nav(1),null);
  }
});
