import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');
const classes=()=>{
  const values=new Set();
  return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value),toggle(value,enabled){enabled?values.add(value):values.delete(value);}};
};

// Small event/element fixture: exercise the actual application handlers without
// substituting their selection or keyboard behavior.
function boot({value='',disabled=false}={}){
  const listeners=new Map(),menus=[],frames=[];
  const elements=new Map(['#app','#toast'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:classes()}]));
  const document={
    activeElement:null,
    querySelector:selector=>selector==='[data-dropdown-id="general-product"]'?trigger:selector==='#general-form [aria-invalid="true"]'?(attributes.has('aria-invalid')?trigger:null):elements.get(selector)||null,
    getElementById:id=>menus.find(menu=>menu.id===id&&menu.isConnected)||null,
    addEventListener(type,handler){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(handler);},
    body:{append(element){element.isConnected=true;menus.push(element);}},
    createElement(){
      const element={id:'',style:{},children:[],isConnected:false,attributes:new Map(),setAttribute(name,value){this.attributes.set(name,value);},contains(target){return target===this||this.children.includes(target);},remove(){this.isConnected=false;}};
      Object.defineProperty(element,'innerHTML',{set(html){this.children=[...html.matchAll(/id="([^"]+)"[^>]+data-option-index="(\d+)"/g)].map(match=>({id:match[1],classList:classes(),scrollIntoView(){}}));}});
      return element;
    }
  };
  const field={classList:classes(),querySelector:selector=>selector==='.select-trigger'?trigger:select};
  const text={textContent:value};
  const attributes=new Map([['aria-controls','dropdown-general-product'],['aria-label','Product'],['aria-expanded','false']]);
  const trigger={
    dataset:{dropdownId:'general-product'},isConnected:true,
    getAttribute:name=>attributes.get(name),setAttribute:(name,value)=>attributes.set(name,value),removeAttribute:name=>attributes.delete(name),
    closest:selector=>selector==='.select-control'?field:selector==='.select-trigger'?trigger:null,
    querySelector:()=>text,getBoundingClientRect:()=>({top:100,bottom:148,left:100,width:300}),focus(){document.activeElement=this;}
  };
  const select={
    dataset:{field:'product',scope:'general'},tagName:'SELECT',disabled,
    options:[{value:'',textContent:'Product',disabled:true},...['CCR','Debit account','Savings'].map(value=>({value,textContent:value,disabled:false}))],
    closest:selector=>selector==='#general-form'?{}:field,matches:selector=>selector.includes('select[data-field]'),removeAttribute(){},
    dispatchEvent(event){for(const handler of listeners.get(event.type)||[])handler({target:this});}
  };
  Object.defineProperty(select,'value',{get:()=>value,set(next){value=next;for(const option of select.options)option.selected=option.value===value;}});
  select.value=value;
  const context=vm.createContext({
    document,window:{addEventListener(){},innerWidth:1280,innerHeight:900},
    location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>0,clearTimeout(){},Intl,structuredClone,
    Event:class {constructor(type,options){this.type=type;Object.assign(this,options);}},CSS:{escape:value=>value},
    requestAnimationFrame(callback){frames.push(callback);return frames.length;},
    trigger
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run("modal={type:'general',data:blankGeneral()};");
  return {
    run,select,trigger,attributes,text,document,field,
    invalid(){for(const handler of listeners.get('invalid')||[])handler({target:select,preventDefault(){}});},
    flushFrames(){while(frames.length)frames.shift()();},
    key(key){const event={target:trigger,key,preventDefault(){this.defaultPrevented=true;}};for(const handler of listeners.get('keydown')||[])handler(event);return event;}
  };
}

test('dropdown keyboard selection updates the backing select and general-info model',()=>{
  const demo=boot();
  demo.key('ArrowDown');
  assert.equal(demo.attributes.get('aria-expanded'),'true');
  demo.key('ArrowDown');
  demo.key('Enter');
  assert.equal(demo.select.value,'Debit account');
  assert.equal(demo.run('modal.data.product'),'Debit account');
  assert.equal(demo.text.textContent,'Debit account');
  assert.equal(demo.attributes.get('aria-expanded'),'false');
  assert.equal(demo.document.activeElement,demo.trigger);
});

test('Escape dismisses a navigated dropdown without changing the stored selection',()=>{
  const demo=boot({value:'Savings'});
  demo.run("modal.data.product='Savings';openDropdown(trigger);");
  demo.key('Home');
  demo.key('Escape');
  assert.equal(demo.select.value,'Savings');
  assert.equal(demo.run('modal.data.product'),'Savings');
  assert.equal(demo.attributes.get('aria-expanded'),'false');
  assert.equal(demo.document.activeElement,demo.trigger);
});

test('dropdown typeahead commits the matching enabled option',()=>{
  const demo=boot();
  demo.run('openDropdown(trigger);');
  demo.key('s');
  demo.key('Enter');
  assert.equal(demo.select.value,'Savings');
  assert.equal(demo.run('modal.data.product'),'Savings');
});

test('disabled dropdowns do not open or change their backing value',()=>{
  const demo=boot({value:'CCR',disabled:true});
  demo.key('ArrowDown');
  assert.equal(demo.run('dropdownMenu'),null);
  assert.equal(demo.select.value,'CCR');
  assert.equal(demo.attributes.get('aria-expanded'),'false');
});

test('required dropdown validation exposes the error and selection clears it',()=>{
  const demo=boot();
  demo.invalid();
  demo.flushFrames();
  assert.equal(demo.attributes.get('aria-invalid'),'true');
  assert.equal(demo.field.classList.contains('is-invalid'),true);
  assert.equal(demo.document.activeElement,demo.trigger);
  demo.key('ArrowDown');
  demo.key('Enter');
  assert.equal(demo.select.value,'CCR');
  assert.equal(demo.attributes.has('aria-invalid'),false);
  assert.equal(demo.field.classList.contains('is-invalid'),false);
});
