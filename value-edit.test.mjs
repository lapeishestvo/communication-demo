import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/,'');
const classes=()=>{
  const values=new Set();
  return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value),toggle(value,enabled){enabled?values.add(value):values.delete(value);}};
};

// Run the actual delegated handlers and variable-save workflow. The fixture
// supplies only the surrounding document, rather than replacing application
// functions with their expected results.
function boot(){
  const listeners=new Map(),storage=new Map(),richFields=new Map();
  const elements=new Map(['#app','#toast','#overlay','.app-header','#preview-content'].map(selector=>[selector,{innerHTML:'',textContent:'',inert:false,classList:classes(),contains:()=>false,querySelector:()=>null}]));
  const document={
    activeElement:null,
    body:{classList:classes()},
    querySelector(selector){const richKey=selector.match(/^\[data-rich="([^"]+)"\]$/)?.[1];return richKey?richFields.get(richKey)||null:elements.get(selector)||null;},
    querySelectorAll:()=>[],
    getElementById:()=>null,
    addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}
  };
  const context=vm.createContext({
    document,window:{addEventListener(){}},
    location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,
    Intl,structuredClone,CSS:{escape:value=>value},Node:{TEXT_NODE:3}
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run("state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;state.tab='texts';render();");
  function badge(name,key='pushTitle'){
    if(!richFields.has(key))richFields.set(key,{dataset:{rich:key},tokens:[],querySelectorAll(){return this.tokens;}});
    const rich=richFields.get(key);
    const markup=run(`richHtml(${JSON.stringify('{{'+name+'}}')})`);
    const attrs=Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
    const data=Object.fromEntries(Object.entries(attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));
    const token={
      dataset:data,attributes:attrs,disabled:false,isConnected:true,classList:classes(),textContent:name,
      focus(){document.activeElement=this;},
      closest(selector){
        if(selector==='[data-action]')return this.dataset.action?this:null;
        if(selector==='[data-rich]')return rich;
        if(selector.includes('.token')||selector.includes('[data-token]'))return this;
        return null;
      }
    };
    token.classList.add('token');rich.tokens.push(token);
    return token;
  }
  function dispatch(type,target,extra={}){
    document.activeElement=target;
    const event={target,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...extra};
    for(const handler of listeners.get(type)||[])handler(event);
    return event;
  }
  return {run,badge,dispatch,storage,overlay:()=>elements.get('#overlay').innerHTML};
}

test('editable value badges remain serializable as the original text placeholders',()=>{
  const demo=boot();
  const badge=demo.badge('Bank name');
  assert.equal(badge.attributes.role,'button');
  assert.equal(badge.attributes.tabindex,'0');
  assert.equal(badge.attributes['aria-label'],'Edit Bank name');
  assert.equal(badge.dataset.token,'Bank name');
  demo.run("testRich={childNodes:[{nodeType:3,textContent:'Refund from '},{dataset:{token:'Bank name'},textContent:'Bank name'}]};");
  assert.equal(demo.run('readRich(testRich)'),'Refund from {{Bank name}}');
});

test('clicking a value badge opens the existing variable and does not request another insertion',()=>{
  const demo=boot();
  const before=demo.run('JSON.stringify(event().texts)');
  demo.dispatch('click',demo.badge('Account type','pushMessage'));
  assert.equal(demo.run('modal.editId'),demo.run("ticket().variables.find(value=>value.name==='Account type').id"));
  assert.equal(demo.run('modal.data.kind'),'variations');
  assert.equal(demo.run('modal.target'),null);
  assert.equal(demo.run('modal.tokenOrigin.key'),'pushMessage');
  assert.equal(demo.run('modal.tokenOrigin.index'),0);
  assert.equal(demo.run('JSON.stringify(event().texts)'),before);
});

test('Enter and Space open the same existing value from its focusable badge',()=>{
  for(const key of ['Enter',' ']){
    const demo=boot();
    const event=demo.dispatch('keydown',demo.badge('Bank name'),{key});
    assert.equal(event.defaultPrevented,true);
    assert.equal(demo.run('modal.editId'),demo.run('ticket().variables[0].id'));
    assert.equal(demo.run('modal.target'),null);
  }
});

test('saving a renamed value updates existing occurrences across events without inserting a duplicate',()=>{
  const demo=boot();
  demo.run("ticket().events[1].texts.smsMessage='Another {{Bank name}} and {{Bank name}}';");
  const before=JSON.parse(demo.run('JSON.stringify(ticket().events.map(event=>event.texts))'));
  const variableCount=demo.run('ticket().variables.length');
  demo.dispatch('click',demo.badge('Bank name'));
  demo.run("modal.data.name='Recipient bank';modal.data.example='BBVA';saveVariable();");
  const after=JSON.parse(demo.run('JSON.stringify(ticket().events.map(event=>event.texts))'));
  const expected=before.map(texts=>Object.fromEntries(Object.entries(texts).map(([key,text])=>[key,text.replaceAll('{{Bank name}}','{{Recipient bank}}')])));
  assert.deepEqual(after,expected);
  assert.equal(demo.run('ticket().variables.length'),variableCount);
  assert.equal(demo.run("ticket().variables.filter(value=>value.name==='Recipient bank').length"),1);
  assert.equal(demo.run('modal'),null);
  const persisted=JSON.parse(demo.storage.get('communication-tickets-v1'));
  assert.deepEqual(persisted[0].events.map(event=>event.texts),expected);
});

test('canceling a badge edit discards the copy and preserves every existing occurrence',()=>{
  const demo=boot();
  const before=demo.run('JSON.stringify(ticket())');
  demo.dispatch('click',demo.badge('Bank name'));
  demo.run("modal.data.name='Discard this name';modal.data.defaultEn='Discard this fallback';closeModal();");
  assert.equal(demo.run('JSON.stringify(ticket())'),before);
  assert.equal(demo.run('modal'),null);
});

test('a ticket becoming read-only while a value is open cannot save a stale edit',()=>{
  const demo=boot();
  demo.dispatch('click',demo.badge('Bank name'));
  const variables=demo.run('JSON.stringify(ticket().variables)');
  const texts=demo.run('JSON.stringify(ticket().events.map(event=>event.texts))');
  demo.run("modal.data.name='Blocked rename';ticket().status='text_pending';saveVariable();");
  assert.equal(demo.run('JSON.stringify(ticket().variables)'),variables);
  assert.equal(demo.run('JSON.stringify(ticket().events.map(event=>event.texts))'),texts);
});

test('a badge with no matching variable does not create a replacement variable',()=>{
  const demo=boot();
  const before=demo.run('ticket().variables.length');
  demo.dispatch('click',demo.badge('No such value'));
  assert.equal(demo.run('modal'),null);
  assert.equal(demo.run('ticket().variables.length'),before);
});
