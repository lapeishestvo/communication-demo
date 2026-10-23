import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
const port=Number(process.env.PORT||4173);
const serve=async(req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    const data=await readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
  }catch {res.writeHead(404);res.end('Not found');}
};
for(const host of process.env.COMMUNICATION_DEMO_HOST?[process.env.COMMUNICATION_DEMO_HOST]:['127.0.0.1','::1']){
  http.createServer(serve).on('error',error=>{
    if(host==='::1'&&['EAFNOSUPPORT','EADDRNOTAVAIL'].includes(error.code))return;
    throw error;
  }).listen(port,host,()=>console.log(`Local: http://${host==='::1'?'[::1]':host}:${port}`));
}
