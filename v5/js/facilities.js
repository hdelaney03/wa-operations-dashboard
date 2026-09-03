import {DFES_URL,HEALTH_URL,OVERPASS,WP_PUBLIC,FACILITY_META,ZONES} from './config.js';
import {fetchTimed,storageGet,storageSet,pointInRing,inBounds,sleep} from './utils.js';

const CACHE_KEY='waosV5FacilityCache';
const DAY=24*60*60*1000,MONTH=30*DAY;
let cache=storageGet(CACHE_KEY,{})||{};
const save=()=>storageSet(CACHE_KEY,cache);
const valid=(key,max=DAY)=>cache[key]&&Array.isArray(cache[key].items)&&Date.now()-Number(cache[key].at||0)<max;
const put=(key,items)=>{cache[key]={at:Date.now(),items};save();return items};
function pointFeature(f){const c=f?.geometry?.coordinates;return Array.isArray(c)&&Number.isFinite(+c[0])&&Number.isFinite(+c[1])?{lat:+c[1],lon:+c[0]}:null}
function osmPoint(e){const lat=Number(e.lat??e.center?.lat),lon=Number(e.lon??e.center?.lon);return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null}
function osmAddress(t={}){return[t['addr:housenumber'],t['addr:street'],t['addr:suburb']||t['addr:city']||t['addr:town'],t['addr:postcode']].filter(Boolean).join(' ')}
function zoneBounds(id){return(ZONES[id]||ZONES.swin).bounds}
function filterZone(items,id){const b=zoneBounds(id);return items.filter(x=>inBounds(x.lat,x.lon,b))}

async function fire(){
  if(valid('fire'))return cache.fire.items;
  const r=await fetchTimed(DFES_URL,{cache:'no-store'},22000);if(!r.ok)throw new Error(`DFES HTTP ${r.status}`);const d=await r.json();const types=new Set(['BFB','CFRS','PFRS','VFESU','VFRS']);
  return put('fire',(d.features||[]).map(f=>{const p=pointFeature(f),a=f.properties||{};if(!p||!pointInRing(p.lat,p.lon)||!types.has(String(a.type||'').toUpperCase()))return null;return{id:`dfes-${a.objectid||a.displaynam}`,kind:'fire',name:a.displaynam||'DFES station',subtype:a.type||'',lat:p.lat,lon:p.lon,address:'',source:FACILITY_META.fire.source,verify:FACILITY_META.fire.verify}}).filter(Boolean));
}
function edYes(v){const s=String(v??'').trim().toLowerCase();return!!s&&!['no','n','false','0','none','not applicable','n/a'].includes(s)}
async function hospital(){
  if(valid('hospital'))return cache.hospital.items;
  const r=await fetchTimed(HEALTH_URL,{cache:'no-store'},22000);if(!r.ok)throw new Error(`Health HTTP ${r.status}`);const d=await r.json();
  return put('hospital',(d.features||[]).map(f=>{const p=pointFeature(f),a=f.properties||{};if(!p||!pointInRing(p.lat,p.lon)||!edYes(a.ed_reporti))return null;return{id:`hospital-${a.objectid||a.estab_id||a.establishm}`,kind:'hospital',name:a.establishm||'Hospital',subtype:a.est||a.esc||'Emergency department',lat:p.lat,lon:p.lon,address:[a.address,a.suburb,a.postcode].filter(Boolean).join(', '),phone:a.telephone||'',source:FACILITY_META.hospital.source,verify:FACILITY_META.hospital.verify}}).filter(Boolean));
}
function bboxString(id){const b=zoneBounds(id);return`${b[0][0]},${b[0][1]},${b[1][0]},${b[1][1]}`}
async function mapped(kind,zoneId){
  const key=`${kind}:${zoneId}`;if(valid(key))return cache[key].items;const bb=bboxString(zoneId);
  const body=kind==='police'?`nwr["amenity"="police"](${bb});`:`nwr["emergency"="ambulance_station"](${bb});nwr["amenity"="ambulance_station"](${bb});`;
  const query=`[out:json][timeout:16];(${body});out center tags;`;let last;
  for(const base of OVERPASS){
    try{const r=await fetchTimed(`${base}?data=${encodeURIComponent(query)}`,{headers:{Accept:'application/json'},cache:'no-store'},24000);if(!r.ok)throw new Error(`HTTP ${r.status}`);const d=await r.json(),seen=new Set();const out=[];for(const e of d.elements||[]){const p=osmPoint(e),t=e.tags||{};if(!p||!pointInRing(p.lat,p.lon)||!inBounds(p.lat,p.lon,zoneBounds(zoneId)))continue;const id=`${e.type}-${e.id}`;if(seen.has(id))continue;seen.add(id);out.push({id:`osm-${kind}-${id}`,kind,name:t.name||(kind==='police'?'Police station':'Ambulance station'),subtype:t.operator||FACILITY_META[kind].label,lat:p.lat,lon:p.lon,address:osmAddress(t),phone:t.phone||'',source:FACILITY_META[kind].source,verify:FACILITY_META[kind].verify})}return put(key,out)}catch(e){last=e}
  }
  throw last||new Error(`${kind} mapped source unavailable`);
}
async function geocode(address){const u=new URL('https://nominatim.openstreetmap.org/search');u.searchParams.set('q',`${address}, Australia`);u.searchParams.set('format','jsonv2');u.searchParams.set('limit','1');u.searchParams.set('countrycodes','au');const r=await fetchTimed(u.toString(),{headers:{Accept:'application/json','Accept-Language':'en-AU'},cache:'no-store'},16000);if(!r.ok)throw new Error(`Geocode HTTP ${r.status}`);const d=await r.json(),x=d?.[0];return x?{lat:+x.lat,lon:+x.lon}:null}
async function westernPower(){
  if(valid('wp',MONTH))return cache.wp.items;const out=[];
  for(let i=0;i<WP_PUBLIC.length;i++){
    const x=WP_PUBLIC[i];try{const p=await geocode(x.address);if(p&&pointInRing(p.lat,p.lon))out.push({id:`wp-${i}`,kind:'wp',name:x.name,subtype:'Publicly documented Western Power work location',lat:p.lat,lon:p.lon,address:x.address,source:FACILITY_META.wp.source,verify:FACILITY_META.wp.verify})}catch(e){console.warn('WP location geocode failed',x.name,e)}if(i<WP_PUBLIC.length-1)await sleep(1050);
  }
  if(!out.length)throw new Error('Western Power public work locations unavailable');return put('wp',out);
}

export async function loadFacility(kind,zoneId='swin'){
  let items;if(kind==='fire')items=await fire();else if(kind==='hospital')items=await hospital();else if(kind==='police'||kind==='ambulance')items=await mapped(kind,zoneId);else if(kind==='wp')items=await westernPower();else items=[];
  return filterZone(items,zoneId);
}
