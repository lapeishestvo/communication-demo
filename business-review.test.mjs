import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
function boot(status='business_review'){
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
  run(`state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;state.tab='texts';ticket().status=${JSON.stringify(status)};ticket().events.forEach(e=>{e.review={decision:'approved',comment:'Text approved',author:'UX writer',at:'2026-10-20T12:00:00.000Z'};e.reviewDraft='Text review comment';});touch();render();`);
  return {run,storage,saved:()=>JSON.parse(storage.get('communication-tickets-v1'))[0]};
}

test('text approvals cannot satisfy the independent business review',()=>{
  const demo=boot();
  demo.run("reviewStage('send-to-migration');");
  assert.equal(demo.run('ticket().status'),'business_review');
  assert.equal(demo.saved().status,'business_review');
  assert.ok(demo.saved().events.every(event=>event.review.decision==='approved'));
  assert.ok(demo.saved().events.every(event=>event.businessReview===undefined));
});

test('business decline requires its own comment and persists independently of text review',()=>{
  const demo=boot();
  const textDecision=demo.run('JSON.stringify(event().review)');
  const before=demo.storage.get('communication-tickets-v1');
  demo.run("event().businessReviewDraft='   ';reviewEvent('declined');");
  assert.equal(demo.run('event().businessReview'),undefined);
  assert.equal(demo.storage.get('communication-tickets-v1'),before);
  demo.run("handleField({dataset:{field:'reviewComment',scope:'review'},value:'Please update the offer',closest(){return null;},removeAttribute(){}});reviewEvent('declined');");
  const saved=demo.saved();
  assert.equal(saved.status,'business_review');
  assert.equal(saved.events[0].businessReviewDraft,'Please update the offer');
  assert.equal(saved.events[0].reviewDraft,'Text review comment');
  assert.equal(saved.events[0].businessReview.decision,'declined');
  assert.equal(saved.events[0].businessReview.comment,'Please update the offer');
  assert.equal(saved.events[0].businessReview.author,'Ekaterina Tarasova');
  assert.ok(Number.isFinite(Date.parse(saved.events[0].businessReview.at)));
  assert.equal(JSON.stringify(saved.events[0].review),textDecision);
});

test('all business approvals unlock migration only from business review',()=>{
  const demo=boot();
  demo.run("reviewEvent('approved');reviewStage('send-to-migration');");
  assert.equal(demo.run('ticket().status'),'business_review');
  assert.equal(demo.saved().events[0].businessReview.decision,'approved');
  assert.equal(demo.saved().events[1].businessReview,undefined);
  demo.run("state.nav=ticket().events[1].id;reviewEvent('approved');reviewStage('send-to-migration');");
  assert.equal(demo.run('ticket().status'),'migration');
  assert.equal(demo.saved().status,'migration');
  assert.ok(demo.saved().events.every(event=>event.businessReview.decision==='approved'));

  const textStage=boot('text_review');
  textStage.run("ticket().events.forEach(e=>e.businessReview={decision:'approved'});reviewStage('send-to-migration');");
  assert.equal(textStage.run('ticket().status'),'text_review');
});

test('returning a declined business review to development preserves text approvals',()=>{
  const demo=boot();
  const before=demo.run('JSON.stringify(ticket().events.map(e=>e.review))');
  demo.run("event().businessReviewDraft='Change the delivery details';reviewEvent('declined');state.nav=ticket().events[1].id;reviewEvent('approved');reviewStage('return-to-development');");
  assert.equal(demo.run('ticket().status'),'in_development');
  assert.equal(demo.saved().status,'in_development');
  assert.equal(demo.run('JSON.stringify(ticket().events.map(e=>e.review))'),before);
  assert.equal(demo.saved().events[0].businessReview.comment,'Change the delivery details');
});

test('starting a new business review clears only previous business decisions and drafts',()=>{
  const demo=boot('in_testing');
  const textDecisions=demo.run('JSON.stringify(ticket().events.map(e=>e.review))');
  demo.run("ticket().events.forEach(e=>{e.businessReview={decision:'declined',comment:'Previous pass'};e.businessReviewDraft='Previous business comment';});reviewStage('start-business-review');");
  const saved=demo.saved();
  assert.equal(saved.status,'business_review');
  assert.ok(saved.events.every(event=>event.businessReview===undefined));
  assert.ok(saved.events.every(event=>event.businessReviewDraft===''));
  assert.ok(saved.events.every(event=>event.reviewDraft==='Text review comment'));
  assert.equal(JSON.stringify(saved.events.map(event=>event.review)),textDecisions);
});
