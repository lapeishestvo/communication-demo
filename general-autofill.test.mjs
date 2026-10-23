import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const classes=()=>({add(){},remove(){},toggle(){}});

function boot(storage=new Map(),hash=''){
  const listeners=new Map();
  const overlay={innerHTML:'',contains(){return false;},querySelector(){return null;}};
  const elements=new Map([
    ['#app',{innerHTML:'',inert:false}],['#overlay',overlay],
    ['#toast',{textContent:'',classList:classes()}],['.app-header',{inert:false}]
  ]);
  const context=vm.createContext({
    document:{activeElement:{focus(){}},body:{classList:classes()},querySelector:selector=>elements.get(selector)||null,getElementById(){return null;},addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);}},
    window:{addEventListener(){}},location:{hash,pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,Intl,structuredClone,CSS:{escape:value=>value}
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  return {
    run,storage,toast:()=>elements.get('#toast').textContent,
    data:()=>JSON.parse(run('JSON.stringify(modal.data)')),
    open:()=>run("openModal({type:'general',data:blankGeneral(),edit:false});"),
    select(key,value){
      context.generalInput={dataset:{scope:'general',field:key},tagName:['name','comment'].includes(key)?'INPUT':'SELECT',value,closest(){return {classList:classes(),querySelector(){return null;}};},removeAttribute(){}};
      run('handleField(generalInput);');
    },
    selectEvent(key,value){
      context.eventInput={dataset:{scope:'event',field:key},tagName:'SELECT',value,closest(){return {classList:classes(),querySelector(){return null;}};},removeAttribute(){}};
      run('handleField(eventInput);');
    },
    selectHtml(key){return overlay.innerHTML.match(new RegExp(`<select\\b[^>]*\\bdata-field="${key}"[^>]*>([\\s\\S]*?)<\\/select>`))?.[1]||'';},
    submit(){for(const handler of listeners.get('submit')||[])handler({target:{id:'general-form'},preventDefault(){}});}
  };
}

test('type and process changes populate the matching defaults in the actual general form',()=>{
  const demo=boot();
  demo.open();
  assert.equal(demo.data().ttl,'7 days');
  demo.select('process','Origination');
  assert.equal(demo.data().ttl,'1 day');
  demo.select('communicationType','Service');
  assert.equal(demo.data().silentHours,'11 p.m. – 6 a.m.');
  assert.match(demo.selectHtml('ttl'),/<option value="1 day" selected/);
  demo.select('process','Collection');
  assert.equal(demo.data().ttl,'7 days');
  demo.select('communicationType','Marketing');
  assert.equal(demo.data().silentHours,'8 p.m. – 8 a.m.');
  assert.match(demo.selectHtml('silentHours'),/<option value="8 p.m. – 8 a.m." selected/);
});

test('both OTP processes use ten minutes with a supported Service communication type',()=>{
  for(const process of ['Transaction OTP','Authorization OTP']){
    const demo=boot();
    demo.open();
    demo.select('communicationType','Service');
    demo.select('process',process);
    assert.equal(demo.data().ttl,'10 minutes');
    assert.equal(demo.data().silentHours,'11 p.m. – 6 a.m.');
    assert.match(demo.selectHtml('ttl'),/<option value="10 minutes" selected/);
    demo.select('process','Collection');
    assert.equal(demo.data().ttl,'7 days');
  }
});

test('MVP dropdowns do not restore removed types or channels from legacy values',()=>{
  const demo=boot();
  const optionValues=html=>[...html.matchAll(/<option\b[^>]*\bvalue="([^"]*)"/g)].map(match=>match[1]);
  demo.open();
  assert.deepEqual(optionValues(demo.selectHtml('communicationType')),['','Service','Marketing']);
  for(const type of ['Transactional','OTP']){
    demo.run(`openModal({type:'general',data:{...blankGeneral(),communicationType:${JSON.stringify(type)}},edit:true});`);
    assert.deepEqual(optionValues(demo.selectHtml('communicationType')),['','Service','Marketing']);
  }
  demo.run("state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;");
  for(const channel of ['Email','WhatsApp']){
    const html=demo.run(`mainInfoView({...newEvent(),channel:${JSON.stringify(channel)}})`);
    const options=html.match(/<select\b[^>]*\bdata-field="channel"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
    assert.deepEqual(optionValues(options),['','Push','SMS','Push + SMS','Push or SMS']);
  }
});

test('Push or SMS selection exposes both editors and survives reload without changing the channel value',()=>{
  const demo=boot();
  demo.run("state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;");
  const id=demo.run('ticket().id'),eventId=demo.run('event().id');
  demo.selectEvent('channel','Push or SMS');
  assert.equal(demo.run('event().channel'),'Push or SMS');
  const fields=demo.run('textsView(event())');
  assert.match(fields,/data-rich="pushTitle"/);
  assert.match(fields,/data-rich="pushMessage"/);
  assert.match(fields,/data-rich="smsMessage"/);
  const content=demo.run('contentView(event())');
  assert.match(content,/linkEnabled\.push/);
  assert.match(content,/linkEnabled\.sms/);
  const before=demo.run('JSON.stringify(event().texts)');
  const reloaded=boot(demo.storage,`#ticket/${id}`);
  reloaded.run(`state.nav=${JSON.stringify(eventId)};`);
  assert.equal(reloaded.run('event().channel'),'Push or SMS');
  assert.equal(reloaded.run('JSON.stringify(event().texts)'),before);
});

test('unsupported selections and stale general-form submissions cannot write removed MVP values',()=>{
  const demo=boot();
  demo.open();
  for(const [key,value] of [['name','MVP test'],['product','CCR'],['process','Collection'],['communicationType','Service']])demo.select(key,value);
  for(const type of ['Transactional','OTP']){
    demo.select('communicationType',type);
    assert.equal(demo.data().communicationType,'Service');
  }
  const beforeData=demo.run('JSON.stringify(tickets)'),beforeStorage=demo.storage.get('communication-tickets-v1');
  for(const type of ['Transactional','OTP']){
    demo.run(`modal.data.communicationType=${JSON.stringify(type)};`);
    demo.submit();
    assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
    assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
  }
  demo.run("closeModal();state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;");
  const beforeChannel=demo.run('event().channel');
  for(const channel of ['Email','WhatsApp']){
    demo.selectEvent('channel',channel);
    assert.equal(demo.run('event().channel'),beforeChannel);
    assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
    assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
  }
});

test('a legacy draft with a removed communication type cannot be sent',()=>{
  for(const type of ['Transactional','OTP']){
    const demo=boot();
    demo.run(`state.ticketId=tickets[0].id;state.nav='general';ticket().communicationType=${JSON.stringify(type)};touch();`);
    const beforeData=demo.run('JSON.stringify(tickets)'),beforeStorage=demo.storage.get('communication-tickets-v1');
    demo.run('sendTicket();');
    assert.equal(demo.run('ticket().status'),'draft');
    assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
    assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
    assert.equal(demo.run("state.errors.some(error=>error.field==='communicationType')"),true);
  }
});

test('manual values survive dependent and unrelated edits except forbidden marketing None',()=>{
  const demo=boot();
  demo.open();
  demo.select('communicationType','Service');
  demo.select('ttl','6 hours');
  demo.select('silentHours','No silent hours');
  demo.select('name','Manual settings');
  demo.select('product','CCR');
  demo.select('process','Origination');
  demo.select('process','Authorization OTP');
  assert.equal(demo.data().ttl,'6 hours');
  assert.equal(demo.data().silentHours,'No silent hours');
  demo.select('communicationType','Marketing');
  assert.equal(demo.data().ttl,'6 hours');
  assert.equal(demo.data().silentHours,'8 p.m. – 8 a.m.');
  assert.equal(demo.data().name,'Manual settings');
  assert.equal(demo.data().product,'CCR');
});

test('marketing omits None and corrects a stale None selection before it can be saved',()=>{
  const demo=boot();
  demo.open();
  demo.select('communicationType','Marketing');
  assert.doesNotMatch(demo.selectHtml('silentHours'),/value="No silent hours"/);
  demo.select('silentHours','No silent hours');
  assert.equal(demo.data().silentHours,'8 p.m. – 8 a.m.');
  assert.doesNotMatch(demo.selectHtml('silentHours'),/value="No silent hours"/);
  const beforeData=demo.run('JSON.stringify(tickets)'),beforeStorage=demo.storage.get('communication-tickets-v1');
  demo.run("modal.data.silentHours='No silent hours';");
  demo.submit();
  assert.equal(demo.run('modal.errors.silentHours'),'Choose silent hours for marketing communications.');
  assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
  assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
});

test('editing and canceling a legacy ticket keeps saved manual settings and storage unchanged',()=>{
  const demo=boot();
  demo.run("state.ticketId=tickets[0].id;ticket().status='draft';ticket().communicationType='Service';ticket().process='Collection';ticket().ttl='12 hours';ticket().silentHours='No silent hours';touch();render();");
  const beforeData=demo.run('JSON.stringify(tickets)'),beforeStorage=demo.storage.get('communication-tickets-v1');
  demo.run("openModal({type:'general',data:Object.fromEntries(Object.keys(blankGeneral()).map(key=>[key,ticket()[key]])),edit:true});");
  assert.equal(demo.data().ttl,'12 hours');
  assert.equal(demo.data().silentHours,'No silent hours');
  demo.select('process','Origination');
  demo.select('communicationType','Marketing');
  demo.run('closeModal();');
  assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
  assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
});

test('creation and saved manual overrides survive reload as ticket data',()=>{
  const demo=boot();
  demo.open();
  for(const [key,value] of [['name','Autofill test'],['product','CCR'],['process','Origination'],['communicationType','Service']])demo.select(key,value);
  demo.submit();
  const id=demo.run('ticket().id');
  assert.equal(demo.run('ticket().ttl'),'1 day');
  assert.equal(demo.run('ticket().silentHours'),'11 p.m. – 6 a.m.');
  demo.run("openModal({type:'general',data:Object.fromEntries(Object.keys(blankGeneral()).map(key=>[key,ticket()[key]])),edit:true});");
  demo.select('ttl','2 days');
  demo.select('silentHours','No silent hours');
  demo.select('process','Collection');
  demo.submit();
  const reloaded=boot(demo.storage,`#ticket/${id}`);
  assert.equal(reloaded.run('ticket().ttl'),'2 days');
  assert.equal(reloaded.run('ticket().silentHours'),'No silent hours');
  assert.equal(reloaded.run('ticket().process'),'Collection');
  assert.equal(reloaded.run("Object.hasOwn(ticket(),'generalOverrides')"),false);
});
