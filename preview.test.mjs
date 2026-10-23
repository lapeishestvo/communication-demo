import test from 'node:test';
import assert from 'node:assert/strict';
import {previewVariables,previewControlsHtml,previewVersions,previewVersionValues,PREVIEW_EMPTY} from './public/preview.js';
import {newEvent,seedTickets,resolveText} from './public/model.js';

test('preview controls include only variables referenced by active delivery channels',()=>{
  const ticket=seedTickets()[0],event={...newEvent(),channel:'SMS',texts:{smsMessage:'Hi {{Amount}}',emailMessage:'{{Bank name}}'}};
  assert.deepEqual(previewVariables(event,ticket.variables).map(value=>value.name),['Amount']);
});

test('preview choices preserve ticket definitions and expose empty-value fallbacks',()=>{
  const ticket=seedTickets()[0],event=ticket.events[0],before=JSON.stringify(ticket),calls=[];
  previewControlsHtml(event,ticket.variables,{}, {field:(label,key,value,options)=>{calls.push({label,key,value,options});return label;}});
  const bank=calls.find(call=>call.label==='Bank name');
  assert.equal(bank.value,'CNBV');
  assert.ok(bank.options.choices.some(option=>option.value==='BBVA'));
  assert.ok(bank.options.choices.some(option=>option.value===PREVIEW_EMPTY));
  const override={[bank.key]:''};
  assert.equal(resolveText('{{Bank name}}',ticket.variables,override).value,'recipient’s bank');
  assert.equal(JSON.stringify(ticket),before);
});

const variation=(id,rows,extra={})=>({id,name:id,parameter:id,kind:'variations',example:rows[0]?.value||'',fallback:'block',rows,...extra});
const custom=(value,en,es='')=>({value,mode:'Custom text',en,es});
const sms=text=>({...newEvent(),channel:'SMS',texts:{smsMessage:text}});

test('all versions contains every combination of the known text branches',()=>{
  const event=sms('{{account}} / {{operation}}');
  const variables=[variation('account',[custom('checking','Cuenta'),custom('savings','Savings')]),variation('operation',[custom('debit','debited'),custom('credit','credited')])];
  const versions=previewVersions(event,variables);
  assert.deepEqual(versions.map(values=>resolveText(event.texts.smsMessage,variables,values).value),['Cuenta / debited','Cuenta / credited','Savings / debited','Savings / credited']);
});

test('identical custom, dictionary and fallback results produce one rendered version',()=>{
  const variable=variation('account',[custom('a','Same text'),custom('b','Same text'),{value:'unknown',mode:'Unknown'}],{fallback:'default',defaultEn:'Same text'});
  assert.equal(previewVersions(sms('{{account}}'),[variable]).length,1);
});

test('empty and unknown branches are included when sendable and blocked branches are omitted',()=>{
  const variable=variation('account',[custom('a','Cuenta'),{value:'unknown',mode:'Unknown'}],{fallback:'default',defaultEn:'your account'});
  const event=sms('Returned to {{account}}');
  const rendered=values=>resolveText(event.texts.smsMessage,[variable],values).value;
  assert.deepEqual(previewVersions(event,[variable]).map(rendered),['Returned to Cuenta','Returned to your account']);
  variable.fallback='hide';
  assert.deepEqual(previewVersions(event,[variable]).map(rendered),['Returned to Cuenta','Returned to ']);
  variable.fallback='block';
  assert.deepEqual(previewVersions(event,[variable]).map(rendered),['Returned to Cuenta']);
});

test('only active channels and the selected language contribute branches',()=>{
  const event={...newEvent(),channel:'SMS',texts:{smsMessage:'{{english}}',smsMessageEs:'{{spanish}}',emailMessage:'{{email}}'}};
  const variables=[variation('english',[custom('a','English A'),custom('b','English B')]),variation('spanish',[custom('a','Ignored','Spanish A'),custom('b','Ignored','Spanish B'),custom('c','Ignored','Spanish C')]),variation('email',[custom('a','Email A'),custom('b','Email B')])];
  const english=previewVersions(event,variables,{},'en'),spanish=previewVersions(event,variables,{},'es');
  assert.equal(english.length,2);assert.equal(spanish.length,3);
  assert.ok(english.every(values=>!Object.hasOwn(values,'spanish')&&!Object.hasOwn(values,'email')));
  assert.ok(spanish.every(values=>!Object.hasOwn(values,'english')&&!Object.hasOwn(values,'email')));
});

test('free text stays at its current value and enumeration does not mutate ticket definitions or overrides',()=>{
  const ticket=seedTickets()[0],event=ticket.events[0];
  const amount=ticket.variables.find(value=>value.name==='Amount'),recipient=ticket.variables.find(value=>value.name==='Recipient’s name');
  const preview={[amount.id]:'$987',[recipient.id]:'Camila'};
  const before=JSON.stringify({ticket,preview});
  const versions=previewVersions(event,ticket.variables,preview);
  assert.ok(versions.length>1);
  assert.ok(versions.every(values=>values[amount.id]==='$987'&&values[recipient.id]==='Camila'));
  assert.equal(JSON.stringify({ticket,preview}),before);
});

test('a selected dictionary value outside the known list remains represented',()=>{
  const variable={id:'bank',name:'bank',parameter:'Bank name',kind:'value',example:'CNBV',fallback:'block'};
  const versions=previewVersions(sms('{{bank}}'),[variable],{bank:'New Bank'});
  assert.ok(versions.some(values=>values.bank==='New Bank'));
  assert.ok(versions.some(values=>values.bank==='CNBV'));
});

test('version labels show raw selected values instead of the custom message phrases',()=>{
  const ticket=seedTickets()[0],event=ticket.events[0];
  const bank=ticket.variables.find(variable=>variable.name==='Bank name');
  const account=ticket.variables.find(variable=>variable.name==='Account type');
  assert.deepEqual(previewVersionValues(event,ticket.variables,{[bank.id]:'BBVA',[account.id]:'Cuenta'}),[
    {name:'Bank name',value:'BBVA'},
    {name:'Account type',value:'Cuenta'}
  ]);
  assert.equal(resolveText('{{Account type}}',ticket.variables,{[account.id]:'Cuenta'}).value,'to Cuenta');
});

test('version labels identify empty input even when a fallback renders visible text',()=>{
  const variable=variation('account',[custom('checking','to Cuenta')],{fallback:'default',defaultEn:'to your account'});
  const event=sms('{{account}}');
  for(const value of ['',null,undefined,PREVIEW_EMPTY]){
    assert.deepEqual(previewVersionValues(event,[variable],{account:value}),[{name:'account',value:'Empty value'}]);
  }
  assert.equal(resolveText(event.texts.smsMessage,[variable],{account:''}).value,'to your account');
});

test('version labels include only enumerated variables used by the active channel and language',()=>{
  const event={...newEvent(),channel:'Push + SMS',texts:{pushTitle:'{{english}}',smsMessage:'{{english}}',pushTitleEs:'{{spanish}}',smsMessageEs:'{{spanish}}',emailMessage:'{{email}}'}};
  const variables=[variation('english',[custom('en','English')]),variation('spanish',[custom('es','Ignored','Spanish')]),variation('email',[custom('mail','Email')])];
  assert.deepEqual(previewVersionValues(event,variables),[{name:'english',value:'en'}]);
  assert.deepEqual(previewVersionValues(event,variables,{},'es'),[{name:'spanish',value:'es'}]);
});

test('version labels retain current examples without changing inputs and omit free text fields',()=>{
  const ticket=seedTickets()[0],event=ticket.events[0];
  const bank=ticket.variables.find(variable=>variable.name==='Bank name');
  const overrides={[bank.id]:'New Bank'};
  const before=JSON.stringify({ticket,overrides});
  const labels=previewVersionValues(event,ticket.variables,overrides);
  assert.deepEqual(labels,[{name:'Bank name',value:'New Bank'},{name:'Account type',value:'Cuenta'}]);
  assert.equal(JSON.stringify({ticket,overrides}),before);
  assert.deepEqual(previewVersionValues(sms('{{Amount}}'),ticket.variables),[]);
  assert.deepEqual(previewVersionValues(sms('No variables'),ticket.variables),[]);
});
