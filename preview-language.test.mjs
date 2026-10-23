import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {previewVariables,previewControlsHtml,previewVersions} from './public/preview.js';
import {newEvent,resolveText} from './public/model.js';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const classes=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
const account={id:'account',name:'account',parameter:'account',kind:'variations',example:'checking',fallback:'default',defaultEn:'your account',defaultEs:'tu cuenta',rows:[{value:'checking',mode:'Custom text',en:'checking account',es:'cuenta corriente'},{value:'savings',mode:'Custom text',en:'savings account',es:'cuenta de ahorro'}]};

function boot(status='draft'){
  const storage=new Map(),listeners=new Map();
  let focused=null,context;
  const buttons=Object.fromEntries(['en','es'].map(lang=>[lang,{dataset:{action:'preview-language',lang},disabled:false,classList:classes(),closest(selector){return selector==='[data-action]'?this:null;},focus(){focused=lang;context.document.activeElement=this;}}]));
  const elements=new Map(['#app','#toast','#preview-content'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:classes()}]));
  context=vm.createContext({
    document:{activeElement:null,querySelector(selector){
      if(elements.has(selector))return elements.get(selector);
      if(selector.includes('preview-language')){
        const lang=selector.match(/data-lang="(en|es)"/)?.[1]||(selector.includes('aria-pressed="true"')?vm.runInContext('state.lang',context):null);
        return buttons[lang]||null;
      }
      return null;
    },getElementById(){return null;},addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone,CSS:{escape:value=>value}
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run(`state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;ticket().status=${JSON.stringify(status)};state.tab=${JSON.stringify(status==='draft'?'texts':'preview')};event().channel='Push + SMS';event().texts={pushTitle:'English title',pushMessage:'English {{account}} / {{amount}}',smsMessage:'English SMS {{account}} / {{amount}}',pushTitleEs:'Título español',pushMessageEs:'Español {{account}} / {{amount}}',smsMessageEs:'SMS español {{account}} / {{amount}}'};ticket().variables=[${JSON.stringify(account)},{id:'amount',name:'amount',parameter:'amount',kind:'value',example:'$200',fallback:'hide',rows:[]}];state.preview={amount:'$987'};touch();render();`);
  return {run,storage,focused:()=>focused,html:()=>elements.get('#app').innerHTML,preview:()=>elements.get('#preview-content').innerHTML,click(lang){const target=buttons[lang]||{dataset:{action:'preview-language',lang},disabled:false,classList:classes(),closest(selector){return selector==='[data-action]'?this:null;}};for(const handler of listeners.get('click')||[])handler({target});}};
}

test('preview variable controls stay identical across languages and follow the active channel without losing overrides',()=>{
  const event={...newEvent(),channel:'SMS',texts:{smsMessage:'{{english}}',smsMessageEs:'{{spanish}}',pushTitleEs:'{{inactive}}'}};
  const variables=['english','spanish','inactive'].map(name=>({id:name,name,parameter:name,kind:'value',example:name+' example'}));
  assert.deepEqual(previewVariables(event,variables,'en').map(variable=>variable.name),['english','spanish']);
  assert.deepEqual(previewVariables(event,variables,'es').map(variable=>variable.name),['english','spanish']);
  const overrides={english:'English override',spanish:'Valor elegido'},before=JSON.stringify({event,variables,overrides}),calls=[];
  previewControlsHtml(event,variables,overrides,{lang:'es',field:(label,key,value)=>{calls.push({label,key,value});return label;}});
  assert.deepEqual(calls,[{label:'english',key:'english',value:'English override'},{label:'spanish',key:'spanish',value:'Valor elegido'}]);
  assert.equal(JSON.stringify({event,variables,overrides}),before);
});

test('Spanish all versions use translated variations and fallback rather than English text',()=>{
  const event={...newEvent(),channel:'SMS',texts:{smsMessage:'For {{account}}',smsMessageEs:'Para {{account}}'}};
  const versions=previewVersions(event,[account],{},'es');
  assert.deepEqual(versions.map(values=>resolveText(event.texts.smsMessageEs,[account],values,'es').value),['Para cuenta corriente','Para cuenta de ahorro','Para tu cuenta']);
});

for(const status of ['draft','text_review','business_review','text_pending','in_development','in_testing','migration','in_prod_testing','done','canceled']){
  test(`${status}: the visible language switch updates copy and all versions without saving or changing navigation`,()=>{
    const demo=boot(status),before=demo.run('JSON.stringify(ticket())'),saved=demo.storage.get('communication-tickets-v1'),position=demo.run('JSON.stringify([state.nav,state.tab,state.preview])');
    assert.match(demo.html(),/aria-label="Preview language"/);
    assert.match(demo.html(),/<button\b[^>]*data-lang="en"[^>]*aria-pressed="true"|<button\b[^>]*aria-pressed="true"[^>]*data-lang="en"/);
    assert.match(demo.preview(),/English title/);
    assert.match(demo.preview(),/English checking account \/ \$987/);
    const controls=demo.html().match(/<div class="preview-controls">[\s\S]*?(?=<div id="preview-content")/)[0];
    demo.click('es');
    assert.equal(demo.run('state.lang'),'es');
    assert.match(demo.html(),/<button\b[^>]*data-lang="es"[^>]*aria-pressed="true"|<button\b[^>]*aria-pressed="true"[^>]*data-lang="es"/);
    assert.match(demo.preview(),/Título español/);
    assert.match(demo.preview(),/Español cuenta corriente \/ \$987/);
    assert.match(demo.preview(),/SMS español cuenta corriente \/ \$987/);
    assert.match(demo.preview(),/Español cuenta de ahorro \/ \$987/);
    assert.match(demo.preview(),/Español tu cuenta \/ \$987/);
    assert.doesNotMatch(demo.preview(),/English|checking account|savings account|your account/);
    assert.equal(demo.html().match(/<div class="preview-controls">[\s\S]*?(?=<div id="preview-content")/)[0],controls);
    assert.equal(demo.focused(),'es');
    assert.equal(demo.run('JSON.stringify([state.nav,state.tab,state.preview])'),position);
    assert.equal(demo.run('JSON.stringify(ticket())'),before);
    assert.equal(demo.storage.get('communication-tickets-v1'),saved);
    demo.click('en');
    assert.match(demo.preview(),/English title/);
    assert.match(demo.preview(),/English checking account \/ \$987/);
    assert.equal(demo.run('JSON.stringify(ticket())'),before);
    assert.equal(demo.storage.get('communication-tickets-v1'),saved);
  });
}

test('missing Spanish copy keeps empty placeholders instead of displaying English copy',()=>{
  const demo=boot();
  demo.run("event().texts.pushTitleEs='';event().texts.pushMessageEs='';event().texts.smsMessageEs='';render();");
  demo.click('es');
  assert.match(demo.preview(),/No title/);
  assert.match(demo.preview(),/No message/);
  assert.doesNotMatch(demo.preview(),/English|checking account|\$987/);
  assert.match(demo.html(),/data-field="account"/);
  assert.match(demo.html(),/data-field="amount"[^>]*value="\$987"/);
});

test('switching to Spanish keeps controls and chosen values even when translated copy omits a variable',()=>{
  const demo=boot('text_review');
  demo.run("event().texts.pushMessageEs='Español {{amount}}';event().texts.smsMessageEs='SMS español {{amount}}';state.preview.account='savings';render();");
  const before=demo.run('JSON.stringify([ticket(),state.preview])');
  demo.click('es');
  assert.match(demo.html(),/data-field="account"/);
  assert.match(demo.html(),/<option value="savings" selected>/);
  assert.match(demo.preview(),/Español \$987/);
  demo.click('en');
  assert.match(demo.preview(),/English savings account \/ \$987/);
  assert.equal(demo.run('JSON.stringify([ticket(),state.preview])'),before);
});

test('unsupported language actions leave preview state and saved data unchanged',()=>{
  const demo=boot(),before=demo.run('JSON.stringify([state.lang,state.preview,ticket()])'),saved=demo.storage.get('communication-tickets-v1'),html=demo.preview();
  demo.click('fr');
  assert.equal(demo.run('JSON.stringify([state.lang,state.preview,ticket()])'),before);
  assert.equal(demo.storage.get('communication-tickets-v1'),saved);
  assert.equal(demo.preview(),html);
});
