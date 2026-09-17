import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
test('published evaluation contains 100 complete runs and reconciled provider receipts',async()=>{
  const dir=new URL('../evaluation/',import.meta.url),files=(await readdir(dir)).filter(f=>/-v[1-5]-r[12]\.json$/.test(f));
  const plan=JSON.parse(await readFile(new URL('plan.json',dir),'utf8'));
  assert.equal(createHash('sha256').update(await readFile(new URL('../game.mjs',import.meta.url))).digest('hex'),plan.engineHash);
  assert.equal(files.length,100);let passed=0,control=0,calls=0,cost=0;
  for(const file of files){const g=JSON.parse(await readFile(new URL(file,dir),'utf8'));assert.equal(g.error,null);
    if(g.status==='passed'){if(g.mode==='control')control++;else passed++;}
    for(const receipt of g.receipts)for(const r of [receipt.assessmentReceipt,receipt]){
      assert.equal(createHash('sha256').update(JSON.stringify(r.request)).digest('hex'),r.requestHash);
      for(const [name,q]of Object.entries(r.request.questions))assert.ok(Object.hasOwn(q.criteria,r.raw.answers[name].choice));
      assert.equal(r.inputTokens,r.raw.usage.input_tokens);calls++;cost+=r.inputTokens*.042/1e6;
    }
  }
  assert.equal(passed,29);assert.equal(control,10);assert.equal(calls,596);assert.ok(Math.abs(cost-.056999502)<1e-10);
});
