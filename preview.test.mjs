import test from 'node:test';
import assert from 'node:assert/strict';
import {previewVariables,previewControlsHtml,PREVIEW_EMPTY} from './public/preview.js';
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
