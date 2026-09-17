import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {createGame} from '../game.mjs';
import {makeHandler,RESERVE_NANO,checkOrigin,sessionId} from '../lib/hosted.mjs';

test('hosted requests require same origin and a valid session cookie',()=>{
  assert.equal(checkOrigin({headers:{host:'gate.fade.tools',origin:'https://evil.example'}}),false);
  assert.equal(checkOrigin({headers:{host:'gate.fade.tools',origin:'https://gate.fade.tools'}}),true);
  assert.equal(sessionId({headers:{cookie:'crossing='+'-'.repeat(36)}}),undefined);
});

test('database budget conserves reservations across concurrent sessions, retries and failures',{skip:!process.env.DATABASE_URL},async()=>{
  const sql=neon(process.env.DATABASE_URL),prefix='qa-'+randomUUID(),bid=prefix,sids=[];
  const reserve=RESERVE_NANO;
  const begin=(sid,token)=>sql`SELECT last_exit.begin_turn(${sid}::uuid,0,${token}::uuid,${bid},${prefix},${reserve}) AS result`;
  const balance=async()=>Number((await sql`SELECT used_nano FROM last_exit.budget WHERE id=${bid}`)[0].used_nano);
  try{
    await sql`INSERT INTO last_exit.budget(id,cap_nano) VALUES(${bid},${reserve*2})`;
    for(let i=0;i<6;i++){const sid=randomUUID();sids.push(sid);await sql`INSERT INTO last_exit.sessions(id,state,expires_at) VALUES(${sid}::uuid,${JSON.stringify(createGame('smuggler',sid))}::jsonb,now()+interval '1 hour')`;}
    const tokens=sids.map(()=>randomUUID());
    const results=await Promise.all(sids.map((sid,i)=>begin(sid,tokens[i])));
    assert.equal(results.filter(r=>r[0].result.state).length,2);
    assert.equal(results.filter(r=>r[0].result.error==='quota').length,4);
    assert.equal(await balance(),2*reserve);
    const winner=results.findIndex(r=>r[0].result.state),sid=sids[winner],token=tokens[winner];
    const next={...createGame('smuggler',sid),version:1,status:'passed'};
    const finish=()=>sql`SELECT last_exit.finish_turn(${sid}::uuid,${token}::uuid,${JSON.stringify(next)}::jsonb,42) AS ok`;
    const finishes=await Promise.all([finish(),finish()]);
    assert.equal(finishes.filter(r=>r[0].ok).length,1);
    const usage=await sql`SELECT event,total FROM last_exit.usage_daily WHERE budget_id=${bid}`;
    assert.deepEqual(Object.fromEntries(usage.map(r=>[r.event,Number(r.total)])),{reply_completed:1,passed:1});
    assert.equal(await balance(),reserve+42);
    assert.equal((await begin(sid,randomUUID()))[0].result.error,'quota');
    await sql`UPDATE last_exit.budget SET cap_nano=${10*reserve} WHERE id=${bid}`;
    assert.equal((await begin(sid,randomUUID()))[0].result.error,'stale');
    const busy=results.findIndex((r,i)=>i!==winner&&r[0].result.state);
    assert.equal((await begin(sids[busy],randomUUID()))[0].result.error,'busy');
    const free=results.findIndex(r=>r[0].result.error==='quota'),freeSid=sids[free];
    let queryCalls=0;
    const handler=makeHandler({sql,key:'synthetic',secret:prefix,budgetId:bid,query:async()=>{queryCalls++;throw Object.assign(new Error('Synthetic provider timeout'),{status:503,code:'provider'});}});
    async function request(path,body,cookie='crossing='+freeSid,origin='https://gate.fade.tools'){
      let result;const req={method:'POST',url:path,headers:{host:'gate.fade.tools',origin,cookie,'x-vercel-forwarded-for':prefix},body};
      const res={statusCode:0,setHeader(){},end(text){result={status:this.statusCode,...JSON.parse(text)};}};
      await handler(req,res);return result;
    }
    const input={text:'Two cooling units.',prop:'manifest',version:0};
    assert.equal((await request('/api/turn',input,undefined,'https://evil.example')).status,403);
    assert.equal((await request('/api/turn',input,'')).code,'session');
    assert.equal((await request('/api/turn',{...input,text:'x'.repeat(481)})).status,400);
    assert.equal(queryCalls,0);
    assert.equal((await request('/api/visit',{})).status,200);
    assert.equal((await request('/api/visit',{},undefined,'https://evil.example')).status,403);
    assert.equal(Number((await sql`SELECT total FROM last_exit.usage_daily WHERE budget_id=${bid} AND event='page_view'`)[0].total),1);
    const started=await request('/api/start',{mode:'smuggler'});assert.equal(started.status,'active');sids.push(started.id);
    assert.equal(Number((await sql`SELECT total FROM last_exit.usage_daily WHERE budget_id=${bid} AND event='started'`)[0].total),1);
    const before=await balance();
    assert.equal((await request('/api/turn',input)).code,'provider');
    assert.equal(await balance(),before+reserve);
    const [unchanged]=await sql`SELECT state,lease FROM last_exit.sessions WHERE id=${freeSid}::uuid`;
    assert.equal(unchanged.state.version,0);assert.equal(unchanged.lease,null);
    await sql`UPDATE last_exit.budget SET enabled=false WHERE id=${bid}`;
    assert.equal((await request('/api/turn',input)).code,'quota');
    assert.equal(queryCalls,1);
    assert.equal(await balance(),before+reserve);
  }finally{
    await sql`DELETE FROM last_exit.usage_daily WHERE budget_id=${bid}`;
    await sql`DELETE FROM last_exit.reservations WHERE budget_id=${bid}`;
    for(const sid of sids)await sql`DELETE FROM last_exit.sessions WHERE id=${sid}::uuid`;
    await sql`DELETE FROM last_exit.budget WHERE id=${bid}`;
    await sql`DELETE FROM last_exit.limits WHERE id=${prefix}`;
  }
});
