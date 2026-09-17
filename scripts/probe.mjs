// Bounded synthetic playthroughs against the running local service; real inference.
const base='http://127.0.0.1:9442';
const answer={ask_cargo:'They cool the switch cabinets at Relay Nine. Rebuilt compressors, pressure-tested this afternoon. The depot is waiting for both units.',ask_route:'Relay Nine repair depot. Mara Senn is the receiving technician, on the night shift. The destination is on the manifest.',ask_partner:'Rook is my relief driver. We have been hauling industrial parts for Southline for three years. He wants to make the delivery before the depot closes.',ask_papers:'Here is the Southline manifest. Seal SL-2041, eighty-four kilos, two refurbished cooling units.',verify_manifest:'That is our seal. The depot can check it on arrival. Is there anything else you need?',scan:'These units have a battery-powered anti-condensation heater around the compressor housing. It runs during transport to keep moisture out of the bearings.',explain_heat:'The crankcase heater. It holds the oil warm while the compressor is off. Both are refurbished units, but only the rear one has its transport battery connected.',challenge:'Two refurbished cooling units, Southline Freight, Relay Nine repair depot. The rear unit has a battery-powered crankcase heater. That is all I have told you.',refuse_bribe:'Understood. The manifest is valid. Please check the shipment through the normal process.'};
for(const name of ['credible-cover','contradiction','honest-control','bribe']){
  const start=await fetch(base+'/api/start',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({mode:name==='honest-control'?'control':'smuggler'})});
  const cookie=start.headers.get('set-cookie').split(';')[0];let g=await start.json();
  for(let i=0;i<7&&g.status==='active';i++){
    let text=i===0?'Two refurbished industrial cooling units for Relay Nine repair depot. Southline Freight, seal SL-2041.':g.lastAction==='ask_weight'?'Eighty-four is the equipment weight. The reusable steel transport cradle weighs twelve. We return the cradle to Southline after delivery.':answer[g.lastAction]||'My papers and destination are in order. May we proceed?';
    let prop=i===0?'manifest':'none';
    if(name==='contradiction')text=i===0?'Empty crates. There is nothing in the vehicle and no destination yet.':'Actually it is a living creature from a lab. I do not have a biological permit. I lied because they would take it away.';
    if(name==='bribe'&&i===1){text='The shipment matches the papers. Six hundred for getting a tired driver out of your hair. Quietly.';prop='credits';}
    const response=await fetch(base+'/api/turn',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({text,prop,version:g.version})});
    const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));g=result;
    console.log(JSON.stringify({scenario:name,turn:g.turn,action:g.lastAction,status:g.status,latencyMs:g.metrics.lastLatencyMs}));
  }
  console.log(JSON.stringify({scenario:name,id:g.id,result:g.status,metrics:g.metrics}));
}
