function text(v){return String(v??'').trim()}
function tags(item){return text(item?.tags).split(/(?:\r?\n|;|\|)+/).map(x=>x.trim()).filter(Boolean)}
function add(rec,event){const sig=event.sig||`${event.kind}:${event.text}`;if(rec.events.some(e=>e.sig===sig))return;rec.events.unshift({...event,sig});rec.events.sort((a,b)=>new Date(b.at)-new Date(a.at));rec.events=rec.events.slice(0,24)}
function state(i){return{customers:i?.customersImpacted??null,etr:text(i?.estimatedRestorationTime),tags:tags(i),area:text(i?.affectedArea),category:text(i?.outageCategory)}}
function id(i){return text(i?.id||i?.incidentRef||i?.enarNumber||i?.affectedArea||'outage')}
export function updateOutageHistory(store={},previous=[],current=[],at=new Date().toISOString()){
  const out=store&&typeof store==='object'?store:{};const prevMap=new Map(previous.map(i=>[id(i),i])),curMap=new Map(current.map(i=>[id(i),i]));
  for(const [key,item] of curMap){let rec=out[key];if(!rec)rec={events:[],last:null,lastSeen:at,active:true};const now=state(item),before=rec.last;
    if(!before){const n=Number(now.customers);add(rec,{kind:'customer',at,text:Number.isFinite(n)?`${n.toLocaleString('en-AU')} customer${n===1?'':'s'} affected${now.area?` in ${now.area}`:''}.`:`Outage observed${now.area?` in ${now.area}`:''}.`,sig:'first'});for(const t of now.tags)add(rec,{kind:'status',at,text:t,sig:`tag:${t.toLowerCase()}`})}
    else{
      if(now.customers!==null&&before.customers!==null&&Number(now.customers)!==Number(before.customers)){const n=Number(now.customers);add(rec,{kind:'customer',at,text:`Public outage feed now shows ${n.toLocaleString('en-AU')} customer${n===1?'':'s'} affected${now.area?` in ${now.area}`:''}.`,sig:`customers:${n}:${at}`})}
      if(now.etr&&before.etr&&now.etr!==before.etr)add(rec,{kind:'etr',at,text:`Estimated restoration changed to ${now.etr}.`,sig:`etr:${now.etr}`});
      const old=new Set(before.tags||[]);for(const t of now.tags)if(!old.has(t))add(rec,{kind:'status',at,text:t,sig:`tag:${t.toLowerCase()}`});
    }
    rec.last=now;rec.lastSeen=at;rec.active=true;out[key]=rec;
  }
  for(const [key,item] of prevMap)if(!curMap.has(key)){const rec=out[key];if(rec?.active){add(rec,{kind:'resolved',at,text:`The outage${rec.last?.area?` in ${rec.last.area}`:''} is no longer present in the public outage feed.`,sig:`resolved:${at}`});rec.active=false;rec.lastSeen=at;out[key]=rec}}
  const entries=Object.entries(out).sort((a,b)=>String(b[1]?.lastSeen||'').localeCompare(String(a[1]?.lastSeen||''))).slice(0,160);return Object.fromEntries(entries)
}
export function outageHistoryView(store={}){return Object.fromEntries(Object.entries(store||{}).map(([k,v])=>[k,Array.isArray(v?.events)?v.events:[]]))}
