import {MAX_EVENTS,STATUS,products,processes,dictionaries,parameters,uid,newEvent,blankGeneral,channelsFor,eventErrors,ticketErrors,addEvent,resolveText,seedTickets} from './model.js';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assets={close:'figma-close.svg',chevron:'figma-chevron.svg',plus:'figma-plus.svg',add:'figma-add.svg',back:'figma-back.svg',next:'figma-next.svg',prev:'figma-prev.svg',pagePrev:'figma-pagePrev.svg',pagePrevActive:'figma-pagePrevActive.svg',pushDot:'figma-pushDot.svg',pageNext:'figma-pageNext.svg',copy:'figma-copy.svg',trash:'figma-trash.svg',pencil:'figma-pencil.svg',us:'figma-us.svg',mx:'figma-mx.svg',plata:'figma-plata.svg',avatar:'cfedcdf1-70fc-4684-af8d-e6e5b209b1a5.png',notification:'ac829d79-88f9-4db6-b4c3-6b10a2260c6a.png'};
const icon=name=>`<img class="icon" src="./assets/${assets[name]}" alt="" />`;
const btn=(label,action,cls='',extra='')=>`<button type="button" class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const iconBtn=(name,action,label,extra='')=>`<button type="button" class="icon-button" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}" ${extra}>${icon(name)}</button>`;
const badge=s=>`<span class="badge ${esc(s)}">${esc(STATUS[s]||s)}</span>`;
const STORAGE='communication-tickets-v1';
let tickets;
try{const parsed=JSON.parse(localStorage.getItem(STORAGE));tickets=Array.isArray(parsed)&&parsed.length&&parsed.every(t=>t.id&&t.name&&Array.isArray(t.events)&&Array.isArray(t.variables)&&STATUS[t.status])?parsed:seedTickets();}catch{tickets=seedTickets();}
let state={ticketId:null,nav:'general',tab:'main',page:1,pageSize:14,sort:'updated',direction:-1,errors:[],preview:{},lang:'en'};
let modal=null,lastFocus=null,storageWarned=false,mention=null,mentionRange=null,dropdownMenu=null,validationFrame=null;
const ticket=()=>tickets.find(t=>t.id===state.ticketId);
const event=()=>ticket()?.events.find(e=>e.id===state.nav);
const editable=()=>ticket()?.status==='draft';
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(tickets));}catch{if(!storageWarned){storageWarned=true;toast('Browser storage is unavailable. Keep this tab open to retain your changes.');}}}
function touch(){if(ticket()){ticket().updated=new Date().toISOString();persist();}}
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3400);}
function field(label,key,value='',options={}){
  const {choices,hint,required=false,disabled=false,textarea=false,scope='event',type='text',flag}=options;
  const attrs=`name="${esc(key)}" data-field="${esc(key)}" data-scope="${scope}" ${required?'required':''} ${disabled?'disabled':''} aria-label="${esc(label)}"`;
  const control=choices?selectControl(label,`${scope}-${key}`,value,choices,attrs,{required,disabled}):`<label class="field ${value?'filled':''} ${textarea?'multiline':''} ${flag?'with-flag':''}"><span>${esc(label)}</span>${textarea?`<textarea ${attrs} rows="3">${esc(value)}</textarea>`:`<input ${attrs} type="${type}" value="${esc(value)}" autocomplete="off" />`}${flag?`<span class="field-flag">${icon(flag)}</span>`:''}</label>`;
  return `<div class="field-wrap" data-wrap="${esc(key)}">${control}${hint?`<p class="hint">${esc(hint)}</p>`:''}</div>`;
}
function selectControl(label,id,value,items,attrs='',{compact=false,disabled=false,required=false}={}){
  const options=items.map(item=>typeof item==='string'?{value:item,label:item}:item);
  if(value&&!options.some(item=>String(item.value)===String(value)))options.unshift({value,label:value});
  const selected=options.find(item=>String(item.value)===String(value));
  return `<div class="field select-control ${value?'filled':''} ${compact?'select-compact':''}">${compact?'':`<span aria-hidden="true">${esc(label)}</span>`}<select class="select-native" tabindex="-1" aria-hidden="true" ${attrs} ${disabled?'disabled':''}><option value="" ${value?'':'selected'} disabled>${esc(label)}</option>${options.map(item=>`<option value="${esc(item.value)}" ${String(value)===String(item.value)?'selected':''}>${esc(item.label)}</option>`).join('')}</select><button type="button" class="select-trigger" role="combobox" aria-label="${esc(label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="dropdown-${esc(id)}" ${required?'aria-required="true"':''} ${disabled?'disabled':''} data-action="toggle-dropdown" data-dropdown-id="${esc(id)}"><span class="select-value">${selected?esc(selected.label):'&nbsp;'}</span>${icon('chevron')}</button></div>`;
}
function closeDropdown(restoreFocus=false){
  if(!dropdownMenu)return;
  const {trigger,element}=dropdownMenu;
  trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-activedescendant');element.remove();dropdownMenu=null;
  if(restoreFocus&&trigger.isConnected)trigger.focus();
}
function openDropdown(trigger){
  if(dropdownMenu?.trigger===trigger){closeDropdown();return;}
  closeDropdown();closeMention();
  const select=trigger.closest('.select-control').querySelector('select');if(select.disabled)return;
  const options=[...select.options].filter(option=>!option.disabled);
  if(!options.length)return;
  const element=document.createElement('div');element.id=trigger.getAttribute('aria-controls');element.className='dropdown-menu';element.setAttribute('role','listbox');element.setAttribute('aria-label',trigger.getAttribute('aria-label'));
  element.innerHTML=options.map((option,index)=>`<div role="option" id="${element.id}-${index}" aria-selected="${option.selected}" data-action="select-dropdown-option" data-option-index="${index}" class="dropdown-option">${esc(option.textContent)}</div>`).join('');
  document.body.append(element);
  dropdownMenu={trigger,select,element,options,index:Math.max(0,options.findIndex(option=>option.selected)),search:'',searchAt:0};
  trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-activedescendant',element.children[dropdownMenu.index].id);
  const rect=trigger.getBoundingClientRect(),below=window.innerHeight-rect.bottom-20,above=rect.top-20;
  const desired=Math.min(360,options.length*52+4),up=below<Math.min(desired,160)&&above>below;
  const height=Math.min(desired,Math.max(48,up?above:below));
  element.style.width=Math.min(rect.width,window.innerWidth-24)+'px';element.style.left=Math.max(12,Math.min(rect.left,window.innerWidth-rect.width-12))+'px';element.style.maxHeight=height+'px';element.style.top=(up?rect.top-8-height:rect.bottom+8)+'px';
  trigger.focus();
}
function highlightDropdown(index){
  if(!dropdownMenu)return;
  dropdownMenu.index=(index+dropdownMenu.options.length)%dropdownMenu.options.length;
  [...dropdownMenu.element.children].forEach((option,i)=>option.classList.toggle('keyboard-active',i===dropdownMenu.index));
  const active=dropdownMenu.element.children[dropdownMenu.index];dropdownMenu.trigger.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});
}
function chooseDropdown(index){
  if(!dropdownMenu)return;
  const {select,trigger,options}=dropdownMenu,option=options[index];if(!option)return;
  const id=trigger.dataset.dropdownId;
  select.value=option.value;trigger.querySelector('.select-value').textContent=option.textContent;select.closest('.field').classList.toggle('filled',!!select.value);
  closeDropdown(true);select.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector(`[data-dropdown-id="${CSS.escape(id)}"]`)?.focus();
}
function choices(label,key,value,items,scope='event',vertical=false){return `<fieldset class="radio-section"><legend class="sr-only">${esc(label)}</legend><div class="radio-group ${vertical?'vertical':''}">${items.map(([val,text])=>`<label><input type="radio" name="${key}" value="${val}" data-field="${key}" data-scope="${scope}" ${String(value)===String(val)?'checked':''} ${scope==='event'&&!editable()?'disabled':''} /><span>${esc(text)}</span></label>`).join('')}</div></fieldset>`;}
function openTicket(id){state.ticketId=id;state.nav='general';state.tab='main';state.errors=[];state.preview={};state.lang='en';location.hash=`ticket/${id}`;render();}
function back(){state.ticketId=null;state.errors=[];history.replaceState(null,'',location.pathname+location.search);render();}
function render(){closeDropdown();closeMention();if(state.ticketId&&!ticket()){back();return;}$('#app').innerHTML=state.ticketId?editorView():tableView();if(state.ticketId)updatePreview();}
function tableView(){
  const sorted=[...tickets].sort((a,b)=>String(a[state.sort]).localeCompare(String(b[state.sort]))*state.direction);
  const pages=Math.max(1,Math.ceil(sorted.length/state.pageSize));state.page=Math.min(state.page,pages);
  const start=(state.page-1)*state.pageSize;
  return `<section class="table-page"><div class="page-heading"><h1>Event tickets</h1>${btn(icon('plus')+'New ticket','new-ticket','primary small')}</div><div class="table-card"><div class="table-scroll"><table><thead><tr>${[['name','Name'],['author','Author'],['status','Status'],['updated','Last updated']].map(([key,label])=>`<th scope="col" aria-sort="${state.sort===key?(state.direction===1?'ascending':'descending'):'none'}"><button data-action="sort" data-key="${key}">${label}</button></th>`).join('')}</tr></thead><tbody>${sorted.slice(start,start+state.pageSize).map(t=>`<tr><td><button class="ticket-link" data-action="open-ticket" data-id="${t.id}">${esc(t.name)}</button></td><td>${esc(t.author)}</td><td>${badge(t.status)}</td><td><time datetime="${t.updated}">${formatDate(t.updated)}</time></td></tr>`).join('')}</tbody></table></div><footer class="pagination"><div>${btn(icon(state.page===1?'pagePrev':'pagePrevActive'),'page-prev','page-button','aria-label="Previous page" '+(state.page===1?'disabled':''))}${Array.from({length:pages},(_,n)=>btn(String(n+1),'page','page-button '+(state.page===n+1?'selected':''),`data-page="${n+1}" aria-label="Page ${n+1}"`)).join('')}${btn(icon('pageNext'),'page-next','page-button','aria-label="Next page" '+(state.page===pages?'disabled':''))}</div></footer></div></section>`;
}
function formatDate(date){return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(date));}
function editorView(){const t=ticket();return `<section class="editor-page"><div class="ticket-heading">${btn(icon('back'),'back','back-button','aria-label="Back to tickets"')}<h1>${esc(t.name)}</h1>${badge(t.status)}<div class="heading-end">${editable()?btn('Send ticket','send','send-button'):''}</div></div><div class="editor-layout"><aside class="sidebar" aria-label="Ticket navigation"><nav>${navButton('general','General info')}${t.variables.length?navButton('values','Values'):''}${t.events.map((e,i)=>navButton(e.id,`Event ${i+1}`,i)).join('')}${editable()?btn(icon('add')+'Add event','add-event','nav-add',t.events.length>=MAX_EVENTS?'disabled title="Maximum 10 events per ticket"':''):''}</nav></aside><div class="workspace">${state.errors.length?`<div class="error-summary" role="alert"><strong>Complete the ticket before sending</strong>${state.errors.map((err,i)=>`<button data-action="go-error" data-index="${i}">${esc(err.message)}</button>`).join('')}</div>`:''}${state.nav==='general'?generalView():state.nav==='values'?valuesView():eventView()}</div></div></section>`;}
function navButton(id,label,index){const e=ticket().events.find(e=>e.id===id);return `<button class="nav-item ${state.nav===id?'active':''}" data-action="nav" data-nav="${id}" title="${esc(label)}" ${state.nav===id?'aria-current="page"':''}><span>${esc(label)}</span></button>`;}
function generalView(){const t=ticket();return `<div class="general-card"><h2>General info</h2><dl>${[['Name',t.name],['Product',t.product],['Process',t.process],['Communication type',t.communicationType],['Silent hours',t.silentHours],['TTL',t.ttl],...(t.comment?[['Comment',t.comment]]:[])].map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)||'—'}</dd></div>`).join('')}</dl>${editable()?`<div class="general-footer">${btn(icon('pencil')+'Edit','edit-general')}</div>`:''}</div>`;}
function valuesView(){return `<div class="values-card"><div class="section-title"><h2>Values</h2>${editable()?btn(icon('add')+'Add value','add-value','small'):''}</div><div class="values-list">${ticket().variables.map(v=>`<button class="value-row" data-action="edit-value" data-id="${v.id}"><span><strong>${esc(v.name)}</strong></span>${icon('pencil')}</button>`).join('')}</div></div>`;}
function eventView(){const e=event();if(!e){state.nav='general';return generalView();}const index=ticket().events.indexOf(e);return `<section class="event-workspace"><div class="event-card"><div class="section-title"><h2>Event ${index+1}</h2><div class="event-tools">${editable()?iconBtn('copy','duplicate','Duplicate event',ticket().events.length>=MAX_EVENTS?'disabled':'')+iconBtn('trash','delete-event','Delete event'):''}</div></div><div class="event-columns"><div class="event-form"><div class="tabs" role="tablist">${[['main','Main info'],['texts','Texts'],['content','Content']].map(([key,label])=>`<button role="tab" aria-selected="${state.tab===key}" data-action="tab" data-tab="${key}" class="${state.tab===key?'active':''}">${label}</button>`).join('')}</div><div class="form-scroll" role="tabpanel">${state.tab==='main'?mainInfoView(e):state.tab==='texts'?textsView(e):contentView(e)}</div></div><aside class="preview"><div class="preview-title"><h3>Preview</h3></div><div id="preview-content"></div></aside></div></div>${editable()?`<footer class="event-footer"><div class="event-footer-left">${state.tab==='main'?'':btn(icon('prev'),'previous','square','aria-label="Previous step"')}${btn('Save event','save-event','save-event')}</div>${btn(`Next ${icon('next')}`,'next','primary next-button')}</footer>`:''}</section>`;}
function mainInfoView(e){const ro=!editable();return `<div class="fieldset">${field('Name','name',e.name,{disabled:ro,hint:'Recommended format: [purpose] [version number] [channel]'})}${field('Comment','comment',e.comment,{disabled:ro})}<h3>Recipient selection</h3>${choices('Recipient selection','recipient',e.recipient,[['identity','By identity ID'],['user','By user ID']])}<h3>Delivery</h3>${field('Channel','channel',e.channel,{disabled:ro,choices:['Push','SMS','Push + SMS','Email','WhatsApp']})}${choices('Frequency','recurring',e.recurring,[['false','Send one time'],['true','Recurring event']])}${e.recurring?field('How many times and how often','schedule',e.schedule,{disabled:ro}):''}</div>`;}
function richField(label,key,value){return `<div class="field-wrap rich-wrap" data-wrap="${key}"><div class="field rich-field ${value?'filled':''}"><label id="label-${key}">${esc(label)}</label><div class="rich-input" contenteditable="${editable()}" role="textbox" aria-labelledby="label-${key}" aria-multiline="true" data-rich="${key}">${richHtml(value)}</div><span class="flag">${icon(key.endsWith('Es')?'mx':'us')}</span></div>${editable()?`<button class="insert-value" data-action="insert-value" data-target="${key}" title="Insert value (@)" aria-label="Insert a value into ${esc(label)}">@</button>`:''}</div>`;}
function tokenHtml(name){return `<span class="token" contenteditable="false" role="button" tabindex="0" data-action="edit-token" data-token="${esc(name)}" aria-label="${editable()?'Edit':'View'} ${esc(name)}">${esc(name)}</span>`;}
function richHtml(value){return String(value??'').split(/(\{\{[^}]+\}\})/g).map(part=>{const match=part.match(/^\{\{([^}]+)\}\}$/);return match?tokenHtml(match[1]):esc(part);}).join('').replace(/\n/g,'<br>');}
function editToken(token){
  const value=ticket()?.variables.find(v=>v.name===token.dataset.token);if(!value)return;
  const rich=token.closest('[data-rich]');
  token.focus();closeMention();newVariable(value.kind,null,value.id);
  if(rich)modal.tokenOrigin={key:rich.dataset.rich,index:[...rich.querySelectorAll('[data-token]')].indexOf(token)};
}
function readRich(el){let value='';for(const child of el.childNodes){if(child.nodeType===Node.TEXT_NODE)value+=child.textContent;else if(child.dataset?.token)value+=`{{${child.dataset.token}}}`;else if(child.nodeName==='BR')value+='\n';else value+=readRich(child)+(child.nodeName==='DIV'?'\n':'');}return value.replace(/\u200b/g,'').replace(/\n$/,'');}
function textsView(e){const channels=channelsFor(e);return `<div class="fieldset">${field('Any details that help UX-writer with the text','writerNote',e.writerNote,{disabled:!editable()})}${channels.map(c=>{const key=c.toLowerCase();return `<h3>${c}</h3>${['Push','Email'].includes(c)?richField('Title in English',key+'Title',e.texts[key+'Title']):''}${richField('Message in English',key+'Message',e.texts[key+'Message'])}${['Push','Email'].includes(c)?richField('Title in Spanish (optional)',key+'TitleEs',e.texts[key+'TitleEs']):''}${richField('Message in Spanish (optional)',key+'MessageEs',e.texts[key+'MessageEs'])}`;}).join('')}</div>`;}
function contentView(e){const supported=channelsFor(e).filter(c=>['Push','SMS'].includes(c));return `<div class="fieldset">${supported.map(c=>{const key=c.toLowerCase();return `<h3 class="first-heading">Deep link for ${c==='SMS'?'SMS':'push'}</h3>${choices('Deep link for '+key,'linkEnabled.'+key,e.linkEnabled[key],[['false','None / Add later'],['true','Add deep link']])}${e.linkEnabled[key]?field('Deep link',key+'Link',e.links[key],{disabled:!editable()}) :''}`;}).join('')}</div>`;}
function updatePreview(){
  const e=event(),target=$('#preview-content');if(!e||!target)return;
  const vars=ticket().variables,channels=channelsFor(e);
  if(!channels.length){target.innerHTML='<p class="preview-empty">Choose the channel to see the preview</p>';return;}
  let blocked=false;
  const resolve=text=>{const result=resolveText(text,vars,state.preview,state.lang);blocked ||=result.blocked;return esc(result.value);};
  const suffix=state.lang==='es'?'Es':'';
  const previews=channels.map(channel=>{
    const key=channel.toLowerCase(),title=resolve(e.texts[key+'Title'+suffix]||''),body=resolve(e.texts[key+'Message'+suffix]||'');
    if(channel==='Push')return `<div class="push-card"><div class="push-brand">${icon('plata')}<span class="push-app-meta"><span>Plata</span>${icon('pushDot')}<span>now</span></span></div><strong class="${title?'':'placeholder'}">${title||'No title'}</strong><p class="${body?'':'placeholder'}">${body||'No message'}</p></div>`;
    if(channel==='SMS')return `<div class="sms-card"><div class="sms-avatar"><img src="./assets/${assets.avatar}" alt="" /><img class="message-icon" src="./assets/${assets.notification}" alt="" /></div><div><div class="sms-brand"><strong>Banco Plata</strong><small>now</small></div><p class="${body?'':'placeholder'}">${body||'No message'}</p></div></div>`;
    return `<div class="message-card"><small>${channel} · Banco Plata</small>${title?`<strong>${title}</strong>`:''}<p class="${body?'':'placeholder'}">${body||'No message'}</p></div>`;
  }).join('');
  target.innerHTML=`<div class="message-previews">${blocked?'':previews}</div>`;
}
function generalFields(g){return `${field('Name','name',g.name,{scope:'general',required:true,hint:'Recommended format: N events for [team] – [short description]'})}${field('Product','product',g.product,{scope:'general',required:true,choices:products})}${field('Process','process',g.process,{scope:'general',required:true,choices:processes})}${field('Communication type','communicationType',g.communicationType,{scope:'general',required:true,choices:['Service','Marketing','Transactional','OTP']})}<div class="field-pair">${field('Silent hours','silentHours',g.silentHours,{scope:'general',required:true,choices:['11 p.m. – 6 a.m.','8 p.m. – 8 a.m.','No silent hours']})}${field('TTL','ttl',g.ttl,{scope:'general',required:true,choices:['1 hour','6 hours','12 hours','1 day','2 days','3 days','7 days']})}</div>${field('Comment','comment',g.comment,{scope:'general'})}`;}
function openModal(data){closeDropdown();lastFocus=document.activeElement;modal=data;renderModal();requestAnimationFrame(()=>($('#overlay input:not(:disabled), #overlay .select-trigger:not(:disabled)')||$('#overlay button'))?.focus());}
function closeModal(){closeDropdown();modal=null;$('#overlay').innerHTML='';document.body.classList.remove('modal-open');$('#app').inert=false;$('.app-header').inert=false;lastFocus?.focus();}
function renderModal(){if(!modal)return;closeDropdown();const active=document.activeElement;let focusSelector='';if($('#overlay').contains(active)){
    if(active.dataset.dropdownId)focusSelector=`[data-dropdown-id="${CSS.escape(active.dataset.dropdownId)}"]`;
    else if(active.dataset.field)focusSelector=`[data-field="${CSS.escape(active.dataset.field)}"]${active.type==='radio'?`[value="${CSS.escape(active.value)}"]`:''}`;
    else if(active.dataset.row)focusSelector=`[data-row="${active.dataset.row}"][data-column="${active.dataset.column}"]`;
    else if(active.dataset.action)focusSelector=`[data-action="${active.dataset.action}"]${active.dataset.tab?`[data-tab="${active.dataset.tab}"]`:''}`;
  }const isGeneral=modal.type==='general',isDelete=modal.type==='delete',isDrawer=modal.type==='variable',entering=isDrawer&&!$('#overlay').querySelector('.drawer');document.body.classList.add('modal-open');$('#app').inert=true;$('.app-header').inert=true;let title,content,footer;
  if(isGeneral){title=modal.edit?'Edit general info':'New ticket';content=`<form id="general-form" class="modal-fields">${generalFields(modal.data)}</form>`;footer=btn('Cancel','close-modal')+`<button type="submit" form="general-form" class="button primary">${modal.edit?'Save':'Create'}</button>`;}
  else if(isDelete){title='Delete event?';content=`<div class="modal-fields"><p>“${esc(event()?.name||'Untitled event')}” will be removed from this ticket.</p></div>`;footer=btn('Cancel','close-modal')+btn('Delete','confirm-delete','danger');}
  else {title=modal.data.kind==='variations'?'Text variations':'Value';content=variableView();footer=btn('Cancel','close-modal')+btn(modal.editId?'Save':'Create','save-variable','primary',!editable()?'disabled':'');}
  $('#overlay').innerHTML=`<div class="modal-backdrop ${isDrawer?'drawer-backdrop':''}"><section class="modal ${isDrawer?'drawer':''} ${entering?'drawer-enter':''} ${!isGeneral&&!isDelete&&modal.data.kind==='variations'?'wide':''} ${!isGeneral&&!isDelete?'variable-modal':''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2>${iconBtn('close','close-modal','Close dialog')}</div>${content}<div class="modal-footer">${footer}</div></section></div>`;
  if(focusSelector)($('#overlay').querySelector(focusSelector)||$('#overlay button'))?.focus();
}
function newVariable(kind='value',target=null,editId=null){const found=ticket().variables.find(v=>v.id===editId);let data=found?structuredClone(found):{id:uid(),kind,name:'',parameter:'',example:'',source:'default',fallback:'default',defaultEn:'',defaultEs:'',rows:[]};data.source ||=parameters.includes(data.parameter)?'default':'new';openModal({type:'variable',data,target,editId,tab:'value'});}
function variableView(){const v=modal.data;return `${v.kind==='variations'?`<div class="tabs modal-tabs" role="tablist">${[['value','Value'],['variations','Text variations'],['unknown','Unknown value']].map(([key,label])=>`<button class="${modal.tab===key?'active':''}" data-action="variable-tab" data-tab="${key}" role="tab" aria-selected="${modal.tab===key}">${label}</button>`).join('')}</div>`:''}<div class="modal-fields variable-fields">${modal.tab==='value'?`${v.kind==='variations'?field('Variable name','name',v.name,{scope:'variable'})+'<h3>Parameter on which text depends on</h3>':''}${choices('Parameter source','source',v.source,[['default','Choose default parameter'],['new','Create new']],'variable')}${field(v.kind==='variations'?'Parameter':'Value','parameter',v.parameter,{scope:'variable',choices:v.source==='default'?parameters:undefined})}${v.source==='new'&&v.kind==='value'?field('Variable name','name',v.name,{scope:'variable'}):''}${v.parameter&&dictionaries[v.parameter]&&v.kind==='value'?`<details class="dictionary-details"><summary>${dictionaries[v.parameter].length} variants <span>Show variants</span></summary>${dictionaries[v.parameter].map((p,i)=>`<p><small>${i+1}</small>${esc(p)}</p>`).join('')}</details>`:''}${v.parameter&&!dictionaries[v.parameter]?field('Example for the preview','example',v.example,{scope:'variable'}):''}${v.kind==='value'?fallbackView(v,'If parameter is empty'):''}`:modal.tab==='variations'?variationsView(v):fallbackView(v,'If value is not in the list')}${modal.error?`<p class="error-text" role="alert">${esc(modal.error)}</p>`:''}</div>`;}
function fallbackView(v,label){return `<h3>${label}</h3>${choices(label,'fallback',v.fallback,[['default','Use default value'],['hide','Hide text'],['block','Don’t send the event']],'variable',v.kind==='value')}${v.fallback==='default'?`<div class="${v.kind==='variations'?'field-pair':'fallback-fields'}">${field('Text in English','defaultEn',v.defaultEn,{scope:'variable',flag:'us'})}${field('Text in Spanish (optional)','defaultEs',v.defaultEs,{scope:'variable',flag:'mx'})}</div>`:''}`;}
function variationsView(v){return `<div class="variations-table"><div class="variation-head"><span>Value</span><span></span><span>English</span><span>Spanish</span></div>${v.rows.map((row,i)=>`<div class="variation-row"><span class="variation-label"><small>${i+1}</small>${esc(row.value)}</span>${selectControl('Treatment for '+row.value,'row-'+i,row.mode,['Custom text','Dictionary','Unknown'],`data-row="${i}" data-column="mode"`,{compact:true,disabled:!editable()})}${row.mode==='Unknown'?'<span class="tertiary">—</span><span class="tertiary">—</span>':row.mode==='Dictionary'?`<span>${esc(row.value)}</span><span>${esc(row.value)}</span>`:`<input data-row="${i}" data-column="en" aria-label="English text for ${esc(row.value)}" value="${esc(row.en)}" /><input data-row="${i}" data-column="es" aria-label="Spanish text for ${esc(row.value)}" value="${esc(row.es)}" />`}</div>`).join('')}</div>${v.source==='new'?`<div class="add-variation">${field('New value','newRow',modal.newRow||'',{scope:'modal'})}${btn('Add value','add-variation','small')}</div>`:''}`;}
function openMention(el,atTyped=false){closeMention();mention={el,key:el.dataset.rich,atTyped};const selection=window.getSelection();mentionRange=selection.rangeCount?selection.getRangeAt(0).cloneRange():null;const pop=document.createElement('div');pop.className='mention-menu';pop.id='mention-menu';pop.setAttribute('role','dialog');pop.setAttribute('aria-label','Insert value');pop.innerHTML=`${ticket().variables.map(v=>`<div class="mention-row"><button data-action="choose-value" data-id="${v.id}">${esc(v.name)}</button>${iconBtn('pencil','edit-mentioned-value','Edit '+v.name,`data-id="${v.id}"`)}</div>`).join('')}<div class="menu-caption">Create new</div><button class="mention-create" data-action="create-value"><span>Value</span><small>Insert a bank name, transaction type, etc.</small></button><button class="mention-create" data-action="create-variations"><span>Text variations</span><small>Write different text for each value</small></button>`;document.body.append(pop);const r=el.getBoundingClientRect();pop.style.left=Math.max(12,Math.min(r.left+100,window.innerWidth-pop.offsetWidth-12))+'px';pop.style.top=Math.min(r.bottom+4,window.innerHeight-pop.offsetHeight-12)+'px';}
function closeMention(){document.getElementById('mention-menu')?.remove();}
function insertVariable(v,target=mention?.key){const el=document.querySelector(`[data-rich="${target}"]`);if(!el)return;el.focus();let range=mentionRange;if(!range||!el.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(el);range.collapse(false);}
  if(mention?.atTyped&&range.startContainer.nodeType===Node.TEXT_NODE&&range.startOffset>0){range.setStart(range.startContainer,range.startOffset-1);range.deleteContents();}
  const token=document.createElement('span');token.className='token';token.contentEditable='false';token.dataset.token=v.name;token.dataset.action='edit-token';token.setAttribute('role','button');token.tabIndex=0;token.setAttribute('aria-label','Edit '+v.name);token.textContent=v.name;range.insertNode(token);const space=document.createTextNode('\u200b');token.after(space);range.setStartAfter(space);range.collapse(true);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);event().texts[target]=readRich(el);el.closest('.field').classList.add('filled');event().saved=false;touch();updatePreview();closeMention();mention=null;mentionRange=null;}
function showErrors(errors){state.errors=errors;render();}
function saveCurrent(advance=false){const e=event();const errors=eventErrors(e);const relevant=advance?errors.filter(x=>x.tab===state.tab):errors;if(relevant.length){state.errors=relevant.map(x=>({...x,nav:e.id}));render();toast('Complete the required fields.');return false;}
  state.errors=[];
  if(advance&&state.tab!=='content'){state.tab=state.tab==='main'?'texts':'content';touch();render();return true;}
  if(errors.length){showErrors(errors.map(x=>({...x,nav:e.id})));return false;}
  e.saved=true;touch();if(advance)state.nav='general';render();toast('Event saved');return true;
}
function sendTicket(){const t=ticket();if(!editable())return;const errors=ticketErrors(t);if(errors.length){state.errors=errors;render();toast('Complete all events before sending.');return;}t.events.forEach(e=>e.saved=true);t.status='text_pending';touch();const sorted=[...tickets].sort((a,b)=>String(a[state.sort]).localeCompare(String(b[state.sort]))*state.direction);state.page=Math.floor(sorted.findIndex(item=>item.id===t.id)/state.pageSize)+1;back();toast('Ticket sent · Text pending');}

document.addEventListener('click',e=>{
  const trigger=e.target.closest('[data-action]');if(!trigger||trigger.disabled)return;const a=trigger.dataset.action;
  if(a==='edit-token')editToken(trigger);
  else if(a==='toggle-dropdown')openDropdown(trigger);
  else if(a==='select-dropdown-option')chooseDropdown(Number(trigger.dataset.optionIndex));
  else if(a==='new-ticket')openModal({type:'general',data:blankGeneral(),edit:false});
  else if(a==='edit-general'&&editable())openModal({type:'general',data:Object.fromEntries(Object.keys(blankGeneral()).map(k=>[k,ticket()[k]])),edit:true});
  else if(a==='open-ticket')openTicket(trigger.dataset.id);
  else if(a==='back')back();
  else if(a==='sort'){if(state.sort===trigger.dataset.key)state.direction*=-1;else{state.sort=trigger.dataset.key;state.direction=1;}render();}
  else if(a==='page-prev'){state.page--;render();}
  else if(a==='page-next'){state.page++;render();}
  else if(a==='page'){state.page=Number(trigger.dataset.page);render();}
  else if(a==='nav'){state.nav=trigger.dataset.nav;state.tab='main';render();}
  else if(a==='tab'){state.tab=trigger.dataset.tab;render();}
  else if(a==='add-event'&&editable()){const item=addEvent(ticket());if(!item){toast('Maximum 10 events per ticket.');return;}state.nav=item.id;state.tab='main';state.errors=[];touch();render();}
  else if(a==='duplicate'&&editable()){const source=event();const copy=structuredClone(source);copy.id=uid();copy.name=copy.name?copy.name+' (copy)':'';copy.saved=false;if(!addEvent(ticket(),copy)){toast('Maximum 10 events per ticket.');return;}state.nav=copy.id;state.tab='main';state.errors=[];touch();render();toast('Event duplicated');}
  else if(a==='delete-event'&&editable())openModal({type:'delete'});
  else if(a==='confirm-delete'&&editable()){const t=ticket();t.events=t.events.filter(x=>x.id!==state.nav);state.nav='general';state.errors=[];closeModal();touch();render();toast('Event deleted');}
  else if(a==='close-modal')closeModal();
  else if(a==='save-event')saveCurrent();
  else if(a==='next')saveCurrent(true);
  else if(a==='previous'){state.tab=state.tab==='content'?'texts':'main';render();}
  else if(a==='send')sendTicket();
  else if(a==='go-error'){const error=state.errors[Number(trigger.dataset.index)];state.nav=error.nav;state.tab=error.tab||'main';render();document.querySelector(`[data-wrap="${error.field}"] input, [data-wrap="${error.field}"] .select-trigger, [data-rich="${error.field}"]`)?.focus();}
  else if(a==='insert-value'){const el=document.querySelector(`[data-rich="${trigger.dataset.target}"]`);el.focus();const range=document.createRange();range.selectNodeContents(el);range.collapse(false);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);openMention(el);}
  else if(a==='choose-value')insertVariable(ticket().variables.find(v=>v.id===trigger.dataset.id));
  else if(a==='create-value'||a==='create-variations'){const target=mention?.key;closeMention();newVariable(a==='create-value'?'value':'variations',target);}
  else if(a==='add-value'&&editable())newVariable();
  else if(a==='edit-value')newVariable('value',null,trigger.dataset.id);
  else if(a==='edit-mentioned-value'){const target=mention?.key;closeMention();newVariable('value',target,trigger.dataset.id);}
  else if(a==='variable-tab'){modal.tab=trigger.dataset.tab;modal.error='';renderModal();}
  else if(a==='add-variation'){const value=(modal.newRow||'').trim();if(!value)return;if(modal.data.rows.some(r=>r.value===value)){toast('This value already exists.');return;}modal.data.rows.push({value,mode:'Custom text',en:'',es:''});modal.newRow='';renderModal();}
  else if(a==='save-variable'&&editable())saveVariable();
});
function saveVariable(){if(!editable())return;const v=modal.data;v.parameter=v.parameter.trim();v.name=(v.name||v.parameter).trim();if(!v.name||!v.parameter){modal.error='Enter a name and choose a parameter.';renderModal();return;}
  if(/[{}@]/.test(v.name)){modal.error='Use a name without @ or braces.';renderModal();return;}
  if(ticket().variables.some(x=>x.name.toLowerCase()===v.name.toLowerCase()&&x.id!==modal.editId)){modal.error='A value with this name already exists.';renderModal();return;}
  if(v.kind==='variations'&&!v.rows.length){modal.error='Add at least one text variation.';modal.tab='variations';renderModal();return;}
  if(v.kind==='variations'&&v.rows.some(r=>r.mode==='Custom text'&&!r.en.trim())){modal.error='Add English text for every custom text variation.';modal.tab='variations';renderModal();return;}
  if(v.fallback==='default'&&!v.defaultEn.trim()){modal.error='Add a default text in English, or choose another fallback.';modal.tab=v.kind==='variations'?'unknown':'value';renderModal();return;}
  const old=ticket().variables.find(x=>x.id===modal.editId);if(old){for(const item of ticket().events)for(const key of Object.keys(item.texts))item.texts[key]=item.texts[key].split(`{{${old.name}}}`).join(`{{${v.name}}}`);ticket().variables=ticket().variables.map(x=>x.id===old.id?structuredClone(v):x);}else ticket().variables.push(structuredClone(v));
  const target=modal.target,origin=modal.tokenOrigin;closeModal();touch();if(target){if(old)render();insertVariable(v,target);}else render();if(origin)document.querySelector(`[data-rich="${CSS.escape(origin.key)}"]`)?.querySelectorAll('[data-token]')[origin.index]?.focus();toast('Value saved');
}
document.addEventListener('submit',e=>{if(e.target.id!=='general-form')return;e.preventDefault();const g=modal.data;if(Object.entries(g).some(([k,v])=>k!=='comment'&&!v.trim())){toast('Complete all required fields.');return;}if(modal.edit){Object.assign(ticket(),g);touch();closeModal();render();}else{const t={id:uid(),...g,author:'Ekaterina Tarasova',status:'draft',updated:new Date().toISOString(),events:[],variables:[]};tickets.unshift(t);persist();closeModal();openTicket(t.id);toast('Draft created');}});
function handleField(el){const key=el.dataset.field,scope=el.dataset.scope;if(!key)return;const value=el.value;const control=el.closest('.field');control?.classList.toggle('filled',!!value);control?.classList.remove('is-invalid');el.removeAttribute('aria-invalid');control?.querySelector('.select-trigger')?.removeAttribute('aria-invalid');
  if(scope==='general'){modal.data[key]=value;return;}
  if(scope==='modal'){modal[key]=value;return;}
  if(scope==='variable'){
    const v=modal.data;v[key]=value;modal.error='';
    if(key==='source'){v.parameter='';v.rows=[];renderModal();}
    else if(key==='parameter'&&el.tagName==='SELECT'){
      if(!modal.editId)v.name=value;v.example=dictionaries[value]?.[0]||({'Amount':'$200','Recipient’s name':'Pedro Pascal','Credit limit':'$10,000','Date':'23 October','Payment due date':'30 October'}[value]||'');
      v.rows=(dictionaries[value]||[]).map(x=>({value:x,mode:'Dictionary',en:x,es:x}));renderModal();
    }else if(key==='fallback')renderModal();return;
  }
  if(scope==='preview'){state.preview[key]=value;updatePreview(true);return;}
  if(scope==='event'&&editable()){const ev=event();if(key==='recurring')ev.recurring=value==='true';else if(key.startsWith('linkEnabled.'))ev.linkEnabled[key.split('.')[1]]=value==='true';else if(key.endsWith('Link'))ev.links[key.replace('Link','')]=value;else ev[key]=value;ev.saved=false;touch();if(['channel','recurring','linkEnabled.push','linkEnabled.sms'].includes(key))render();updatePreview();}
}
document.addEventListener('input',e=>{
  const el=e.target;
  if(el.matches('[data-rich]')&&editable()){event().texts[el.dataset.rich]=readRich(el);event().saved=false;el.closest('.field').classList.toggle('filled',!!event().texts[el.dataset.rich]);touch();updatePreview();if(e.data==='@')openMention(el,true);else closeMention();}
  else if(el.matches('input[data-field],textarea[data-field]'))handleField(el);
  else if(el.matches('input[data-row]'))modal.data.rows[Number(el.dataset.row)][el.dataset.column]=el.value;
});
document.addEventListener('change',e=>{const el=e.target;if(el.matches('select[data-field],input[type="radio"][data-field]'))handleField(el);else if(el.matches('select[data-row]')){modal.data.rows[Number(el.dataset.row)].mode=el.value;renderModal();}});
document.addEventListener('invalid',e=>{
  if(!e.target.closest('#general-form'))return;
  e.preventDefault();const field=e.target.closest('.field'),control=field?.querySelector('.select-trigger')||e.target;
  field?.classList.add('is-invalid');control.setAttribute('aria-invalid','true');
  if(validationFrame===null)validationFrame=requestAnimationFrame(()=>{validationFrame=null;$('#general-form [aria-invalid="true"]')?.focus();toast('Complete all required fields.');});
},true);
document.addEventListener('paste',e=>{if(!e.target.matches('[data-rich]'))return;e.preventDefault();const text=e.clipboardData.getData('text/plain');const sel=window.getSelection();if(!sel.rangeCount)return;const range=sel.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);sel.removeAllRanges();sel.addRange(range);e.target.dispatchEvent(new InputEvent('input',{bubbles:true}));});
document.addEventListener('pointerdown',e=>{const token=e.target.closest('.token[data-action="edit-token"]');if(token){e.preventDefault();token.focus();closeMention();return;}if(e.target.closest('#mention-menu, .dropdown-menu'))e.preventDefault();else if(!e.target.closest('.rich-wrap'))closeMention();});
document.addEventListener('click',e=>{if(dropdownMenu&&!e.target.closest('.select-control, .dropdown-menu'))closeDropdown();if(e.target.classList.contains('modal-backdrop'))closeModal();});
document.addEventListener('scroll',e=>{if(dropdownMenu&&!dropdownMenu.element.contains(e.target))closeDropdown();const menu=document.getElementById('mention-menu');if(menu&&!menu.contains(e.target))closeMention();},true);
window.addEventListener('resize',()=>{closeDropdown();closeMention();});
document.addEventListener('keydown',e=>{
  const token=e.target.closest?.('.token[data-action="edit-token"]');if(token&&(e.key==='Enter'||e.key===' ')){e.preventDefault();editToken(token);return;}
  const selectTrigger=e.target.closest?.('.select-trigger');
  if(dropdownMenu){
    if(e.key==='Escape'){e.preventDefault();closeDropdown(true);return;}
    if(e.key==='Tab')closeDropdown();
    else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();highlightDropdown(dropdownMenu.index+(e.key==='ArrowDown'?1:-1));return;}
    else if(e.key==='Home'||e.key==='End'){e.preventDefault();highlightDropdown(e.key==='Home'?0:dropdownMenu.options.length-1);return;}
    else if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseDropdown(dropdownMenu.index);return;}
    else if(e.key.length===1&&!e.metaKey&&!e.ctrlKey&&!e.altKey){e.preventDefault();const now=Date.now();dropdownMenu.search=(now-dropdownMenu.searchAt<700?dropdownMenu.search:'')+e.key.toLowerCase();dropdownMenu.searchAt=now;const index=dropdownMenu.options.findIndex(option=>option.textContent.toLowerCase().startsWith(dropdownMenu.search));if(index>=0)highlightDropdown(index);return;}
  }else if(selectTrigger&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();openDropdown(selectTrigger);if(dropdownMenu)highlightDropdown(e.key==='ArrowUp'||e.key==='End'?dropdownMenu.options.length-1:0);return;}
  if(e.key==='Escape'){if(document.getElementById('mention-menu'))closeMention();else if(modal)closeModal();}
  if(e.key==='Tab'&&modal){const focusable=[...document.querySelectorAll('.modal button:not(:disabled), .modal input:not(:disabled), .modal textarea:not(:disabled), .modal summary')];const first=focusable[0],last=focusable.at(-1);if(!$('.modal').contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first)?.focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
});
window.addEventListener('hashchange',()=>{const id=location.hash.match(/^#ticket\/(.+)$/)?.[1];if(id&&tickets.some(t=>t.id===id)){if(state.ticketId!==id)openTicket(id);}else if(state.ticketId)back();});
const initial=location.hash.match(/^#ticket\/(.+)$/)?.[1];if(initial&&tickets.some(t=>t.id===initial))state.ticketId=initial;persist();render();
