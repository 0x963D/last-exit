const $=s=>document.querySelector(s);
let game=null,connected=false,busy=false,prop='none',audio=null,available=true,hosted=false;
const labels={ask_cargo:'Questioned cargo',ask_weight:'Questioned weight',ask_route:'Checked destination',ask_partner:'Questioned partner',ask_papers:'Demanded papers',challenge:'Challenged story',verify_manifest:'Verified seal',scan:'Scanned vehicle',explain_heat:'Questioned heat',open_case:'Opened cargo',refuse_bribe:'Refused bribe',accept_bribe:'Accepted bribe',release:'Opened gate',turn_away:'Refused entry'};
async function api(path,data){const response=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok){if(result.code==='quota'){available=false;$('#quota-help').hidden=false;}throw new Error(result.error||'The checkpoint could not complete this request.');}return result;}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function setBusy(value){busy=value;$('#thinking').hidden=!value;$('#send').disabled=value||!connected||!available;$('#send').firstChild.textContent=value?'Listening…':'Say it ';$('#reply').disabled=value;$('#manifest').disabled=value||!!game?.papers;$('#credits').disabled=value||!!game?.bribe||game?.credits===0;$('#again').disabled=value||!available;$('#control').disabled=value||!available;$('#begin').disabled=value||!connected||!available;}
function setProp(value){prop=prop===value?'none':value;for(const id of ['manifest','credits'])$('#'+id).setAttribute('aria-pressed',String(prop===id));$('#prop-help').textContent=prop==='manifest'?'The manifest goes with your next reply.':prop==='credits'?'600 credits go with your next reply.':'Items are handed over with your next reply.';}
function fillBrief(){
  const briefing=game?.briefing||{title:'Get the glasswing across.',text:'Rook is waiting in the car. Hidden inside one cooling unit is a living glasswing, stolen from a corporate lab. Your manifest is genuine. Your cargo is not. Talk your way through with the creature still aboard.',secret:'The life-support cell runs warm. A thermal scan could notice. The inspector does not know this.',manifest:{driver:'Ren Vale',carrier:'Southline Freight',cargo:'Two refurbished industrial cooling units',destination:'Relay Nine repair depot',seal:'SL-2041',massKg:84}};
  $('#brief-title').textContent=briefing.title;$('#brief-text').textContent=briefing.text;$('#brief-secret').textContent=briefing.secret;
  $('#manifest-details').replaceChildren();for(const [key,value] of Object.entries(briefing.manifest)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=({massKg:'Mass',driver:'Driver',carrier:'Carrier',cargo:'Declared cargo',destination:'Destination',seal:'Seal'})[key];dd.textContent=key==='massKg'?`${value} kg`:value;$('#manifest-details').append(dt,dd);}
}
function fillTranscript(){
  $('#transcript').replaceChildren();for(const row of game?.history||[]){const article=document.createElement('article'),who=document.createElement('strong'),p=document.createElement('p');who.textContent=row.speaker==='you'?'REN / YOU':row.speaker==='inspector'?'KADE':'OBSERVED';p.textContent=row.text;article.append(who,p);if(row.speaker==='event')article.className='event-entry';if(row.prop&&row.prop!=='none'){const small=document.createElement('small');small.textContent=row.prop==='manifest'?'Handed over the manifest':'Offered 600 credits';article.append(small);}$('#transcript').append(article);}
}
function render(){
  const active=game?.status==='active',ended=game&&!active;
  document.body.classList.toggle('playing',!!active);document.body.classList.toggle('ended',!!ended);
  $('#intro').hidden=!!game;$('#encounter').hidden=!active;$('#ending').hidden=!ended;
  $('#log-toggle').disabled=!game;$('#setup-link').hidden=hosted;$('#setup-link').textContent=connected?'Jev connected':'Connect TypeSafe';
  $('#intro-connection').replaceChildren();if(!available){const a=document.createElement('a');a.href='https://github.com/0x963D/last-exit/issues/new?title=More%20playtime%20for%20Last%20Exit';a.textContent='The checkpoint is out of demo credits. Ask Dan to reopen it.';$('#intro-connection').append(a);}else if(!connected){if(hosted)$('#intro-connection').textContent='The checkpoint is temporarily offline. Please return shortly.';else{const a=document.createElement('a');a.href='/setup.html';a.textContent='Connect TypeSafe to play live.';$('#intro-connection').append(a);}}
  fillBrief();fillTranscript();if(!game){setBusy(busy);return;}
  $('#turn-count').textContent=`${String(Math.min(game.turn+1,game.maxTurns)).padStart(2,'0')} / ${String(game.maxTurns).padStart(2,'0')}`;
  const last=[...game.history].reverse().find(x=>x.speaker==='inspector');$('#officer-line').textContent=last?.text||'';
  const endIndex=game.history.length-1,lastRow=game.history[endIndex];$('#scene-event').hidden=lastRow?.speaker!=='event';$('#scene-event').textContent=lastRow?.speaker==='event'?lastRow.text:'';
  $('#manifest span').textContent=game.papers?'Manifest handed over':'Slide manifest';$('#credits span').textContent=game.bribe?'Credits on the desk':game.credits===0?'Credits taken':'Offer 600 credits';
  const m=game.metrics;$('#metric').textContent=m.calls?`${m.lastLatencyMs} ms · $${m.costUsd.toFixed(5)} this crossing`:'Jev chooses. You deal with it.';
  $('#scene-status').textContent=game.mode==='control'?'HONEST SHIPMENT':'INTERVIEW IN PROGRESS';
  if(ended){$('#ending-title').textContent=game.status==='passed'?(game.mode==='control'?'Cleared to cross.':'You got it through.'):game.status==='caught'?'He opened the case.':'Road ends here.';$('#ending-text').textContent=game.ending;$('#ending-stats').textContent=`${m.decisions} decisions · ${m.calls} Jev calls · $${m.costUsd.toFixed(5)} · Last reply ${m.lastLatencyMs} ms`;
    $('#decision-path').replaceChildren();for(const r of game.receipts||[]){const span=document.createElement('span'),b=document.createElement('b');b.textContent=String(r.turn).padStart(2,'0');span.append(b,labels[r.action]||r.action.replace('clarify_','Clarified ').replaceAll('_',' '));$('#decision-path').append(span);}
  }
  setBusy(busy);
}
async function start(mode='smuggler'){try{setBusy(true);game=await api('/api/start',{mode});prop='none';$('#reply').value='';$('#error').hidden=true;render();setProp('none');$('#reply').focus();}catch(e){if(!available)render();else $('#intro-connection').textContent=e.message;$('#error').textContent=e.message;$('#error').hidden=false;}finally{setBusy(false);}}
$('#begin').onclick=()=>start();$('#again').onclick=()=>start();$('#control').onclick=()=>start('control');
$('#manifest').onclick=()=>setProp('manifest');$('#credits').onclick=()=>setProp('credits');
$('#reply-form').onsubmit=async e=>{e.preventDefault();if(busy)return;$('#error').hidden=true;const text=$('#reply').value.trim();if(!text)return;setBusy(true);try{game=await api('/api/turn',{text,prop,version:game.version});$('#reply').value='';prop='none';setProp('none');render();if(game.status==='active')$('#reply').focus();}catch(error){$('#error').textContent=error.message;$('#error').hidden=false;}finally{setBusy(false);if(game?.status==='active')$('#reply').focus();}};
$('#reply').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('#reply-form').requestSubmit();}};
$('#briefing-toggle').onclick=()=>$('#brief-dialog').showModal();$('#log-toggle').onclick=()=>$('#log-dialog').showModal();
for(const d of document.querySelectorAll('dialog')){d.querySelector('.close').onclick=()=>d.close();d.onclick=e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}};}
$('#receipt').onclick=()=>download(new Blob([JSON.stringify({title:'Last Exit',id:game.id,mode:game.mode,status:game.status,history:game.history,metrics:game.metrics,receipts:game.receipts,provenance:'Real Jev action selections. Authored dialogue. Deterministic physical consequences. No replay speed or calibration claim.'},null,2)],{type:'application/json'}),`last-exit-${game.id}.json`);
$('#share-card').onclick=async()=>{
  const button=$('#share-card');button.disabled=true;
  try{await document.fonts.ready;const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const c=canvas.getContext('2d');const img=new Image();img.src='/assets/checkpoint.png';await img.decode();
    c.fillStyle='#111b1e';c.fillRect(0,0,1080,1350);c.drawImage(img,260,0,1000,1000,0,0,1080,1080);const grad=c.createLinearGradient(0,380,0,1250);grad.addColorStop(0,'rgba(10,20,23,0)');grad.addColorStop(.55,'rgba(10,20,23,.94)');grad.addColorStop(1,'#0a1417');c.fillStyle=grad;c.fillRect(0,380,1080,970);
    c.fillStyle='#ebbe73';c.font='600 36px Rajdhani';c.fillText('LAST EXIT',70,90);c.fillStyle='#f0eee5';c.font='600 76px Rajdhani';const title=game.status==='passed'?'I made it through.':game.status==='caught'?'He opened the case.':'He turned me away.';c.fillText(title,70,880);
    c.font='30px "DM Sans"';c.fillText('Can you talk your way past a Jev inspector?',70,948);c.font='23px "DM Sans"';c.fillStyle='#b8c5c0';c.fillText(`${game.metrics.decisions} decisions · ${game.metrics.calls} calls · $${game.metrics.costUsd.toFixed(5)}`,70,1020);
    c.strokeStyle='#4c5e5b';c.beginPath();c.moveTo(70,1150);c.lineTo(1010,1150);c.stroke();c.font='22px "DM Sans"';c.fillText('Real Jev decisions. Your own cover story.',70,1206);c.font='18px "DM Sans"';c.fillText('Original playable prototype · TypeSafe AI',70,1244);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));download(blob,`last-exit-${game.status}.png`);
  }finally{button.disabled=false;}
};
$('#sound-toggle').onclick=async()=>{
  if(!audio){const ctx=new AudioContext();const buffer=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);const data=buffer.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+Math.random()*.03-.015)*.995;data[i]=last;}
    const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;const gain=ctx.createGain();gain.gain.value=.3;noise.connect(filter).connect(gain).connect(ctx.destination);noise.start();audio=ctx;
  }else if(audio.state==='running')await audio.suspend();else await audio.resume();
  const on=audio.state==='running';$('#sound-toggle').textContent=on?'Sound on':'Sound off';$('#sound-toggle').setAttribute('aria-pressed',String(on));
};
try{const status=await api('/api/status');connected=status.connected;available=status.available!==false;hosted=status.public===true;game=await api('/api/game');render();}catch(e){$('#intro-connection').textContent=`Checkpoint unavailable. ${e.message}`;setBusy(false);}
