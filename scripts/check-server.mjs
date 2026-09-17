import assert from 'node:assert/strict';
import http from 'node:http';
const base='http://127.0.0.1:9442';
const before=await fetch(base+'/api/status').then(r=>r.json());
assert.equal((await fetch(base+'/api/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
const hostileHostStatus=await new Promise((resolve,reject)=>{const request=http.get(base+'/api/status',{headers:{Host:'example.com'}},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
assert.equal(hostileHostStatus,403);
for(const path of ['/.local/spend.json','/.local/typesafe-key','/server.mjs','/.env'])assert.equal((await fetch(base+path)).status,404);
const start=await fetch(base+'/api/start',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'});
const cookie=start.headers.get('set-cookie').split(';')[0];
for(const data of [{text:'Hello',version:999,prop:'none'},{text:'Hello',version:0,prop:'fake-permit'},{text:'x'.repeat(481),version:0,prop:'none'}]){
  const result=await fetch(base+'/api/turn',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});assert.equal(result.status,400);
}
const after=await fetch(base+'/api/status').then(r=>r.json());assert.equal(after.budget.attempts,before.budget.attempts);
console.log('Origin, host, private-file and invalid-turn guards passed. Zero inference calls.');
