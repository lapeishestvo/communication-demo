export const MAX_EVENTS=10;
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
export function newEvent(){return {id:uid(),name:'',comment:'',recipient:'identity',channel:'',recurring:false,schedule:'',writerNote:'',texts:{pushTitle:'',pushMessage:'',pushTitleEs:'',pushMessageEs:'',smsMessage:'',smsMessageEs:'',emailTitle:'',emailMessage:'',emailTitleEs:'',emailMessageEs:'',whatsappMessage:'',whatsappMessageEs:''},links:{push:'',sms:''},linkEnabled:{push:false,sms:false},saved:false};}
export const blankGeneral=()=>({name:'',product:'',process:'',communicationType:'',silentHours:'',ttl:'',comment:''});
export const channelsFor=e=>e.channel==='Push + SMS'?['Push','SMS']:e.channel?[e.channel]:[];
export function eventErrors(e){
  const errors=[];
  if(!e.name.trim())errors.push({tab:'main',field:'name',message:'Add an event name.'});
  if(!e.channel)errors.push({tab:'main',field:'channel',message:'Choose a delivery channel.'});
  if(e.recurring&&!e.schedule.trim())errors.push({tab:'main',field:'schedule',message:'Describe how often the event should be sent.'});
  for(const c of channelsFor(e)){
    const key=c.toLowerCase();
    if(['Push','Email'].includes(c)&&!e.texts[key+'Title'].trim())errors.push({tab:'texts',field:key+'Title',message:`Add the ${c} title in English.`});
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
export function seedTickets(){
  const names=[
    '2 events for Collection — Agent test','3 events for Delivery — Meeting reminders','1 event for Operations — Transfer refund','2 events for Origination — Application update','1 event for Precollection — Payment reminder','2 events for Savings — Account activation','1 event for Collection — Payment confirmed','3 events for Cards — Delivery updates','1 event for Security — Login verification','2 events for Growth — Credit limit increase','1 event for Operations — Card payment declined','2 events for Collection — Overdue balance','1 event for Business — Document request','2 events for Growth — Referral rewards','1 event for Delivery — Meeting rescheduled','2 events for Origination — Welcome messages'];
  const authors=['Ekaterina Tarasova','Ana Martinez','Sergio Chavez','Laura Sanchez','Diego Ramirez','Carlos Mendoza','Paola Rivera'];
  const statuses=['draft','draft','text_pending','text_review','in_development','in_testing','business_review','migration','in_prod_testing','done','canceled','text_pending','text_review','done','draft','in_development'];
  return names.map((name,i)=>{
    const t={id:uid(),...blankGeneral(),name,product:i%3?'Debit account':'CCR',process:i%2?'Origination':'Collection',communicationType:'Service',silentHours:'9 p.m. – 8 a.m.',ttl:'1 day',author:authors[i%authors.length],status:statuses[i],updated:new Date(Date.now()-i*101*60000).toISOString(),events:[],variables:[]};
    const count=Number(name.match(/^\d/)[0]);
    for(let n=0;n<count;n++)t.events.push({...newEvent(),name:n?'Payment reminder v1 SMS':'Transfer refund v1 Push + SMS',channel:n?'SMS':'Push + SMS',saved:true,texts:{...newEvent().texts,pushTitle:'Refund from {{Bank name}}',pushMessage:'{{Amount}} returned {{Account type}}. Transfer to {{Recipient’s name}} failed.',smsMessage:'{{Amount}} returned {{Account type}}. Transfer to {{Recipient’s name}} failed.'}});
    t.variables=[{id:uid(),name:'Bank name',parameter:'Bank name',kind:'value',example:'CNBV',fallback:'default',defaultEn:'recipient’s bank',defaultEs:'',rows:[]},{id:uid(),name:'Amount',parameter:'Amount',kind:'value',example:'$200',fallback:'default',defaultEn:'The money you sent',defaultEs:'',rows:[]},{id:uid(),name:'Recipient’s name',parameter:'Recipient’s name',kind:'value',example:'Pedro Pascal',fallback:'hide',defaultEn:'',defaultEs:'',rows:[]},{id:uid(),name:'Account type',parameter:'Account type',kind:'variations',example:'Cuenta',fallback:'default',defaultEn:'to your bank account',defaultEs:'',rows:dictionaries['Account type'].map((value,n)=>({value,mode:n<3?'Custom text':n===12?'Unknown':'Dictionary',en:n<3?['to Cuenta','to Bolsillo','to CDT'][n]:value,es:''}))}];
    return t;
  });
}
