import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoEvidence,generalDefaults,newEvent,resolveText,seedTickets} from './public/model.js';

function fixture(){
  const event={...newEvent(),id:'event-123',name:'transfer_refund_v2',channel:'Push + SMS'};
  Object.assign(event.texts,{pushTitle:'Refund from {{Bank name}}',pushMessage:'{{Amount}} returned {{Account type}}.',smsMessage:'Refund from {{Bank name}}: {{Amount}} returned {{Account type}}.'});
  const ticket={id:'ticket-123',name:'Refund test',updated:'2026-10-23T10:30:00.000Z',events:[event],variables:[
    {id:'bank',name:'Bank name',parameter:'Bank name',kind:'value',example:'CNBV',fallback:'block',rows:[]},
    {id:'amount',name:'Amount',parameter:'Amount',kind:'value',example:'$200',fallback:'block',rows:[]},
    {id:'account',name:'Account type',parameter:'Account type',kind:'variations',example:'Cuenta',fallback:'block',rows:[{value:'Cuenta',mode:'Custom text',en:'to Cuenta'},{value:'Ahorro Flexible',mode:'Custom text',en:'to Bolsillo'}]},
    {id:'unused',name:'Unused',parameter:'Unused',kind:'value',example:'Must stay out',fallback:'block',rows:[]}
  ]};
  return {ticket,event};
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('demo evidence is deterministic, event-specific and does not change ticket data',()=>{
  const {ticket,event}=fixture(),before=JSON.stringify(ticket);
  const first=createDemoEvidence(ticket,event,0),second=createDemoEvidence(ticket,event,0);
  assert.deepEqual(first,second);
  assert.equal(JSON.stringify(ticket),before);
  assert.equal(first.demo,true);
  assert.equal(first.eventId,event.id);
  assert.equal(first.eventName,event.name);
  assert.ok(first.tester&&first.comment);
  assert.ok(Number.isFinite(Date.parse(first.testedAt)));
  assert.equal(first.contract.type,event.name);
  assert.match(first.contract.idempotencyKey,uuid);
});

test('screen copy resolves the actual active event text and uses the same input values as its contract',()=>{
  const {ticket,event}=fixture(),result=createDemoEvidence(ticket,event);
  assert.deepEqual(new Set(result.screens.map(screen=>screen.channel)),new Set(['Push','SMS']));
  assert.ok(result.screens.length>=2);
  for(const screen of result.screens){
    const key=screen.channel.toLowerCase();
    const values=Object.fromEntries(ticket.variables.map(variable=>[variable.id,screen.parameters[variable.parameter||variable.name]]));
    assert.equal(screen.title,resolveText(event.texts[key+'Title']||'',ticket.variables,values).value);
    assert.equal(screen.message,resolveText(event.texts[key+'Message']||'',ticket.variables,values).value);
    assert.doesNotMatch(screen.title+screen.message,/\{\{/);
    assert.ok(['iOS','Android'].includes(screen.platform));
    assert.ok(Number.isFinite(Date.parse(screen.receivedAt)));
    assert.ok(screen.id&&screen.label&&screen.recipient);
    assert.equal(Object.hasOwn(screen.parameters,'Unused'),false);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(result.contract.parameters).map(([key,value])=>[key,value.stringValue])),result.screens[0].parameters);
});

test('different events receive distinct evidence identities and varied sample inputs',()=>{
  const {ticket,event}=fixture();
  const results=Array.from({length:8},(_,index)=>createDemoEvidence(ticket,{...event,id:`event-${index}`,name:`transfer_refund_v${index}`},index));
  assert.equal(new Set(results.map(result=>result.contract.idempotencyKey)).size,results.length);
  assert.equal(new Set(results.map(result=>result.screens[0].id)).size,results.length);
  assert.ok(new Set(results.map(result=>JSON.stringify(result.screens[0].parameters))).size>1);
  assert.ok(new Set(results.map(result=>result.testedAt)).size>1);
});

test('custom parameter names matching object properties remain literal contract values',()=>{
  const {ticket,event}=fixture();
  event.channel='SMS';event.texts.smsMessage='{{__proto__}} / {{constructor}}';
  ticket.variables=[
    {id:'literal-proto',name:'__proto__',parameter:'__proto__',kind:'value',example:'First literal',fallback:'block'},
    {id:'literal-constructor',name:'constructor',parameter:'constructor',kind:'value',example:'Second literal',fallback:'block'}
  ];
  const result=createDemoEvidence(ticket,event);
  assert.ok(result.screens.length);
  assert.equal(result.screens[0].message,'First literal / Second literal');
  assert.equal(Object.hasOwn(result.contract.parameters,'__proto__'),true);
  assert.equal(result.contract.parameters.__proto__.stringValue,'First literal');
  assert.equal(result.contract.parameters.constructor.stringValue,'Second literal');
});

test('contract recipient and deeplinks follow the selected recipient and active delivery channels',()=>{
  const {ticket,event}=fixture();
  event.recipient='identity';event.linkEnabled={push:true,sms:true};event.links={push:'plata://refunds/123',sms:'plata://refunds/123?channel=sms'};
  const identity=createDemoEvidence(ticket,event);
  assert.match(identity.contract.recipientInfo.goldenUser.identityId.value,uuid);
  assert.equal(Object.hasOwn(identity.contract.recipientInfo.goldenUser,'userId'),false);
  assert.equal(identity.contract.pushMeta.deeplink,event.links.push);
  assert.equal(identity.contract.smsMeta.deeplink,event.links.sms);
  event.recipient='user';event.channel='SMS';
  const user=createDemoEvidence(ticket,event);
  assert.match(user.contract.recipientInfo.goldenUser.userId.value,uuid);
  assert.equal(Object.hasOwn(user.contract.recipientInfo.goldenUser,'identityId'),false);
  assert.equal(Object.hasOwn(user.contract,'pushMeta'),false);
  assert.ok(user.screens.every(screen=>screen.channel==='SMS'));
});

test('missing delivery channels and blocked-only variable branches do not fabricate delivered screenshots',()=>{
  const {ticket,event}=fixture();
  event.channel='';
  assert.deepEqual(createDemoEvidence(ticket,event).screens,[]);
  event.channel='SMS';event.texts.smsMessage='Your account: {{Blocked}}';
  ticket.variables=[{id:'blocked',name:'Blocked',parameter:'Blocked',kind:'variations',example:'unknown',fallback:'block',rows:[{value:'unknown',mode:'Unknown'}]}];
  assert.deepEqual(createDemoEvidence(ticket,event).screens,[]);
});

test('tested seed events carry their own evidence while general-info default rules remain available',()=>{
  const tickets=seedTickets(),tested=tickets.filter(ticket=>['business_review','migration','in_prod_testing','done'].includes(ticket.status));
  assert.ok(tested.length>0);
  for(const ticket of tested)for(const event of ticket.events){
    assert.equal(event.testEvidence.eventId,event.id);
    assert.equal(event.testEvidence.contract.type,event.name);
    assert.ok(event.testEvidence.comment);
  }
  assert.equal(generalDefaults({process:'Transaction OTP',communicationType:'Service'}).ttl,'10 minutes');
  assert.equal(generalDefaults({process:'Origination',communicationType:'Service'}).ttl,'1 day');
});
