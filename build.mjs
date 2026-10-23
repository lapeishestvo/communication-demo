import {cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot=path.dirname(fileURLToPath(import.meta.url));
const publicRoot=path.join(projectRoot,'public');
const outputRoot=path.join(projectRoot,'dist');
const mimeTypes={'.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
const embeddedAssets=new Map();
async function embedAsset(filename){
  if(!embeddedAssets.has(filename)){
    const mime=mimeTypes[path.extname(filename)];
    if(!mime)throw new Error(`Unsupported standalone asset: ${filename}`);
    const data=await readFile(path.join(publicRoot,'assets',filename));
    if(!data.length)throw new Error(`Empty standalone asset: ${filename}`);
    embeddedAssets.set(filename,`data:${mime};base64,${data.toString('base64')}`);
  }
  return embeddedAssets.get(filename);
}

const [template,css,model,app]=await Promise.all(
  ['index.html','styles.css','model.js','app.js'].map(filename=>readFile(path.join(publicRoot,filename),'utf8'))
);
const cssAssets=[...css.matchAll(/url\(\s*(['"]?)\.\/assets\/([^)'"\s]+)\1\s*\)/g)];
let embeddedCss=css;
const robotoLicense=await readFile(path.join(publicRoot,'assets','roboto-OFL.txt'),'utf8');
embeddedCss=`/* Roboto font license\n${robotoLicense}\n*/\n${embeddedCss}`;
for(const match of cssAssets){
  embeddedCss=embeddedCss.replaceAll(match[0],`url('${await embedAsset(match[2])}')`);
}

const assetDeclaration=app.match(/const assets=\{[^\n]+\};/);
if(!assetDeclaration)throw new Error('Cannot locate the application asset map.');
let embeddedDeclaration=assetDeclaration[0];
for(const match of assetDeclaration[0].matchAll(/(['"])([^'"\n]+\.(?:svg|png|woff2|ttf))\1/g)){
  embeddedDeclaration=embeddedDeclaration.replaceAll(match[0],JSON.stringify(await embedAsset(match[2])));
}
const embeddedApp=app
  .replace(assetDeclaration[0],embeddedDeclaration)
  .replaceAll('./assets/${assets','${assets')
  .replace(/^import[^\n]*from\s+['"]\.\/model\.js['"];?\s*\n/,'');
const script=`${model.replace(/^export\s+/gm,'')}\n${embeddedApp}`.replace(/<\/script/gi,'<\\/script');
const standalone=template
  .replace(/<link\s+rel="stylesheet"\s+href="\.\/styles\.css"\s*\/>/,()=>`<style>${embeddedCss}</style>`)
  .replace(/<script\s+type="module"\s+src="\.\/app\.js"><\/script>/,()=>`<script type="module">${script}</script>`);
if(/(?:src|href)=["'](?:\.\/|https?:\/\/|\/\/)/.test(standalone)||/url\(\s*['"]?(?:\.\/|https?:\/\/|\/\/)/.test(standalone)||/^import\s/m.test(script)){
  throw new Error('A relative or external dependency remains in the standalone demo.');
}

await mkdir(outputRoot,{recursive:true});
await cp(publicRoot,outputRoot,{recursive:true});
await writeFile(path.join(outputRoot,'communication-demo.html'),standalone);
await writeFile(path.join(projectRoot,'index.html'),standalone);
console.log('Static site ready in dist/; root index.html is ready for GitHub Pages.');
