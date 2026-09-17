import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cases,replyFor} from './stress-cases.mjs';
const base='http://127.0.0.1:9442',root=new URL('../',import.meta.url),folder=new URL('artifacts/stress-100/',root);
const sha=s=>createHash('sha256').update(s).digest('hex');
async function status(){return fetch(base+'/api/status').then(r=>r.json());}
const initial=await status();if(!initial.connected||initial.busy)throw new Error('Connect Jev and finish the active request first.');
const engineHash=sha(await readFile(new URL('game.mjs',root))),fixtureHash=sha(await readFile(new URL('scripts/stress-cases.mjs',root)));
const plan={startedAt:new Date().toISOString(),engine:'checkpoint-v3',engineHash,fixtureHash,batchCapUsd:.12,baseline:initial.budget,method:'50 authored scenario variants, each repeated twice. Ten equal strategy groups, five variants each. Sequential public-API playthroughs. No tuning or retries. Existing server-wide $0.25 cap remains in force.',cases:cases()};
await mkdir(folder,{recursive:true});
// Exclusive creation prevents silently overwriting a prior batch or mixing runs.
await writeFile(new URL('plan.json',folder),JSON.stringify(plan,null,2),{flag:'wx'});
const results=[];let stop=null;
for(const item of plan.cases){
  const run={...item,startedAt:new Date().toISOString(),turns:[],error:null};
  try{
    const s=await status();if(s.budget.reservedUsd-initial.budget.reservedUsd+.002688>.12){stop='batch budget';break;}
    const start=await fetch(base+'/api/start',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({mode:item.mode})});
    if(!start.ok)throw new Error(await start.text());
    const cookie=start.headers.get('set-cookie').split(';')[0];let g=await start.json();run.gameId=g.id;
    while(g.status==='active'){
      if(sha(await readFile(new URL('game.mjs',root)))!==engineHash)throw new Error('Engine changed during evaluation.');
      const s=await status();if(s.budget.reservedUsd-initial.budget.reservedUsd+.002688>.12)throw new Error('Batch budget would be exceeded.');
      const input=replyFor(item.id,item.variant,g),t=performance.now();
      const response=await fetch(base+'/api/turn',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(input),signal:AbortSignal.timeout(60000)});
      const value=await response.json(),wallMs=Math.round(performance.now()-t);
      if(!response.ok)throw new Error(value.error||`HTTP ${response.status}`);
      g=value;run.turns.push({input,action:g.lastAction,line:g.history.filter(x=>x.speaker==='inspector').at(-1).text,wallMs});
    }
    run.status=g.status;run.metrics=g.metrics;run.history=g.history;run.receipts=g.receipts;
    const questions=run.turns.filter(t=>/^(ask_|clarify_|explain_heat)/.test(t.action)).map(t=>t.action);
    run.repeatedQuestion=questions.length!==new Set(questions).size;
    run.scanned=run.turns.some(t=>t.action==='scan');run.searched=run.turns.some(t=>t.action==='open_case');run.bribeAccepted=run.turns.some(t=>t.action==='accept_bribe');
    if(g.mode!==item.mode||g.turn>7)throw new Error('Invalid game result.');
  }catch(error){run.error=error.message;run.status='error';stop=error.message;}
  results.push(run);await writeFile(new URL(item.caseId+'.json',folder),JSON.stringify(run,null,2));
  await writeFile(new URL('progress.json',folder),JSON.stringify({completed:results.length,stop,results:results.map(({caseId,status,metrics,error})=>({caseId,status,metrics,error}))},null,2));
  if(results.length%10===0||run.error)console.log(JSON.stringify({completed:results.length,passed:results.filter(r=>r.status==='passed').length,caught:results.filter(r=>r.status==='caught').length,rejected:results.filter(r=>r.status==='rejected').length,error:run.error,spentUsd:(await status()).budget.reservedUsd-initial.budget.reservedUsd}));
  if(stop)break;
}
const final=await status();await writeFile(new URL('finish.json',folder),JSON.stringify({finishedAt:new Date().toISOString(),completed:results.length,stop,budget:final.budget,incrementalUsd:final.budget.reservedUsd-initial.budget.reservedUsd,engineHash:sha(await readFile(new URL('game.mjs',root))),fixtureHash:sha(await readFile(new URL('scripts/stress-cases.mjs',root)))},null,2));
console.log(JSON.stringify({completed:results.length,stop,incrementalUsd:final.budget.reservedUsd-initial.budget.reservedUsd}));
if(stop||results.length!==100)process.exitCode=1;
