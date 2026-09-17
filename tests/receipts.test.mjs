import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as v1 from '../game-v1.mjs';
import * as v2 from '../game.mjs';
test('current and v1 receipts replay; historical development requests retain valid hashes and choices',async t=>{
  let files;try{files=await readdir(new URL('../.local/runs/',import.meta.url));}catch{return t.skip('No local live receipts on this machine.');}
  let checked=0;
  for(const file of files){
    if(!file.endsWith('.json'))continue;const saved=JSON.parse(await readFile(new URL('../.local/runs/'+file,import.meta.url),'utf8'));
    if(!saved.observations.some(x=>x.kind==='weighbridge'))continue;
    if(saved.engineVersion&&saved.engineVersion!==v2.VERSION){
      // Historical development prompts remain auditable without pretending they are today's engine.
      for(const r of saved.receipts)for(const call of [r.assessmentReceipt,r].filter(Boolean)){
        assert.equal(createHash('sha256').update(JSON.stringify(call.request)).digest('hex'),call.requestHash);
        for(const [name,q] of Object.entries(call.request.questions))assert.ok(Object.hasOwn(q.criteria,call.raw.answers[name].choice));
        assert.equal(call.costUsd,call.raw.usage.input_tokens*(.042/1e6));checked++;
      }
      continue;
    }
    const {createGame,prepareTurn,buildRequest,validate,resolveTurn}=saved.engineVersion===v2.VERSION?v2:v1;
    let g=createGame(saved.mode,saved.id);const replies=saved.history.filter(x=>x.speaker==='you');
    for(let i=0;i<saved.receipts.length;i++){
      const r=saved.receipts[i],reply=replies[i];g=prepareTurn(g,{text:reply.text,prop:reply.prop,version:g.version});
      if(r.assessmentReceipt){const ar=r.assessmentReceipt,request=v2.buildAssessmentRequest(g);assert.deepEqual(request,ar.request);assert.equal(createHash('sha256').update(JSON.stringify(request)).digest('hex'),ar.requestHash);assert.equal(ar.costUsd,ar.raw.usage.input_tokens*(.042/1e6));g=v2.assessTurn(g,ar.raw,request);checked++;}
      const request=buildRequest(g);
      assert.deepEqual(request,r.request);assert.equal(createHash('sha256').update(JSON.stringify(request)).digest('hex'),r.requestHash);
      assert.equal(validate(r.raw,request),r.action);assert.equal(r.inputTokens,r.raw.usage.input_tokens);assert.equal(r.costUsd,r.inputTokens*(.042/1e6));
      g=resolveTurn(g,r.action,r);checked++;
    }
    assert.equal(g.status,saved.status);assert.deepEqual(g.history,saved.history);assert.deepEqual(g.observations,saved.observations);
  }
  assert.ok(checked>0);t.diagnostic(`${checked} real responses checked without network calls (current/v1 replay plus historical request audit).`);
});
