import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
function boot(){
  const storage=new Map(),listeners=new Map();
  const elements=new Map(['#app','#toast','#preview-content'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}}]));
  const context=vm.createContext({
    document:{querySelector:selector=>elements.get(selector)||null,getElementById:()=>null,addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(listener);}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run("state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;state.tab='texts';touch();render();");
  return {run,storage,saved:()=>JSON.parse(storage.get('communication-tickets-v1'))[0],toast:()=>elements.get('#toast').textContent,
    clickDuplicate(id){
      const target={dataset:{action:'duplicate',...(id?{id}: {})},disabled:false,classList:{contains:()=>false},closest:selector=>selector==='[data-action]'?target:null};
      for(const listener of listeners.get('click')||[])listener({target});
    }
  };
}

test('navigation duplicates the requested inactive event with its complete independent contents',()=>{
  const demo=boot();
  demo.run("Object.assign(ticket().events[1],{name:'delivery_v2_push_sms',comment:'Keep this comment',recipient:'user',channel:'Push + SMS',recurring:true,schedule:'Every Monday',writerNote:'Writer note',saved:true});Object.assign(ticket().events[1].texts,{pushTitle:'Delivery arranged',pushMessage:'Push details',pushMessageEs:'Detalles push',smsMessage:'SMS details',smsMessageEs:'Detalles SMS'});Object.assign(ticket().events[1].links,{push:'https://plata.test/push',sms:'https://plata.test/sms'});Object.assign(ticket().events[1].linkEnabled,{push:true,sms:true});touch();");
  const original=JSON.parse(demo.run('JSON.stringify(ticket().events[1])'));
  const activeId=demo.run('state.nav');
  assert.notEqual(activeId,original.id);
  demo.clickDuplicate(original.id);
  const saved=demo.saved(),copy=saved.events[2];
  assert.equal(saved.events.length,3);
  assert.notEqual(copy.id,original.id);
  assert.ok(copy.id);
  assert.deepEqual(copy,{...original,id:copy.id,name:original.name+' (copy)',saved:false});
  assert.deepEqual(saved.events[1],original);
  assert.equal(demo.run('state.nav'),copy.id);
  assert.equal(demo.run('state.tab'),'main');
  demo.run("event().texts.smsMessage='Changed only in copy';event().links.push='https://plata.test/changed';event().linkEnabled.sms=false;");
  assert.deepEqual(JSON.parse(demo.run('JSON.stringify(ticket().events[1])')),original);
});

test('header duplication without a source id duplicates the selected event',()=>{
  const demo=boot();
  demo.run("state.nav=ticket().events[1].id;");
  const original=JSON.parse(demo.run('JSON.stringify(event())'));
  demo.clickDuplicate();
  const copy=demo.saved().events[2];
  assert.deepEqual(copy,{...original,id:copy.id,name:original.name+' (copy)',saved:false});
});

test('read-only tickets cannot be duplicated through either entry point',()=>{
  const demo=boot();
  demo.run("ticket().status='business_review';touch();");
  const before=demo.storage.get('communication-tickets-v1');
  demo.clickDuplicate(demo.run('ticket().events[1].id'));
  demo.clickDuplicate();
  assert.equal(demo.storage.get('communication-tickets-v1'),before);
  assert.equal(demo.run('ticket().events.length'),2);
});

test('both duplicate entry points preserve the ten-event limit and current selection',()=>{
  const demo=boot();
  demo.run("while(ticket().events.length<MAX_EVENTS)addEvent(ticket(),newEvent());touch();");
  const before=demo.storage.get('communication-tickets-v1'),activeId=demo.run('state.nav');
  demo.clickDuplicate(demo.run('ticket().events[1].id'));
  demo.clickDuplicate();
  assert.equal(demo.run('ticket().events.length'),10);
  assert.equal(demo.run('state.nav'),activeId);
  assert.equal(demo.storage.get('communication-tickets-v1'),before);
  assert.equal(demo.toast(),'Maximum 10 events per ticket.');
});
