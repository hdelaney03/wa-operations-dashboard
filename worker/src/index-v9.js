import base, { FeedCoordinator as BaseFeedCoordinator } from './index.js';
import { updateOutageHistory, outageHistoryView } from './history.js';

const HISTORY_KEY='wp-outage-history-v1';
const FIRE_KEY='bom-fire-danger-v1';
const FIRE_URL='https://www.bom.gov.au/fwo/IDW15100.xml';
const FIVE_MINUTES=5*60*1000;

function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}})}
function corsHeaders(request,env){const origin=request.headers.get('Origin')||'',allowed=String(env.ALLOWED_ORIGIN||'*');return{'Access-Control-Allow-Origin':allowed==='*'||!origin||origin===allowed?(allowed==='*'?'*':origin):allowed,'Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Accept','Vary':'Origin'}}
function fresh(v){const t=new Date(v?.updatedAt||0).getTime();return Number.isFinite(t)&&Date.now()-t<FIVE_MINUTES}
async function fireFetch(){const r=await fetch(FIRE_URL,{headers:{'Accept':'application/xml,text/xml;q=0.9,*/*;q=0.1','User-Agent':'WA-Operations-Dashboard/9.0 (personal situational awareness)'},redirect:'follow'});if(!r.ok)throw new Error(`BOM fire danger HTTP ${r.status}`);return r.text()}

export class FeedCoordinator extends BaseFeedCoordinator{
  async refresh(){
    const before=await this.current();
    const snapshot=await super.refresh();
    if(!before||before.updatedAt!==snapshot?.updatedAt){
      try{const old=(await this.ctx.storage.get(HISTORY_KEY))||{};const next=updateOutageHistory(old,before?.westernPower||[],snapshot?.westernPower||[],snapshot?.updatedAt||new Date().toISOString());await this.ctx.storage.put(HISTORY_KEY,next)}catch(e){console.warn('Unable to retain outage history',e)}
    }
    return snapshot;
  }
  async outageHistory(){const store=(await this.ctx.storage.get(HISTORY_KEY))||{};return{updatedAt:new Date().toISOString(),history:outageHistoryView(store)}}
  async fireDanger(){let state=(await this.ctx.storage.get(FIRE_KEY))||null;if(fresh(state))return state;try{const xml=await fireFetch();state={ok:true,updatedAt:new Date().toISOString(),source:'BOM IDW15100',xml};await this.ctx.storage.put(FIRE_KEY,state);return state}catch(e){return state?{...state,ok:false,stale:true,error:String(e?.message||e)}:{ok:false,updatedAt:new Date().toISOString(),source:'BOM IDW15100',error:String(e?.message||e),xml:''}}}
  async fetch(request){const u=new URL(request.url);if(u.pathname==='/outage-history')return json(await this.outageHistory());if(u.pathname==='/fire-danger')return json(await this.fireDanger());return super.fetch(request)}
}

function coordinator(env){const id=env.FEED_COORDINATOR.idFromName('wa-global-feeds');return env.FEED_COORDINATOR.get(id)}

export default{
  async fetch(request,env){
    const cors=corsHeaders(request,env);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='GET')return json({error:'method_not_allowed'},405,cors);
    const u=new URL(request.url),stub=coordinator(env);
    if(u.pathname==='/'||u.pathname==='/api/health'){
      const r=await stub.fetch('https://internal/health'),h=await r.json();return json({...h,service:'WA Operations Dashboard feed service',version:9,endpoints:['/api/health','/api/feeds','/api/outage-history','/api/fire-danger']},200,{...cors,'Cache-Control':'no-store'});
    }
    if(u.pathname==='/api/feeds'){
      const r=await stub.fetch('https://internal/feeds'),s=await r.json();return json({...s,version:9},200,{...cors,'Cache-Control':'public, max-age=60, stale-while-revalidate=60'});
    }
    if(u.pathname==='/api/outage-history'){
      const r=await stub.fetch('https://internal/outage-history'),h=await r.json();return json(h,200,{...cors,'Cache-Control':'public, max-age=60, stale-while-revalidate=120'});
    }
    if(u.pathname==='/api/fire-danger'){
      const r=await stub.fetch('https://internal/fire-danger'),f=await r.json();return json(f,200,{...cors,'Cache-Control':'public, max-age=180, stale-while-revalidate=120'});
    }
    return base.fetch(request,env);
  }
};
