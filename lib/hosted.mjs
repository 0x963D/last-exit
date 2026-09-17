import {neon} from '@neondatabase/serverless';
import {createHmac,randomUUID,createHash} from 'node:crypto';
import {createGame,prepareTurn,buildAssessmentRequest,assessTurn,buildRequest,validate,resolveTurn,publicGame} from '../game.mjs';
export const RESERVE_NANO=2688000;
const help='https://github.com/0x963D/last-exit/issues/new?title=More%20playtime%20for%20Last%20Exit&body=The%20public%20demo%20is%20out%20of%20credits.%20Please%20reopen%20the%20checkpoint!';
export function identity(req,secret){return createHmac('sha256',secret).update((req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()).digest('hex');}
export function sessionId(req){return req.headers.cookie?.match(/(?:^|;\s*)crossing=([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:;|$)/)?.[1];}
export function checkOrigin(req){const host=req.headers.host,origin=req.headers.origin;return !!host&&origin===`https://${host}`;}
function fail(message,code='request',status=400){return Object.assign(new Error(message),{code,status});}
export async function queryJev(request,key){
  if(Buffer.byteLength(JSON.stringify(request))>26000)throw fail('This story is too long. Start a fresh crossing.');
  const start=performance.now();
  const response=await fetch('https://api.typesafe.ai/v1/systemone',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw fail(response.status===402?'The checkpoint has run out of model credits. Ask Dan to reopen it.':'Kade lost the connection. Your reply was not applied. Try again shortly.',response.status===402?'quota':'provider',503);
  const raw=await response.json(),tokens=raw.usage?.input_tokens;
  if(!Number.isSafeInteger(tokens)||tokens<0||tokens>32000)throw fail('The checkpoint paused after an unexpected usage response.','provider',503);
  return {raw,request,requestHash:createHash('sha256').update(JSON.stringify(request)).digest('hex'),inputTokens:tokens,costUsd:tokens*.042/1e6,latencyMs:Math.round(performance.now()-start),at:new Date().toISOString()};
}
export function makeHandler({sql=process.env.DATABASE_URL?neon(process.env.DATABASE_URL):null,key=process.env.TYPESAFE_API_KEY,secret=process.env.SESSION_SECRET,budgetId=process.env.VERCEL_ENV==='production'?'public-v1':'preview-v1',query=queryJev}={}){
  return async(req,res)=>{
    const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
    try{
      if(!sql||!key||!secret)throw fail('The checkpoint is temporarily offline. Please return shortly.','offline',503);
      const url=new URL(req.url,'https://local.invalid');
      const route=req.query?.route||url.searchParams.get('route');
      const path=route?'/api/'+route:url.pathname;
      if(req.method==='GET'&&path==='/api/status'){
        const [b]=await sql`SELECT cap_nano,used_nano,enabled FROM last_exit.budget WHERE id=${budgetId}`;
        const open=!!b?.enabled&&Number(b.used_nano)+RESERVE_NANO<=Number(b.cap_nano);
        return send(200,{connected:true,public:true,available:open,helpUrl:help,budget:{capUsd:Number(b?.cap_nano||0)/1e9,reservedUsd:Number(b?.used_nano||0)/1e9}});
      }
      const sid=sessionId(req);
      if(req.method==='GET'&&path==='/api/game'){
        if(!sid)return send(200,null);
        const [row]=await sql`SELECT state FROM last_exit.sessions WHERE id=${sid}::uuid AND expires_at>now()`;return send(200,row?publicGame(row.state):null);
      }
      if(req.method!=='POST')return send(404,{error:'Not found.'});
      if(!checkOrigin(req))throw fail('Open the game in its own browser tab.','origin',403);
      if(!['/api/start','/api/turn'].includes(path))return send(404,{error:'Not found.'});
      let data=req.body;
      if(data===undefined){let text='';for await(const part of req){text+=part.toString();if(Buffer.byteLength(text)>5000)throw fail('Reply too large.');}data=JSON.parse(text);}
      if(typeof data==='string'){if(Buffer.byteLength(data)>5000)throw fail('Reply too large.');data=JSON.parse(data);}
      if(!data||typeof data!=='object'||Buffer.byteLength(JSON.stringify(data))>5000)throw fail('Invalid reply.');
      const bucket=Math.floor(Date.now()/3600000),actor=identity(req,secret);
      if(path==='/api/start'){
        const [{allowed}]=await sql`SELECT last_exit.rate(${`start:${actor}:${bucket}`},12) AS allowed`;
        if(!allowed)throw fail('You have played a lot of crossings. Come back in an hour.','rate',429);
        const [b]=await sql`SELECT enabled AND used_nano+${RESERVE_NANO}<=cap_nano AS allowed FROM last_exit.budget WHERE id=${budgetId}`;
        if(!b?.allowed)throw fail('The checkpoint is out of demo credits. Ask Dan to reopen it.','quota',503);
        const game=createGame(data.mode||'smuggler',randomUUID());
        await sql`INSERT INTO last_exit.sessions(id,state,expires_at) VALUES(${game.id}::uuid,${JSON.stringify(game)}::jsonb,now()+interval '4 hours')`;
        // Expired fictional transcripts are removed opportunistically; budget never resets.
        await sql`DELETE FROM last_exit.sessions WHERE expires_at<now()`;
        await sql`DELETE FROM last_exit.limits WHERE expires_at<now()`;
        res.setHeader('Set-Cookie',`crossing=${game.id}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400`);return send(200,publicGame(game));
      }
      if(!sid)throw fail('Start a new crossing.','session');
      const [existing]=await sql`SELECT state FROM last_exit.sessions WHERE id=${sid}::uuid AND expires_at>now()`;
      if(!existing)throw fail('This crossing expired. Start another.','session');
      prepareTurn(existing.state,data); // Validate before reserving budget or consuming a turn.
      const token=randomUUID();
      const [{result}]=await sql`SELECT last_exit.begin_turn(${sid}::uuid,${data.version},${token}::uuid,${budgetId},${`turn:${actor}:${bucket}`},${RESERVE_NANO}) AS result`;
      if(result.error){const errors={quota:['The checkpoint is out of demo credits. Ask Dan to reopen it.',503],busy:['Kade is already considering a reply. Wait a moment.',409],stale:['This reply belongs to an older turn. Refresh the page.',409],rate:['Give Kade a break. Please return in an hour.',429],session:['Start a new crossing.',400]};const [message,status]=errors[result.error]||['The checkpoint is unavailable.',503];throw fail(message,result.error,status);}
      try{
        const pending=prepareTurn(result.state,data),readingRequest=buildAssessmentRequest(pending),reading=await query(readingRequest,key);
        const understood=assessTurn(pending,reading.raw,readingRequest),request=buildRequest(understood),receipt=await query(request,key);receipt.assessmentReceipt=reading;
        const next=resolveTurn(understood,validate(receipt.raw,request),receipt),actual=(reading.inputTokens+receipt.inputTokens)*42;
        const [{ok}]=await sql`SELECT last_exit.finish_turn(${sid}::uuid,${token}::uuid,${JSON.stringify(next)}::jsonb,${actual}) AS ok`;
        if(!ok)throw fail('This reply expired before it could be saved. Refresh the crossing.','stale',409);
        return send(200,publicGame(next));
      }catch(error){
        // Keep the conservative spend reservation on any uncertain provider/commit failure.
        await sql`UPDATE last_exit.sessions SET lease=NULL,lease_until=NULL WHERE id=${sid}::uuid AND lease=${token}::uuid`;
        console.error(JSON.stringify({event:'turn_failed',id:sid,code:error.code||'internal'}));throw error;
      }
    }catch(error){const known=!!error.status;send(known?error.status:400,{error:known?error.message:'The reply could not be processed. Refresh or try a new crossing.',code:error.code||'request',helpUrl:error.code==='quota'?help:undefined});}
  };
}
