import {channelsFor,dictionaries,resolveText} from './model.js';

export const PREVIEW_EMPTY='__preview_empty__';

export function previewVariables(e,variables){
  const channels=channelsFor(e).map(channel=>channel.toLowerCase());
  const names=new Set(Object.entries(e.texts||{})
    .filter(([key])=>channels.some(channel=>['Title','Message','TitleEs','MessageEs'].some(part=>key===channel+part)))
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

export function previewVersionValues(e,variables,overrides={},lang='en'){
  const suffix=lang==='es'?'Es':'';
  const texts=channelsFor(e).flatMap(channel=>{
    const key=channel.toLowerCase();
    return [e.texts?.[key+'Title'+suffix]||'',e.texts?.[key+'Message'+suffix]||''];
  });
  const names=new Set(texts.flatMap(text=>[...String(text).matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1])));
  return variables.filter(variable=>{
    const known=variable.kind==='variations'?variable.rows:dictionaries[variable.parameter];
    return names.has(variable.name)&&known?.length;
  }).map(variable=>{
    const value=Object.hasOwn(overrides,variable.id)?overrides[variable.id]:variable.example;
    return {name:variable.name,value:value===undefined||value===null||value===''||value===PREVIEW_EMPTY?'Empty value':String(value)};
  });
}

// Enumerate known values; arbitrary input fields retain their current examples.
export function previewVersions(e,variables,preview={},lang='en'){
  const suffix=lang==='es'?'Es':'';
  const texts=channelsFor(e).flatMap(channel=>{
    const key=channel.toLowerCase();
    return [e.texts?.[key+'Title'+suffix]||'',e.texts?.[key+'Message'+suffix]||''];
  });
  const names=new Set(texts.flatMap(text=>[...String(text).matchAll(/\{\{([^}]+)\}\}/g)].map(match=>match[1])));
  let versions=[{...preview}];
  for(const variable of variables.filter(variable=>names.has(variable.name))){
    const known=variable.kind==='variations'?(variable.rows||[]).map(row=>row.value):dictionaries[variable.parameter];
    const current=Object.hasOwn(preview,variable.id)?preview[variable.id]:variable.example??'';
    const candidates=known?[...new Set([...known,current,''])]:[current];
    const values=[],seen=new Set();
    for(const value of candidates){
      const result=resolveText(`{{${variable.name}}}`,[variable],{[variable.id]:value},lang);
      if(result.blocked||seen.has(result.value))continue;
      seen.add(result.value);values.push(value);
    }
    versions=versions.flatMap(version=>values.map(value=>({...version,[variable.id]:value})));
    if(!versions.length)return [];
  }
  const seen=new Set();
  return versions.filter(version=>{
    const resolved=texts.map(text=>resolveText(text,variables,version,lang));
    if(resolved.some(text=>text.blocked))return false;
    const key=JSON.stringify(resolved.map(text=>text.value));
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}
