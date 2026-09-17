import http from 'node:http';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {createGame,prepareTurn,buildAssessmentRequest,assessTurn,buildRequest,validate,resolveTurn,publicGame} from './game.mjs';

const ROOT=dirname(fileURLToPath(import.meta.url));
const HOST='127.0.0.1',PORT=9442,ORIGIN=`http://${HOST}:${PORT}`;
const RATE=.042/1e6,RESERVE=32000*RATE,CAP=.25;
await mkdir(resolve(ROOT,'.local/runs'),{recursive:true});
await mkdir(resolve(ROOT,'artifacts'),{recursive:true});
let key=process.env.TYPESAFE_API_KEY||'',busy=false,spent=0,attempts=0;
if(!key)try{key=(await readFile(resolve(ROOT,'.local/typesafe-key'),'utf8')).trim();}catch(e){if(e.code!=='ENOENT')throw e;}
try {const old=JSON.parse(await readFile(resolve(ROOT,'.local/spend.json'),'utf8'));spent=old.reservedUsd;attempts=old.attempts;}
catch(e){if(e.code!=='ENOENT')throw e;}
const games=new Map();
async function persist(){await writeFile(resolve(ROOT,'.local/spend.tmp'),JSON.stringify({capUsd:CAP,reservedUsd:spent,attempts}));await rename(resolve(ROOT,'.local/spend.tmp'),resolve(ROOT,'.local/spend.json'));}
await persist();
function json(res,status,value){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));}
async function body(req,max=5000){let size=0;const parts=[];for await(const p of req){size+=p.length;if(size>max)throw new Error('Request too large.');parts.push(p);}return Buffer.concat(parts);}
async function query(request){
  if(spent+RESERVE>CAP)throw new Error('The shared $0.25 testing cap has been reached.');
  if(Buffer.byteLength(JSON.stringify(request))>26000)throw new Error('Conversation too long.');
  spent+=RESERVE;attempts++;await persist();
  const start=performance.now();
  const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(({401:'TypeSafe rejected the key. Reconnect in setup.',402:'TypeSafe reports insufficient credit.',429:'TypeSafe is busy. Wait a moment, then retry.',529:'TypeSafe is temporarily overloaded. Try again.'})[response.status]||`TypeSafe request failed (${response.status}).`);
  const raw=await response.json();const tokens=raw.usage?.input_tokens;
  if(!Number.isInteger(tokens)||tokens<0||tokens>32000)throw new Error('Invalid provider usage. Conservative budget reservation retained.');
  spent-=RESERVE-tokens*RATE;await persist();
  return {raw,request,requestHash:createHash('sha256').update(JSON.stringify(request)).digest('hex'),inputTokens:tokens,costUsd:tokens*RATE,latencyMs:Math.round(performance.now()-start),at:new Date().toISOString()};
}
function current(req){const id=req.headers.cookie?.match(/(?:^|;\s*)crossing=([a-f0-9-]{36})(?:;|$)/)?.[1];const game=games.get(id);if(!game||Date.now()-game.createdAt>4*60*60*1000)throw new Error('Start a new crossing.');return game;}
const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ttf':'font/ttf','.svg':'image/svg+xml','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  try{
    if(req.headers.host!==`${HOST}:${PORT}`)return json(res,403,{error:'Unrecognized host.'});
    const path=new URL(req.url,ORIGIN).pathname;
    if(req.method==='POST'){
      if(req.headers.origin!==ORIGIN)return json(res,403,{error:'Local same-origin requests only.'});
      if(path==='/api/connect'){
        if(busy)return json(res,409,{error:'Wait for the current decision.'});
        const data=JSON.parse((await body(req)).toString());
        if(typeof data.key!=='string'||data.key.length<16||data.key.length>512||/\s/.test(data.key))throw new Error('Enter a valid TypeSafe key.');
        await writeFile(resolve(ROOT,'.local/typesafe-key'),data.key,{mode:0o600});
        key=data.key;return json(res,200,{connected:true});
      }
      if(path==='/api/start'){
        if(busy)return json(res,409,{error:'Wait for the current decision.'});
        const data=JSON.parse((await body(req)).toString());
        for(const [id,g] of games)if(Date.now()-g.createdAt>4*60*60*1000)games.delete(id);
        if(games.size>=32)games.delete(games.keys().next().value);
        const game=createGame(data.mode||'smuggler',randomUUID());games.set(game.id,game);
        res.setHeader('Set-Cookie',`crossing=${game.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=14400`);return json(res,200,publicGame(game));
      }
      if(path==='/api/turn'){
        if(!key)return json(res,401,{error:'Connect TypeSafe in setup before replying.'});
        if(busy)return json(res,409,{error:'A decision is already in progress.'});
        const data=JSON.parse((await body(req)).toString());
        if(busy)return json(res,409,{error:'A decision is already in progress.'});
        const g=prepareTurn(current(req),data);
        if(spent+2*RESERVE>CAP)throw new Error('The shared $0.25 testing cap cannot cover another full reply.');
        busy=true;
        try{
          const assessmentRequest=buildAssessmentRequest(g),assessmentReceipt=await query(assessmentRequest);
          const understood=assessTurn(g,assessmentReceipt.raw,assessmentRequest),request=buildRequest(understood);
          const receipt=await query(request);receipt.assessmentReceipt=assessmentReceipt;
          const next=resolveTurn(understood,validate(receipt.raw,request),receipt);
          await writeFile(resolve(ROOT,'.local/runs',`${next.id}.json`),JSON.stringify(next,null,2));games.set(next.id,next);return json(res,200,publicGame(next));
        }
        finally{busy=false;}
      }
      return json(res,404,{error:'Unknown action.'});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Method not allowed.'});
    if(path==='/api/status')return json(res,200,{connected:!!key,busy,budget:{capUsd:CAP,reservedUsd:spent,attempts}});
    if(path==='/api/game'){try{return json(res,200,publicGame(current(req)));}catch{return json(res,200,null);}}
    let decoded=decodeURIComponent(path);
    if(decoded.includes('..')||decoded.includes('\\')||decoded.includes('\0'))throw new Error('Invalid path.');
    if(decoded==='/')decoded='/index.html';if(decoded==='/design')decoded='/design.html';
    const file=resolve(ROOT,'public',`.${decoded}`),base=resolve(ROOT,'public');
    if(!file.startsWith(base+'\\')&&!file.startsWith(base+'/'))throw new Error('Invalid path.');
    const bytes=await readFile(file);res.writeHead(200,{'content-type':types[extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(req.method==='HEAD'?undefined:bytes);
  }catch(e){json(res,e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Not found.':e.message});}
});
server.on('error',e=>{console.error(`Cannot bind ${ORIGIN}: ${e.code}. No alternate port selected.`);process.exitCode=1;});
server.listen(PORT,HOST,()=>console.log(`Last Exit ready at ${ORIGIN}. Local key persistence enabled. Shared cap $${CAP}.`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{key='';server.close(()=>process.exit(0));});
