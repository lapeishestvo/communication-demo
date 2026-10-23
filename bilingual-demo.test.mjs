import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {channelsFor,populateDemoTranslations,resolveText,seedTickets} from './public/model.js';
import {previewControlsHtml,previewVersions} from './public/preview.js';

const translatedStatuses=['text_review','in_development','in_testing','business_review','migration','in_prod_testing','done','canceled'];
const englishMessage='{{Amount}} returned {{Account type}}. Transfer to {{Recipient’s name}} failed.';
const spanishMessage='Se devolvieron {{Amount}} {{Account type}}. La transferencia a {{Recipient’s name}} falló.';
const applicationSource=(await readFile(new URL('./public/model.js',import.meta.url),'utf8')).replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/preview.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'').replace(/^export\s+/gm,'')+'\n'+(await readFile(new URL('./public/app.js',import.meta.url),'utf8')).replace(/^import[^\n]+\n/gm,'');

function bootApplication(serialized){
  const storage=new Map([['communication-tickets-v1',serialized]]);
  const elements=new Map(['#app','#toast'].map(selector=>[selector,{innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){}}]));
  const context=vm.createContext({
    document:{querySelector:selector=>elements.get(selector)||null,getElementById(){return null;},addEventListener(){}},
    window:{addEventListener(){}},location:{hash:'',pathname:'/communication-demo/',search:''},history:{replaceState(){}},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    setTimeout:()=>0,clearTimeout(){},Intl,structuredClone
  });
  const run=code=>vm.runInContext(code,context);
  run(applicationSource);
  return {run,storage,snapshot:()=>JSON.parse(run('JSON.stringify(tickets)'))};
}

function oldDemoTicket(status='text_review'){
  const ticket=JSON.parse(JSON.stringify(seedTickets()[0]));
  ticket.status=status;
  ticket.assignedAt='2026-10-22T09:00:00.000Z';
  ticket.updated='2026-10-23T10:00:00.000Z';
  for(const event of ticket.events){
    event.texts.pushTitleEs='';
    event.texts.pushMessageEs='';
    event.texts.smsMessageEs='';
    event.review={decision:'approved',comment:'Approved existing copy',author:'Reviewer',at:'2026-10-23T09:00:00.000Z'};
    event.businessReviewDraft='Keep this draft';
    event.testEvidence={demo:true,eventId:event.id,comment:'Existing test evidence',screens:[],contract:{type:event.name}};
  }
  for(const variable of ticket.variables){
    variable.defaultEs='';
    for(const row of variable.rows||[])row.es='';
  }
  return ticket;
}

function englishAndMetadata(ticket){
  const copy=structuredClone(ticket);
  for(const event of copy.events)for(const key of Object.keys(event.texts))if(key.endsWith('Es'))delete event.texts[key];
  for(const variable of copy.variables){
    delete variable.defaultEs;
    for(const row of variable.rows||[])delete row.es;
  }
  return copy;
}

test('every seeded event from Text review onward has both languages for its active channels',()=>{
  const tickets=seedTickets().filter(ticket=>translatedStatuses.includes(ticket.status));
  assert.deepEqual(new Set(tickets.map(ticket=>ticket.status)),new Set(translatedStatuses));
  for(const ticket of tickets)for(const event of ticket.events)for(const channel of channelsFor(event)){
    const key=channel.toLowerCase();
    for(const part of channel==='Push'?['Title','Message']:['Message']){
      const english=event.texts[key+part],spanish=event.texts[key+part+'Es'];
      assert.ok(english?.trim(),`${ticket.status}: ${event.name} ${channel} ${part} English`);
      assert.ok(spanish?.trim(),`${ticket.status}: ${event.name} ${channel} ${part} Spanish`);
      const tokens=text=>[...text.matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1]).sort();
      assert.deepEqual(tokens(spanish),tokens(english),`${ticket.status}: translated variables match`);
    }
  }
});

test('Spanish preview resolves translated messages, custom variations, and fallback values',()=>{
  for(const ticket of seedTickets().filter(ticket=>translatedStatuses.includes(ticket.status)))for(const event of ticket.events){
    const calls=[];
    previewControlsHtml(event,ticket.variables,{}, {lang:'es',field:(label,key,value)=>{calls.push({label,key,value});return label;}});
    assert.deepEqual(calls.map(call=>call.label),channelVariableNames(event));
    const versions=previewVersions(event,ticket.variables,{},'es');
    assert.ok(versions.length>1,`${ticket.status}: Spanish variations are available`);
    for(const overrides of versions)for(const channel of channelsFor(event)){
      const key=channel.toLowerCase();
      for(const part of channel==='Push'?['Title','Message']:['Message']){
        const resolved=resolveText(event.texts[key+part+'Es'],ticket.variables,overrides,'es');
        assert.equal(resolved.blocked,false);
        assert.ok(resolved.value.trim());
        assert.doesNotMatch(resolved.value,/\{\{|Refund from|returned|Transfer to|your bank account|to Cuenta|to Bolsillo|to CDT/);
      }
    }
    const empty=Object.fromEntries(ticket.variables.map(variable=>[variable.id,'']));
    const key=channelsFor(event)[0].toLowerCase();
    const fallback=resolveText(event.texts[key+'MessageEs'],ticket.variables,empty,'es');
    assert.match(fallback.value,/El dinero que enviaste/);
    assert.match(fallback.value,/a tu cuenta bancaria/);
  }
});

function channelVariableNames(event){
  return channelsFor(event).includes('Push')?['Bank name','Amount','Recipient’s name','Account type']:['Amount','Recipient’s name','Account type'];
}

test('persisted old demo data receives translations without changing IDs, English copy, reviews or timestamps',()=>{
  for(const status of translatedStatuses){
    const ticket=oldDemoTicket(status),before=englishAndMetadata(ticket);
    const event=ticket.events[0],variable=ticket.variables[0],eventId=event.id,variableId=variable.id;
    assert.equal(populateDemoTranslations(ticket),true,`${status}: old demo is upgraded`);
    assert.equal(ticket.events[0],event);
    assert.equal(ticket.variables[0],variable);
    assert.equal(event.id,eventId);
    assert.equal(variable.id,variableId);
    assert.equal(event.texts.pushTitleEs,'Reembolso de {{Bank name}}');
    assert.equal(event.texts.pushMessageEs,spanishMessage);
    assert.equal(event.texts.smsMessageEs,spanishMessage);
    assert.deepEqual(englishAndMetadata(ticket),before);
    const upgraded=JSON.stringify(ticket);
    assert.equal(populateDemoTranslations(ticket),false,`${status}: second pass is a no-op`);
    assert.equal(JSON.stringify(ticket),upgraded);
  }
});

test('migration translates known fallback and custom row text while preserving variable definitions',()=>{
  const ticket=oldDemoTicket();
  populateDemoTranslations(ticket);
  assert.equal(ticket.variables.find(variable=>variable.name==='Bank name').defaultEs,'el banco del destinatario');
  assert.equal(ticket.variables.find(variable=>variable.name==='Amount').defaultEs,'El dinero que enviaste');
  const account=ticket.variables.find(variable=>variable.name==='Account type');
  assert.equal(account.defaultEs,'a tu cuenta bancaria');
  assert.deepEqual(account.rows.slice(0,3).map(row=>row.es),['a Cuenta','a Bolsillo','a CDT']);
  for(const row of account.rows.filter(row=>row.mode==='Dictionary'))assert.equal(resolveText('{{Account type}}',[account],{[account.id]:row.value},'es').value,row.value);
  const unknown=account.rows.find(row=>row.mode==='Unknown');
  assert.equal(resolveText('{{Account type}}',[account],{[account.id]:unknown.value},'es').value,'a tu cuenta bancaria');
});

test('existing Spanish edits and unrecognized English copy are never overwritten',()=>{
  const ticket=oldDemoTicket();
  const event=ticket.events[0],bank=ticket.variables.find(variable=>variable.name==='Bank name'),account=ticket.variables.find(variable=>variable.name==='Account type');
  event.texts.pushTitleEs='Mi traducción';
  event.texts.pushMessage='A custom English message';
  event.texts.smsMessageEs='Otro mensaje';
  bank.defaultEn='Custom fallback';
  account.defaultEs='Mi cuenta';
  account.rows[0].es='Mi frase';
  account.rows[1].en='Custom row';
  assert.equal(populateDemoTranslations(ticket),true);
  assert.equal(event.texts.pushTitleEs,'Mi traducción');
  assert.equal(event.texts.pushMessageEs,'');
  assert.equal(event.texts.smsMessage,englishMessage);
  assert.equal(event.texts.smsMessageEs,'Otro mensaje');
  assert.equal(bank.defaultEs,'');
  assert.equal(account.defaultEs,'Mi cuenta');
  assert.equal(account.rows[0].es,'Mi frase');
  assert.equal(account.rows[1].es,'');
});

test('draft and Text pending copy remain untouched until the text review stage',()=>{
  for(const status of ['draft','text_pending']){
    const ticket=oldDemoTicket(status),before=JSON.stringify(ticket);
    assert.equal(populateDemoTranslations(ticket),false);
    assert.equal(JSON.stringify(ticket),before);
  }
});

test('application boot upgrades persisted demo tickets and saves an idempotent migration',()=>{
  const old=oldDemoTicket('business_review'),before=englishAndMetadata(old);
  const app=bootApplication(JSON.stringify([old]));
  const migrated=app.snapshot()[0];
  assert.equal(migrated.events[0].texts.pushTitleEs,'Reembolso de {{Bank name}}');
  assert.equal(migrated.events[0].texts.pushMessageEs,spanishMessage);
  assert.deepEqual(englishAndMetadata(migrated),before);
  const saved=app.storage.get('communication-tickets-v1');
  assert.deepEqual(JSON.parse(saved),[migrated]);
  const reload=bootApplication(saved);
  assert.equal(reload.storage.get('communication-tickets-v1'),saved);
  assert.deepEqual(reload.snapshot(),[migrated]);
});

test('starting Text review adds demo translations and retains the existing stage reset behavior',()=>{
  const old=oldDemoTicket('text_pending'),app=bootApplication(JSON.stringify([old]));
  assert.equal(app.snapshot()[0].events[0].texts.pushMessageEs,'');
  app.run("state.ticketId=tickets[0].id;state.nav='general';state.tab='main';state.reviewErrors[`${ticket().id}:${ticket().events[0].id}:review`]=true;reviewStage('start-text-review');");
  const reviewed=app.snapshot()[0];
  assert.equal(reviewed.status,'text_review');
  assert.equal(reviewed.id,old.id);
  assert.equal(reviewed.events[0].id,old.events[0].id);
  assert.equal(reviewed.events[0].texts.pushMessageEs,spanishMessage);
  assert.equal(reviewed.events[0].texts.pushTitleEs,'Reembolso de {{Bank name}}');
  assert.equal(reviewed.events[0].review,undefined);
  assert.equal(reviewed.events[0].reviewDraft,'');
  assert.deepEqual(reviewed.events[0].testEvidence,old.events[0].testEvidence);
  assert.equal(reviewed.events[0].businessReviewDraft,'Keep this draft');
  assert.equal(app.run('state.nav'),old.events[0].id);
  assert.equal(app.run('state.tab'),'texts');
  assert.equal(app.run('Object.keys(state.reviewErrors).length'),0);
  assert.deepEqual(JSON.parse(app.storage.get('communication-tickets-v1')),[reviewed]);
});
