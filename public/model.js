export const MAX_EVENTS=10;
export const deliveryChannels=['Push','SMS','Push + SMS','Push or SMS'];
export const communicationTypes=['Service','Marketing'];
export const STATUS={draft:'Draft',text_pending:'Text pending',text_review:'Text review',in_development:'In development',in_testing:'In testing',business_review:'Business review',migration:'Migration',in_prod_testing:'In prod testing',done:'Done',canceled:'Canceled'};
export const products=['CCR','Debit account','Savings','Business account','Personal loan'];
export const processes=['Collection','Precollection','Origination','Operations','Transaction OTP','Authorization OTP','Afterfilling','Utilization','Restructuring offer','Bring a friend','Credit limit increase','Cold promo','Warm promo','Cross-sell','Feature promo','Soft attrition'];
export const dictionaries={
  'Bank name':['CNBV','BBVA','Banamex','Santander','Banorte','HSBC','Scotiabank','Banco Azteca','Inbursa','Bancoppel','Hey Banco','Nu','Banregio','Banco Plata'],
  'Account type':['Cuenta','Ahorro Flexible','Ahorro Fijo','Crédito','Préstamo','Crédito Reestructura','Loan','Cuenta Empresa (entrepreneur)','Cuenta Empresa (company)','Apartado (entrepreneur)','Apartado (company)','Ahorro Empresa Flexible','Ahorro Empresa Fijo'],
  'Transaction type':['Transfer','Payment','Refund','Withdrawal']
};
export const parameters=['Bank name','Amount','Recipient’s name','Account type','Transaction type','Date','Credit limit','Payment due date'];
export const uid=()=>globalThis.crypto?.randomUUID?.()||`id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export function newEvent(){return {id:uid(),name:'',comment:'',recipient:'identity',channel:'',recurring:false,schedule:'',writerNote:'',texts:{pushTitle:'',pushMessage:'',pushTitleEs:'',pushMessageEs:'',smsMessage:'',smsMessageEs:''},links:{push:'',sms:''},linkEnabled:{push:false,sms:false},saved:false};}
export const blankGeneral=()=>({name:'',product:'',process:'',communicationType:'',silentHours:'',ttl:'7 days',comment:''});
export function generalErrors(g){
  const errors=[];
  for(const field of ['name','product','process','communicationType','silentHours','ttl']){
    if(!String(g[field]??'').trim())errors.push({field,message:'Required'});
  }
  if(g.communicationType?.trim()&&!communicationTypes.includes(g.communicationType))errors.push({field:'communicationType',message:'Choose Service or Marketing.'});
  if(g.communicationType==='Marketing'&&g.silentHours==='No silent hours')errors.push({field:'silentHours',message:'Choose silent hours for marketing communications.'});
  return errors;
}
export function generalDefaults({process='',communicationType=''}={}){
  const type=communicationType.trim().toLowerCase(),flow=process.trim().toLowerCase();
  const otp=['transaction otp','authorization otp'].includes(flow);
  return {ttl:otp?'10 minutes':flow==='origination'?'1 day':'7 days',silentHours:type==='marketing'?'8 p.m. – 8 a.m.':type==='service'?'11 p.m. – 6 a.m.':''};
}
export const channelsFor=e=>['Push + SMS','Push or SMS'].includes(e.channel)?['Push','SMS']:['Push','SMS'].includes(e.channel)?[e.channel]:[];
export function eventErrors(e){
  const errors=[];
  if(!e.name.trim())errors.push({tab:'main',field:'name',message:'Add an event name.'});
  if(!deliveryChannels.includes(e.channel))errors.push({tab:'main',field:'channel',message:'Choose Push, SMS, Push + SMS, or Push or SMS.'});
  if(e.recurring&&!e.schedule.trim())errors.push({tab:'main',field:'schedule',message:'Describe how often the event should be sent.'});
  for(const c of channelsFor(e)){
    const key=c.toLowerCase();
    if(c==='Push'&&!e.texts[key+'Title'].trim())errors.push({tab:'texts',field:key+'Title',message:`Add the ${c} title in English.`});
    if(!e.texts[key+'Message'].trim())errors.push({tab:'texts',field:key+'Message',message:`Add the ${c} message in English.`});
  }
  const activeChannels=channelsFor(e).map(c=>c.toLowerCase());
  for(const key of ['push','sms'])if(activeChannels.includes(key)&&e.linkEnabled[key]){
    const value=e.links[key].trim();
    if(!/^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i.test(value))errors.push({tab:'content',field:key+'Link',message:`Enter a valid ${key} deep link, or choose “None / Add later”.`});
  }
  return errors;
}
export function ticketErrors(t){
  const result=[];
  if(!t.events.length)result.push({nav:'general',message:'Add at least one event before sending the ticket.'});
  if(t.communicationType&&!communicationTypes.includes(t.communicationType))result.push({nav:'general',field:'communicationType',message:'Choose Service or Marketing as the communication type.'});
  for(const e of t.events)for(const error of eventErrors(e))result.push({...error,nav:e.id,message:`${e.name||'Untitled event'}: ${error.message}`});
  return result;
}
export function addEvent(t,event=newEvent()){
  if(t.events.length>=MAX_EVENTS)return false;
  t.events.push(event);return event;
}
export function resolveText(text,variables,preview={},lang='en'){
  let blocked=false;
  const value=text.replace(/\{\{([^}]+)\}\}/g,(_,name)=>{
    const v=variables.find(v=>v.name===name);
    if(!v)return '';
    const p=Object.hasOwn(preview,v.id)?preview[v.id]:v.example;
    const fallback=()=>{if(v.fallback==='block')blocked=true;return v.fallback==='default'?(lang==='es'?v.defaultEs:v.defaultEn)||'':'';};
    if(p===undefined||p===null||p==='')return fallback();
    if(v.kind==='variations'){
      const row=v.rows.find(row=>row.value===p);
      if(!row||row.mode==='Unknown')return fallback();
      if(row.mode==='Dictionary')return row.value;
      return (lang==='es'?row.es:row.en)||'';
    }
    return p;
  });return {value,blocked};
}
function evidenceHash(value){
  let hash=2166136261;
  for(const character of String(value)){hash^=character.codePointAt(0);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
function evidenceUuid(value){
  const hex=[0,1,2,3].map(index=>evidenceHash(`${value}:${index}`).toString(16).padStart(8,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function createDemoEvidence(ticket,event,index=0){
  const key=`${ticket.id}:${event.id}:${index}`,hash=evidenceHash(key);
  const activeChannels=channelsFor(event);
  const texts=event.texts||{},variables=ticket.variables||[];
  const usedNames=new Set(activeChannels.flatMap(channel=>['Title','Message'].flatMap(part=>[...String(texts[channel.toLowerCase()+part]||'').matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1]))));
  const used=variables.filter(variable=>usedNames.has(variable.name));
  const people=['Lucía Romero','Diego Salazar','Valentina López','Andrés Morales','Sofía Castillo','Mateo Vargas','Renata Torres','Emiliano Cruz'];
  const examples={Amount:['$1,250.00','$845.50','$320.00','$2,180.00','$675.25','$4,500.00','$98.00','$1,740.50'],'Recipient’s name':people,'Recipient\'s name':people,'Credit limit':['$12,000','$24,500','$18,000','$36,000'],Date:['24 October 2026','25 October 2026','26 October 2026'],'Payment due date':['28 October','30 October','2 November']};
  const overrides=Object.create(null),rawParameters=Object.create(null);
  for(const [position,variable] of used.entries()){
    const parameter=variable.parameter||variable.name;
    let candidates;
    if(variable.kind==='variations')candidates=(variable.rows||[]).filter(row=>row.mode!=='Unknown'&&(row.mode==='Dictionary'||String(row.en||'').trim())).map(row=>String(row.value));
    else candidates=Object.hasOwn(dictionaries,parameter)?dictionaries[parameter]:Object.hasOwn(examples,parameter)?examples[parameter]:[variable.example||''];
    const value=Object.hasOwn(rawParameters,parameter)?rawParameters[parameter]:candidates[(hash+position*17)%Math.max(1,candidates.length)]??'';
    rawParameters[parameter]=String(value);overrides[variable.id]=String(value);
  }
  const testedAt=new Date(Date.UTC(2026,9,23,9)+(hash%480)*60000).toISOString();
  const recipient=evidenceUuid(`${key}:recipient`),recipientKey=event.recipient==='user'?'userId':'identityId';
  const contract={type:event.name,idempotencyKey:evidenceUuid(`${key}:call`),recipientInfo:{goldenUser:{[recipientKey]:{value:recipient}}},parameters:Object.fromEntries(Object.entries(rawParameters).map(([name,value])=>[name,{stringValue:value}]))};
  for(const channel of ['push','sms'])if(activeChannels.some(active=>active.toLowerCase()===channel)&&event.linkEnabled?.[channel]&&event.links?.[channel])contract[channel+'Meta']={deeplink:event.links[channel]};
  const screens=[];
  for(const channel of activeChannels){
    const textKey=channel.toLowerCase(),title=resolveText(String(texts[textKey+'Title']||''),variables,overrides),message=resolveText(String(texts[textKey+'Message']||''),variables,overrides);
    if(title.blocked||message.blocked||!message.value.trim()||/\{\{[^}]+\}\}/.test(title.value+message.value))continue;
    for(const platform of channel==='Push'?['iOS','Android']:['Android']){
      const receivedAt=new Date(Date.parse(testedAt)-5*60000+screens.length*30000).toISOString();
      screens.push({id:evidenceUuid(`${key}:${channel}:${platform}`),label:`${channel} · ${platform}`,platform,channel,title:title.value,message:message.value,receivedAt,parameters:{...rawParameters},recipient});
    }
  }
  const tester=['Camila Navarro','Mateo Ruiz','Valeria Ortega','Sofía Torres'][hash%4];
  const renderedChannels=[...new Set(screens.map(screen=>screen.channel))];
  const samples=Object.entries(rawParameters).slice(0,3).map(([name,value])=>`${name}: ${value||'empty value'}`).join('; ');
  const links=['push','sms'].filter(channel=>contract[channel+'Meta']).map(channel=>`Included the configured ${channel==='push'?'Push':'SMS'} deep link (${contract[channel+'Meta'].deeplink}).`).join(' ');
  const missing=activeChannels.filter(channel=>!renderedChannels.includes(channel));
  const channels=renderedChannels.join(' and '),platforms=[...new Set(screens.map(screen=>screen.platform))].join(' and ');
  const notes=[`${channels} match the approved copy. Text is readable on ${platforms}.`,`${channels} look correct on ${platforms}. Titles and message text match the approved version.`,`Checked ${channels} on ${platforms}. Variable values and line breaks are consistent.`];
  const comment=screens.length?[notes[hash%notes.length],samples?`Checked ${samples}.`:'',used.some(variable=>!overrides[variable.id])?'Empty values are handled by the configured fallback.':'',links,missing.length?`${missing.join(' and ')} still needs a sendable test case before review.`:''].filter(Boolean).join(' '):activeChannels.length?`No sendable ${activeChannels.join(' or ')} test message yet. Add complete text and a supported variable value.`:'No delivery channel selected. Please add a channel before testing.';
  return {demo:true,eventId:event.id,eventName:event.name,tester,testedAt,comment,contract,screens};
}
const demoSpanishCopy={
  'Refund from {{Bank name}}':'Reembolso de {{Bank name}}',
  '{{Amount}} returned {{Account type}}. Transfer to {{Recipient’s name}} failed.':'Se devolvieron {{Amount}} {{Account type}}. La transferencia a {{Recipient’s name}} falló.',
  'recipient’s bank':'el banco del destinatario',
  'The money you sent':'El dinero que enviaste',
  'to your bank account':'a tu cuenta bancaria',
  'to Cuenta':'a Cuenta',
  'to Bolsillo':'a Bolsillo',
  'to CDT':'a CDT'
};
// Upgrade known demo copy without replacing translations or customer-authored text.
export function populateDemoTranslations(ticket){
  if(!['text_review','in_development','in_testing','business_review','migration','in_prod_testing','done','canceled'].includes(ticket.status))return false;
  let changed=false;
  const fill=(target,english,spanish)=>{
    const translation=demoSpanishCopy[target[english]];
    if(!String(target[spanish]??'').trim()&&typeof translation==='string'){
      target[spanish]=translation;changed=true;
    }
  };
  for(const event of ticket.events){
    for(const channel of channelsFor(event)){
      const key=channel.toLowerCase();
      if(channel==='Push')fill(event.texts,key+'Title',key+'TitleEs');
      fill(event.texts,key+'Message',key+'MessageEs');
    }
  }
  for(const variable of ticket.variables){
    fill(variable,'defaultEn','defaultEs');
    for(const row of variable.rows||[])if(row.mode==='Custom text')fill(row,'en','es');
  }
  return changed;
}
export function seedTickets(){
  const names=[
    '2 events for Collection — Agent test','3 events for Delivery — Meeting reminders','1 event for Operations — Transfer refund','2 events for Origination — Application update','1 event for Precollection — Payment reminder','2 events for Savings — Account activation','1 event for Collection — Payment confirmed','3 events for Cards — Delivery updates','1 event for Security — Login verification','2 events for Growth — Credit limit increase','1 event for Operations — Card payment declined','2 events for Collection — Overdue balance','1 event for Business — Document request','2 events for Growth — Referral rewards','1 event for Delivery — Meeting rescheduled','2 events for Origination — Welcome messages'];
  const authors=['Ekaterina Tarasova','Ana Martinez','Sergio Chavez','Laura Sanchez','Diego Ramirez','Carlos Mendoza','Paola Rivera'];
  const statuses=['draft','draft','text_pending','text_review','in_development','in_testing','business_review','migration','in_prod_testing','done','canceled','text_pending','text_review','done','draft','in_development'];
  return names.map((name,i)=>{
    const assignedAt=new Date(Date.now()-i*101*60000).toISOString(),process=i%2?'Origination':'Collection';
    const t={id:uid(),...blankGeneral(),name,product:i%3?'Debit account':'CCR',process,communicationType:'Service',silentHours:generalDefaults({process,communicationType:'Service'}).silentHours,ttl:generalDefaults({process,communicationType:'Service'}).ttl,author:authors[i%authors.length],assignee:'Alejandro Hernández',assignedAt,status:statuses[i],updated:assignedAt,events:[],variables:[]};
    const count=Number(name.match(/^\d/)[0]);
    for(let n=0;n<count;n++)t.events.push({...newEvent(),name:n?'Payment reminder v1 SMS':'Transfer refund v1 Push + SMS',channel:n?'SMS':'Push + SMS',saved:true,texts:{...newEvent().texts,pushTitle:'Refund from {{Bank name}}',pushMessage:'{{Amount}} returned {{Account type}}. Transfer to {{Recipient’s name}} failed.',smsMessage:'{{Amount}} returned {{Account type}}. Transfer to {{Recipient’s name}} failed.'}});
    t.variables=[{id:uid(),name:'Bank name',parameter:'Bank name',kind:'value',example:'CNBV',fallback:'default',defaultEn:'recipient’s bank',defaultEs:'',rows:[]},{id:uid(),name:'Amount',parameter:'Amount',kind:'value',example:'$200',fallback:'default',defaultEn:'The money you sent',defaultEs:'',rows:[]},{id:uid(),name:'Recipient’s name',parameter:'Recipient’s name',kind:'value',example:'Pedro Pascal',fallback:'hide',defaultEn:'',defaultEs:'',rows:[]},{id:uid(),name:'Account type',parameter:'Account type',kind:'variations',example:'Cuenta',fallback:'default',defaultEn:'to your bank account',defaultEs:'',rows:dictionaries['Account type'].map((value,n)=>({value,mode:n<3?'Custom text':n===12?'Unknown':'Dictionary',en:n<3?['to Cuenta','to Bolsillo','to CDT'][n]:value,es:''}))}];
    populateDemoTranslations(t);
    if(['business_review','migration','in_prod_testing','done'].includes(t.status))t.events.forEach((event,index)=>{event.testEvidence=createDemoEvidence(t,event,index);});
    return t;
  });
}
