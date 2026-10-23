import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const attributes=html=>Object.fromEntries([...html.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
const classes=()=>({add(){},remove(){},contains(){return false;},toggle(){}});

function element(raw='',parent=null){
  const attrs=attributes(raw),dataset=Object.fromEntries(Object.entries(attrs).filter(([key])=>key.startsWith('data-')).map(([key,value])=>[key.slice(5),value]));
  return {dataset,classList:classes(),focus(){},closest(selector){return selector==='[data-action]'&&dataset.action?this:parent?.closest(selector)||null;}};
}

function boot(){
  const listeners=new Map(),storage=new Map();
  const elements=new Map(['#app','#toast','#overlay','.app-header'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:classes(),contains(){return false;},querySelector(){return null;}}]));
  const context=vm.createContext({
    document:{activeElement:element(),body:{classList:classes()},querySelector:selector=>elements.get(selector)||null,getElementById:()=>null,addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);run(source);
  const html=()=>elements.get('#app').innerHTML;
  return {run,storage,html,
    rows:()=>[...html().matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].filter(match=>attributes(match[1])['data-action']==='open-ticket'),
    click(target){for(const handler of listeners.get('click')||[])handler({target,preventDefault(){}});}
  };
}

test('ticket rows are click targets while ticket names remain keyboard-accessible buttons',()=>{
  const demo=boot(),rows=demo.rows();
  assert.equal(rows.length,14);
  for(const [,raw,content] of rows){
    const attrs=attributes(raw);
    assert.ok(attrs.class.split(/\s+/).includes('ticket-row'));
    assert.equal((content.match(/<td\b/g)||[]).length,4);
    const name=content.match(/<button\b([^>]*class="ticket-link"[^>]*)>/);
    assert.ok(name,'retain the native button for keyboard activation');
    assert.equal(attributes(name[1])['data-id'],attrs['data-id']);
    assert.equal(attributes(name[1])['data-action'],'open-ticket');
  }
  const newTicket=demo.html().match(/<button\b([^>]*data-action="new-ticket"[^>]*)>/);
  assert.ok(newTicket);
  assert.ok(!attributes(newTicket[1]).class.split(/\s+/).includes('primary'));
});

test('clicking any ticket cell, status badge, date or row whitespace opens that ticket',()=>{
  for(const surface of ['name-cell','author','status','date','row','name-button']){
    const demo=boot(),[,raw,content]=demo.rows()[1],row=element(raw),id=row.dataset.id;
    const cells=[...content.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    const index={ 'name-cell':0,author:1,status:2,date:3 }[surface]??0;
    assert.ok(cells[index]);
    let target=surface==='row'?row:element('',row);
    if(surface==='status'||surface==='date')target=element('',target);
    if(surface==='name-button')target=element(cells[0][1].match(/<button\b([^>]*)>/)[1],row);
    const before=demo.run('JSON.stringify(tickets)'),saved=demo.storage.get('communication-tickets-v1');
    demo.click(target);
    assert.equal(demo.run('state.ticketId'),id,surface);
    assert.equal(demo.run('state.nav'),'general',surface);
    assert.equal(demo.run('location.hash'),`ticket/${id}`,surface);
    assert.match(demo.html(),/class="general-card"/,surface);
    assert.equal(demo.run('JSON.stringify(tickets)'),before,surface);
    assert.equal(demo.storage.get('communication-tickets-v1'),saved,surface);
  }
});

test('sorting, pagination and New ticket retain their own actions outside ticket rows',()=>{
  const sorted=boot();
  const sort=sorted.html().match(/<button\b([^>]*data-action="sort"[^>]*data-key="name"[^>]*)>/);
  sorted.click(element(sort[1]));
  assert.equal(sorted.run('state.sort'),'name');
  assert.equal(sorted.run('state.ticketId'),null);

  const paged=boot();
  const next=paged.html().match(/<button\b([^>]*data-action="page-next"[^>]*)>/);
  paged.click(element(next[1]));
  assert.equal(paged.run('state.page'),2);
  assert.equal(paged.run('state.ticketId'),null);

  const created=boot();
  const create=created.html().match(/<button\b([^>]*data-action="new-ticket"[^>]*)>/);
  created.click(element(create[1]));
  assert.equal(created.run('modal.type'),'general');
  assert.equal(created.run('modal.edit'),false);
  assert.equal(created.run('state.ticketId'),null);
});
