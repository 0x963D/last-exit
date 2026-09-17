import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,prepareTurn,buildAssessmentRequest,assessTurn,availableActions,resolveTurn,publicGame} from '../game.mjs';
const receipt={costUsd:.0001,latencyMs:100};
const say=(g,text,prop='none')=>prepareTurn(g,{text,prop,version:g.version});
function read(g,values){const request=buildAssessmentRequest(g);const defaults={cargo:'missing',weight:'missing',route:'missing',partner:'missing',heat:'missing',concern:'none',evidence:Object.keys(request.questions.evidence.criteria)[0],earlier:'missing'};return assessTurn(g,{answers:Object.fromEntries(Object.entries({...defaults,...values}).map(([k,choice])=>[k,{choice}]))},request);}
test('a volunteered extra item counts as an explanation; follow-up quotes it instead of restarting weight question',()=>{
  let g=say(createGame(),'Two cooling units. I also picked up a lawn mower for my father.','manifest');
  g=read(g,{cargo:'reply_1_1',weight:'reply_1_2',concern:'undeclared_item',evidence:'reply_1_2'});
  assert.ok(!('ask_weight' in availableActions(g)));assert.ok(!('ask_cargo' in availableActions(g)));
  g=resolveTurn(g,'clarify_undeclared_item',receipt);
  assert.match(g.history.at(-1).text,/You said: “I also picked up a lawn mower/);
  assert.match(g.history.at(-1).text,/missing from the manifest/);
  g=say(g,'It is a personal item.');g=read(g,{concern:'undeclared_item',evidence:'reply_1_2'});
  assert.ok(!('clarify_undeclared_item' in availableActions(g)));assert.ok(!('ask_weight' in availableActions(g)));
});
test('questions cannot repeat even after a scan or registry check',()=>{
  let g=resolveTurn(say(createGame(),'Cargo.','manifest'),'ask_weight',receipt);
  g=resolveTurn(say(g,'No idea.'),'scan',receipt);
  assert.ok(!('ask_weight' in availableActions(say(g,'Still no idea.'))));
});
test('new scan evidence can trigger a specific location challenge once, after an explanation',()=>{
  let g=resolveTurn(say(createGame(),'A mower in the back.','manifest'),'scan',receipt);
  g=read(say(g,'The mower engine is still warm.'),{weight:'reply_1_1',heat:'reply_2_1',concern:'heat_location',evidence:'reply_2_1'});
  assert.ok(!('explain_heat' in availableActions(g)));assert.ok('clarify_heat_location' in availableActions(g));
  g=resolveTurn(g,'clarify_heat_location',receipt);assert.match(g.history.at(-1).text,/inside the rear cooling unit/);
  assert.ok(!('clarify_heat_location' in availableActions(say(g,'It is inside that housing.'))));
});
test('all assessment choices must reference actual supplied criteria; dialogue never quotes nonexistent evidence',()=>{
  const g=say(createGame(),'Cooling units.');const request=buildAssessmentRequest(g);
  assert.throws(()=>assessTurn(g,{answers:{}},request));
  assert.throws(()=>read(g,{evidence:'invented quote'}));
  const understood=read(g,{concern:'changed_story',earlier:'missing'});
  assert.ok(!('clarify_changed_story' in availableActions(understood)));
});
test('an unanswered heat question cannot become a challenge to a nonexistent heat explanation',()=>{
  let g=resolveTurn(say(createGame(),'I handed you money and documents.'),'scan',receipt);
  g=read(say(g,'Release me.'),{concern:'heat_detail',heat:'missing',evidence:'reply_1_1'});
  assert.ok(!('clarify_heat_detail' in availableActions(g)));assert.ok('explain_heat' in availableActions(g));
});
test('two real calls per reply are included in cost and combined model duration',()=>{
  const g=resolveTurn(say(createGame(),'Cooling units.','manifest'),'verify_manifest',{...receipt,assessmentReceipt:{costUsd:.0002,latencyMs:200}});
  const m=publicGame(g).metrics;assert.equal(m.calls,2);assert.equal(m.decisions,1);assert.ok(Math.abs(m.costUsd-.0003)<1e-10);assert.equal(m.lastLatencyMs,300);
});
