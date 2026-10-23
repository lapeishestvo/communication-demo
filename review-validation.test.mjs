import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');

function classList(initial=''){
  const classes=new Set(initial.split(/\s+/).filter(Boolean));
  return {
    add(...names){names.forEach(name=>classes.add(name));},
    remove(...names){names.forEach(name=>classes.delete(name));},
    contains(name){return classes.has(name);},
    toggle(name,force){const add=force??!classes.has(name);if(add)classes.add(name);else classes.delete(name);return add;}
  };
}

function boot(status){
  const storage=new Map();
  let html='',renderCount=0,comment=null,error=null;
  const app={get innerHTML(){return html;},set innerHTML(value){
    html=value;renderCount++;
    const textarea=value.match(/<textarea\s+([^>]*\bdata-field="reviewComment"[^>]*)>/);
    if(!textarea){comment=null;error=null;return;}
    const attrs=new Map([...textarea[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
    const label=value.slice(0,textarea.index).match(/<label class="([^"]*)">[^<]*(?:<span>[^<]*<\/span>)?$/);
    const field={classList:classList(label?.[1]),querySelector(){return null;}};
    comment={
      dataset:{field:'reviewComment',scope:'review'},value:'',field,focused:false,
      closest(selector){return selector==='.field'?field:null;},
      getAttribute(name){return attrs.get(name)??null;},
      setAttribute(name,value){attrs.set(name,value);},
      removeAttribute(name){attrs.delete(name);},
      focus(){this.focused=true;}
    };
    error=value.includes('id="review-comment-error"')?{removed:false,remove(){this.removed=true;error=null;}}:null;
  }};
  const elements=new Map([
    ['#app',app],
    ['#toast',{textContent:'',classList:classList()}],
    ['#preview-content',{innerHTML:''}]
  ]);
  const context=vm.createContext({
    document:{
      querySelector:selector=>selector==='[data-field="reviewComment"]'?comment:elements.get(selector)||null,
      getElementById:id=>id==='review-comment-error'?error:null,
      addEventListener(){}
    },
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo.html',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);
  run(source);
  run(`state.ticketId=tickets[0].id;state.nav=ticket().events[0].id;state.tab='texts';ticket().status=${JSON.stringify(status)};ticket().events.forEach(e=>{delete e.review;delete e.businessReview;e.reviewDraft='';e.businessReviewDraft='';});touch();render();`);
  return {
    run,storage,html:()=>html,comment:()=>comment,error:()=>error,renderCount:()=>renderCount,
    saved:()=>JSON.parse(storage.get('communication-tickets-v1'))[0],
    type(value){comment.value=value;context.reviewInput=comment;run('handleField(reviewInput);');}
  };
}

for(const [stage,decisionKey,draftKey] of [['text_review','review','reviewDraft'],['business_review','businessReview','businessReviewDraft']]){
  test(`${stage}: empty and whitespace-only declines show inline validation without changing ticket data`,()=>{
    for(const value of ['','  \n\t ']){
      const demo=boot(stage);
      demo.run(`event()[${JSON.stringify(draftKey)}]=${JSON.stringify(value)};`);
      const beforeData=demo.run('JSON.stringify(tickets)');
      const beforeStorage=demo.storage.get('communication-tickets-v1');
      demo.run("reviewEvent('declined');");
      assert.equal(demo.run('JSON.stringify(tickets)'),beforeData);
      assert.equal(demo.storage.get('communication-tickets-v1'),beforeStorage);
      assert.equal(demo.run(`event()[${JSON.stringify(decisionKey)}]`),undefined);
      assert.equal(demo.comment().field.classList.contains('is-invalid'),true);
      assert.equal(demo.comment().getAttribute('aria-invalid'),'true');
      assert.equal(demo.comment().getAttribute('aria-describedby'),'review-comment-error');
      assert.match(demo.html(),/<p[^>]*id="review-comment-error"[^>]*role="alert"[^>]*>Required when declining<\/p>/);
      assert.equal(demo.comment().focused,true);
    }
  });

  test(`${stage}: whitespace keeps the error, valid typing clears it in place and allows declining`,()=>{
    const demo=boot(stage);
    demo.run("reviewEvent('declined');");
    const input=demo.comment(),message=demo.error(),renders=demo.renderCount();
    demo.type(' \t ');
    assert.equal(demo.comment(),input);
    assert.equal(demo.renderCount(),renders);
    assert.equal(input.field.classList.contains('is-invalid'),true);
    assert.equal(input.getAttribute('aria-invalid'),'true');
    assert.equal(input.getAttribute('aria-describedby'),'review-comment-error');
    assert.equal(demo.error(),message);

    demo.type('  Please revise the offer  ');
    assert.equal(demo.comment(),input);
    assert.equal(demo.renderCount(),renders);
    assert.equal(input.field.classList.contains('is-invalid'),false);
    assert.equal(input.getAttribute('aria-invalid'),null);
    assert.equal(input.getAttribute('aria-describedby'),null);
    assert.equal(message.removed,true);
    assert.equal(demo.error(),null);
    demo.run('render();');
    assert.doesNotMatch(demo.html(),/id="review-comment-error"/);
    demo.run("reviewEvent('declined');");
    assert.equal(demo.saved().events[0][decisionKey].decision,'declined');
    assert.equal(demo.saved().events[0][decisionKey].comment,'Please revise the offer');
    assert.equal(demo.saved().events[0][draftKey],'  Please revise the offer  ');
    assert.equal(demo.saved().status,stage);
  });

  test(`${stage}: accepting without a comment still succeeds after a decline validation error`,()=>{
    const demo=boot(stage);
    demo.run("reviewEvent('declined');reviewEvent('approved');");
    assert.equal(demo.saved().events[0][decisionKey].decision,'approved');
    assert.equal(demo.saved().events[0][decisionKey].comment,'');
    assert.equal(demo.saved().status,stage);
    assert.equal(demo.run('reviewCommentError()'),false);
    assert.doesNotMatch(demo.html(),/id="review-comment-error"/);
  });
}

test('comment validation is isolated by event and review stage and remains when returning to the invalid event',()=>{
  const demo=boot('text_review');
  demo.run("reviewEvent('declined');state.nav=ticket().events[1].id;render();");
  assert.doesNotMatch(demo.html(),/id="review-comment-error"/);
  assert.equal(demo.comment().getAttribute('aria-invalid'),null);
  demo.run("reviewEvent('declined');ticket().status='business_review';render();");
  assert.doesNotMatch(demo.html(),/id="review-comment-error"/);
  demo.run("reviewEvent('declined');state.nav=ticket().events[0].id;render();");
  assert.doesNotMatch(demo.html(),/id="review-comment-error"/);
  demo.run("ticket().status='text_review';render();");
  assert.match(demo.html(),/id="review-comment-error"/);
  demo.run("state.nav=ticket().events[1].id;render();");
  assert.match(demo.html(),/id="review-comment-error"/);
  demo.run("ticket().status='business_review';render();");
  assert.match(demo.html(),/id="review-comment-error"/);
});

test('validation from one ticket does not mark the same event in a different ticket',()=>{
  const demo=boot('text_review');
  demo.run("reviewEvent('declined');const other=structuredClone(ticket());other.id='another-ticket';tickets.push(other);state.ticketId=other.id;render();");
  assert.doesNotMatch(demo.html(),/id="review-comment-error"/);
  assert.equal(demo.comment().getAttribute('aria-invalid'),null);
});
