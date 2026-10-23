import {channelsFor,dictionaries} from './model.js';

export const PREVIEW_EMPTY='__preview_empty__';

export function previewVariables(e,variables){
  const channels=channelsFor(e).map(channel=>channel.toLowerCase());
  const names=new Set(Object.entries(e.texts||{})
    .filter(([key])=>channels.some(channel=>key.startsWith(channel)))
    .flatMap(([,text])=>[...String(text).matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1])));
  return variables.filter(variable=>names.has(variable.name));
}

export function previewControlsHtml(e,variables,preview,{field}){
  const used=previewVariables(e,variables);
  if(!used.length)return '';
  const controls=used.map(variable=>{
    const value=Object.hasOwn(preview,variable.id)?preview[variable.id]:variable.example??'';
    const values=variable.kind==='variations'
      ?(variable.rows||[]).map(row=>row.value)
      :dictionaries[variable.parameter];
    if(values?.length){
      const options=[...new Set(values)].map(item=>({value:item,label:item}));
      options.push({value:PREVIEW_EMPTY,label:'Empty value'});
      return field(variable.name,variable.id,value===''?PREVIEW_EMPTY:value,{scope:'preview',choices:options});
    }
    return field(variable.name,variable.id,value,{scope:'preview'});
  });
  return `<div class="preview-controls">${controls.join('')}</div>`;
}
