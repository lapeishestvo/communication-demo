import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_EVENTS,STATUS,newEvent,addEvent,eventErrors,ticketErrors,resolveText,seedTickets,channelsFor,deliveryChannels,createDemoEvidence} from './public/model.js';

test('adding and duplicating events cannot exceed the ticket limit',()=>{
  const ticket={events:[]};
  for(let index=0;index<MAX_EVENTS;index++)assert.ok(addEvent(ticket));
  assert.equal(addEvent(ticket),false);
  assert.equal(addEvent(ticket,structuredClone(ticket.events[0])),false);
  assert.equal(ticket.events.length,10);
  ticket.events.pop();
  assert.ok(addEvent(ticket));
});

test('changing channel ignores deep links belonging to the previous channel',()=>{
  const event=newEvent();
  Object.assign(event,{name:'Payment reminder',channel:'SMS'});
  event.texts.smsMessage='Your payment is due tomorrow.';
  event.linkEnabled.push=true;
  assert.deepEqual(eventErrors(event),[]);
  event.linkEnabled.sms=true;
  assert.ok(eventErrors(event).some(error=>error.field==='smsLink'));
  event.links.sms='plata://payments';
  assert.deepEqual(eventErrors(event),[]);
  event.channel='Push';
  event.texts.pushTitle='Payment reminder';
  event.texts.pushMessage='Your payment is due tomorrow.';
  event.links.push='plata://payments';
  event.links.sms='';
  assert.deepEqual(eventErrors(event),[]);
});

test('channels outside MVP are inactive and cannot pass event validation',()=>{
  for(const channel of ['Email','WhatsApp']){
    const event={...newEvent(),name:'Legacy event',channel};
    event.texts.emailTitle='Old email';event.texts.emailMessage='Keep this legacy copy';
    event.texts.whatsappMessage='Keep this legacy copy too';
    event.linkEnabled={push:true,sms:true};
    assert.deepEqual(channelsFor(event),[]);
    assert.equal(eventErrors(event).some(error=>error.field==='channel'),true);
    assert.equal(eventErrors(event).some(error=>error.field==='pushLink'||error.field==='smsLink'),false);
    assert.equal(event.texts.emailMessage,'Keep this legacy copy');
    assert.equal(event.texts.whatsappMessage,'Keep this legacy copy too');
  }
});

test('submission reports empty tickets and incomplete events across tabs',()=>{
  assert.equal(ticketErrors({events:[]})[0].nav,'general');
  const event=newEvent();
  event.name='Payment reminder';
  event.channel='Push + SMS';
  event.texts.pushTitle='Payment reminder';
  event.texts.pushMessage='Your payment is due tomorrow.';
  assert.ok(ticketErrors({events:[event]}).some(error=>error.field==='smsMessage'&&error.nav===event.id));
  event.texts.smsMessage='Your payment is due tomorrow.';
  assert.deepEqual(ticketErrors({events:[event]}),[]);
});

test('Push or SMS remains distinct from Push + SMS and validates both channel copies',()=>{
  assert.deepEqual(deliveryChannels,['Push','SMS','Push + SMS','Push or SMS']);
  const event={...newEvent(),name:'Payment reminder',channel:'Push or SMS'};
  assert.deepEqual(channelsFor(event),['Push','SMS']);
  assert.deepEqual(eventErrors(event).map(error=>error.field),['pushTitle','pushMessage','smsMessage']);
  event.texts.pushTitle='Payment reminder';
  event.texts.pushMessage='Your payment is due tomorrow.';
  event.texts.smsMessage='Your payment is due tomorrow.';
  assert.deepEqual(ticketErrors({events:[event],communicationType:'Service'}),[]);
  assert.equal(event.channel,'Push or SMS');
  event.channel='Push + SMS';
  assert.deepEqual(channelsFor(event),['Push','SMS']);
  assert.deepEqual(eventErrors(event),[]);
});

test('Push or SMS validates both active links and generates evidence for both channels',()=>{
  const event={...newEvent(),id:'fallback-event',name:'Payment reminder',channel:'Push or SMS'};
  Object.assign(event.texts,{pushTitle:'Payment reminder',pushMessage:'Your payment is due tomorrow.',smsMessage:'Your payment is due tomorrow.'});
  event.linkEnabled={push:true,sms:true};
  assert.deepEqual(eventErrors(event).map(error=>error.field),['pushLink','smsLink']);
  event.links={push:'plata://payments',sms:'https://bancoplata.mx/payments'};
  assert.deepEqual(eventErrors(event),[]);
  const evidence=createDemoEvidence({id:'fallback-ticket',variables:[]},event);
  assert.deepEqual([...new Set(evidence.screens.map(screen=>screen.channel))],['Push','SMS']);
  assert.equal(evidence.contract.pushMeta.deeplink,event.links.push);
  assert.equal(evidence.contract.smsMeta.deeplink,event.links.sms);
});

test('preview distinguishes missing values, unknown values and blocking fallbacks',()=>{
  const variable={id:'bank',name:'Bank',kind:'variations',example:'BBVA',fallback:'default',defaultEn:'your bank',rows:[{value:'BBVA',mode:'Custom text',en:'BBVA bank',es:'banco BBVA'}]};
  assert.deepEqual(resolveText('From {{Bank}}',[variable]),{value:'From BBVA bank',blocked:false});
  assert.deepEqual(resolveText('From {{Bank}}',[variable],{bank:'Unknown'}),{value:'From your bank',blocked:false});
  variable.fallback='block';
  assert.deepEqual(resolveText('From {{Bank}}',[variable],{bank:''}),{value:'From ',blocked:true});
});

test('demo records cover every requested status and are valid for submission',()=>{
  const tickets=seedTickets();
  assert.deepEqual(new Set(tickets.map(ticket=>ticket.status)),new Set(Object.keys(STATUS)));
  for(const ticket of tickets){
    assert.ok(ticket.name&&ticket.author&&Number.isFinite(Date.parse(ticket.updated)));
    assert.equal(ticketErrors(ticket).length,0);
  }
});
