import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_EVENTS,STATUS,newEvent,addEvent,eventErrors,ticketErrors,resolveText,seedTickets} from './public/model.js';

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
  event.channel='Email';
  event.texts.emailTitle='Payment reminder';
  event.texts.emailMessage='Your payment is due tomorrow.';
  event.links.sms='';
  assert.deepEqual(eventErrors(event),[]);
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
