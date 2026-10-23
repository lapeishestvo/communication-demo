import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const required=['name','product','process','communicationType','silentHours','ttl'];
const valid={name:'2 events for Collection',product:'CCR',process:'Collection',communicationType:'Service',silentHours:'11 p.m. – 6 a.m.',ttl:'7 days',comment:''};
const attrs=html=>new Map([...html.matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
function classList(initial=''){
  const values=new Set(initial.split(/\s+/).filter(Boolean));
  return {add(...names){names.forEach(name=>values.add(name));},remove(...names){names.forEach(name=>values.delete(name));},contains:name=>values.has(name),toggle(name,force){const add=force??!values.has(name);if(add)values.add(name);else values.delete(name);return add;}};
}

function boot(){
  const storage=new Map(),listeners=new Map(),fields=new Map(),errors=new Map();
  let html='',renders=0,focused=null,context;
  const form={id:'general-form',querySelector:selector=>query(selector),querySelectorAll:selector=>queryAll(selector)};
  function makeControl(key,kind,raw=''){
    const attributes=attrs(raw);
    return {dataset:{field:key,scope:'general',...(kind==='trigger'?{dropdownId:`general-${key}`}:{})},tagName:kind==='trigger'?'BUTTON':kind==='select'?'SELECT':'INPUT',value:attributes.get('value')||'',type:'text',classList:classList(attributes.get('class')),getAttribute:name=>attributes.get(name)??null,setAttribute(name,value){attributes.set(name,value);},removeAttribute(name){attributes.delete(name);},focus(){focused={key,kind};context.document.activeElement=this;},closest(selector){return selector==='.field'?fields.get(key)?.field:selector==='.field-wrap'?fields.get(key)?.wrap:selector==='#general-form'?form:null;}};
  }
  function parse(value){
    html=value;renders++;fields.clear();errors.clear();
    const wraps=[...value.matchAll(/<div class="field-wrap" data-wrap="([^"]+)">/g)];
    for(let index=0;index<wraps.length;index++){
      const key=wraps[index][1],fragment=value.slice(wraps[index].index,wraps[index+1]?.index??value.length);
      const native=fragment.match(/<(input|select)\b([^>]*\bdata-field="[^"]+"[^>]*)>/);
      if(!native)continue;
      const input=makeControl(key,native[1]==='select'?'select':'input',native[2]);
      const triggerMatch=fragment.match(/<button\b([^>]*\bclass="select-trigger"[^>]*)>/);
      const trigger=triggerMatch?makeControl(key,'trigger',triggerMatch[1]):null;
      const controls=[input,...(trigger?[trigger]:[])];
      const field={classList:classList(fragment.match(/<(?:label|div) class="(field\s[^"]*)"/)?.[1]),querySelector:selector=>selector.includes('select-trigger')?trigger:input,querySelectorAll:()=>controls};
      const wrap={querySelector(selector){if(selector.includes('error-text'))return errors.get(`error-general-${key}`)||null;if(selector.includes('select-trigger'))return trigger;if(selector==='.field')return field;return input;},querySelectorAll(selector){return selector.includes('field')&&!selector.includes('data-field')?[field]:controls;}};
      fields.set(key,{input,trigger,field,wrap});
      const error=fragment.match(/<p[^>]*id="(error-general-[^"]+)"[^>]*>([^<]*)<\/p>/);
      if(error)errors.set(error[1],{textContent:error[2],remove(){errors.delete(error[1]);}});
    }
  }
  function queryAll(selector){
    const key=selector.match(/data-(?:field|wrap)="([^"]+)"/)?.[1];
    const matches=key?[fields.get(key)].filter(Boolean):[...fields.values()];
    return matches.flatMap(item=>[item.input,...(item.trigger?[item.trigger]:[])]).filter(item=>!selector.includes('aria-invalid')||item.getAttribute('aria-invalid')==='true').filter(item=>!selector.includes(':not(.select-native)')||item.tagName!=='SELECT');
  }
  function query(selector){
    if(selector==='#general-form')return form;
    const key=selector.match(/data-wrap="([^"]+)"/)?.[1];
    if(key)return fields.get(key)?.wrap||null;
    return queryAll(selector)[0]||null;
  }
  const overlay={get innerHTML(){return html;},set innerHTML(value){parse(value);},contains(){return false;},querySelector:query,querySelectorAll:queryAll};
  const elements=new Map([['#app',{innerHTML:'',inert:false}],['#overlay',overlay],['#toast',{textContent:'',classList:classList()}],['.app-header',{inert:false}]]);
  context=vm.createContext({
    document:{activeElement:{focus(){}},body:{classList:classList()},querySelector:selector=>elements.get(selector)||query(selector),querySelectorAll:queryAll,getElementById:id=>errors.get(id)||null,addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:callback=>{callback();return 0;},Intl,structuredClone,CSS:{escape:value=>value}
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  return {run,storage,html:()=>html,field:key=>fields.get(key),focused:()=>focused,renders:()=>renders,toast:()=>elements.get('#toast').textContent,errors:()=>JSON.parse(run('JSON.stringify(modal.errors||{})')),open:()=>run("openModal({type:'general',data:blankGeneral(),edit:false});"),submit(){for(const handler of listeners.get('submit')||[])handler({target:form,preventDefault(){}});},set(key,value){const input=fields.get(key).input;input.value=value;context.generalInput=input;run('handleField(generalInput);');}};
}

test('general validation requires all six fields and rejects whitespace while leaving comment optional',()=>{
  const demo=boot();
  for(const value of ['', ' \t\n ']){
    const errors=JSON.parse(demo.run(`JSON.stringify(generalErrors(${JSON.stringify(Object.fromEntries(required.map(key=>[key,value])))}))`));
    assert.deepEqual(errors.map(error=>error.field),required);
    assert.ok(errors.every(error=>error.message==='Required'));
  }
  assert.deepEqual(JSON.parse(demo.run(`JSON.stringify(generalErrors(${JSON.stringify(valid)}))`)),[]);
  assert.deepEqual(JSON.parse(demo.run(`JSON.stringify(generalErrors(${JSON.stringify({...valid,comment:' \n '} )}))`)),[]);
});

test('a new form has no errors until Create, then shows accessible errors without saving',()=>{
  const demo=boot();demo.open();
  assert.match(demo.html(),/<form[^>]*\bnovalidate\b/);
  assert.doesNotMatch(demo.html(),/aria-invalid="true"|id="error-general-/);
  const beforeData=demo.run('JSON.stringify(tickets)'),beforeStorage=demo.storage.get('communication-tickets-v1');
  demo.submit();
  assert.deepEqual(Object.keys(demo.errors()),['name','product','process','communicationType','silentHours']);
  for(const key of Object.keys(demo.errors())){
    const field=demo.field(key),visible=field.trigger||field.input;
    assert.equal(field.field.classList.contains('is-invalid'),true,key);
    assert.equal(visible.getAttribute('aria-invalid'),'true',key);
    assert.equal(visible.getAttribute('aria-describedby'),`error-general-${key}`,key);
    assert.match(demo.html(),new RegExp(`<p[^>]*id="error-general-${key}"[^>]*role="alert"[^>]*>Required<\\/p>`));
  }
  assert.deepEqual(demo.focused(),{key:'name',kind:'input'});
  assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
  assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
  assert.equal(demo.toast(),'');
});

test('fixing fields clears only their errors, whitespace stays invalid, and defaults clear dependent errors',()=>{
  const demo=boot();demo.open();demo.submit();
  const renders=demo.renders(),nameInput=demo.field('name').input;
  demo.set('name',' \t ');
  assert.equal(demo.errors().name,'Required');
  assert.equal(demo.field('name').field.classList.contains('is-invalid'),true);
  demo.set('name','Collection updates');
  assert.equal(demo.renders(),renders,'typing must keep the active input mounted');
  assert.equal(demo.field('name').input,nameInput);
  assert.equal(demo.field('name').field.classList.contains('is-invalid'),false);
  assert.equal(nameInput.getAttribute('aria-invalid'),null);
  assert.equal(nameInput.getAttribute('aria-describedby'),null);
  assert.deepEqual(Object.keys(demo.errors()),['product','process','communicationType','silentHours']);
  demo.set('communicationType','Service');
  assert.equal(demo.run('modal.data.silentHours'),'11 p.m. – 6 a.m.');
  assert.deepEqual(Object.keys(demo.errors()),['product','process']);
  assert.doesNotMatch(demo.html(),/id="error-general-(?:name|communicationType|silentHours)"/);
  assert.match(demo.html(),/id="error-general-product"/);
  assert.match(demo.html(),/id="error-general-process"/);
  demo.submit();
  assert.deepEqual(demo.focused(),{key:'product',kind:'trigger'},'focus the visible combobox instead of its hidden native select');
});

test('correcting an invalid form allows creating one draft and does not persist transient errors',()=>{
  const demo=boot();demo.open();demo.submit();
  const count=demo.run('tickets.length');
  for(const [key,value] of [['name',valid.name],['product',valid.product],['process',valid.process],['communicationType',valid.communicationType]])demo.set(key,value);
  assert.deepEqual(demo.errors(),{});
  demo.submit();
  assert.equal(demo.run('tickets.length'),count+1);
  assert.equal(demo.run('ticket().name'),valid.name);
  assert.equal(demo.run('ticket().status'),'draft');
  const saved=JSON.parse(demo.storage.get('communication-tickets-v1'))[0];
  assert.equal(saved.communicationType,'Service');
  assert.equal(saved.silentHours,'11 p.m. – 6 a.m.');
  assert.equal(Object.hasOwn(saved,'errors'),false);
  assert.equal(demo.run('modal'),null);
});

test('canceling and reopening starts clean and invalid edits leave the existing ticket untouched',()=>{
  const demo=boot();demo.open();demo.submit();
  demo.run('closeModal();');demo.open();
  assert.deepEqual(demo.errors(),{});
  assert.doesNotMatch(demo.html(),/id="error-general-/);
  demo.run("closeModal();state.ticketId=tickets[0].id;ticket().status='draft';touch();openModal({type:'general',data:Object.fromEntries(Object.keys(blankGeneral()).map(key=>[key,ticket()[key]])),edit:true});");
  const beforeData=demo.run('JSON.stringify(tickets)'),beforeStorage=demo.storage.get('communication-tickets-v1');
  demo.set('name','  ');demo.submit();
  assert.equal(demo.errors().name,'Required');
  assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
  assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
});

test('invalid communication type and forbidden marketing silent hours get field-specific messages',()=>{
  const demo=boot();
  for(const [key,value,message] of [['communicationType','Transactional','Choose Service or Marketing.'],['communicationType','OTP','Choose Service or Marketing.'],['silentHours','No silent hours','Choose silent hours for marketing communications.']]){
    const general={...valid,[key]:value,...(key==='silentHours'?{communicationType:'Marketing'}:{})};
    assert.deepEqual(JSON.parse(demo.run(`JSON.stringify(generalErrors(${JSON.stringify(general)}))`)),[{field:key,message}]);
  }
});
