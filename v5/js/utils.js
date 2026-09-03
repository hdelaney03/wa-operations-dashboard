import {SWIN_RING,ZONES} from './config.js';

export const $=id=>document.getElementById(id);
export const $$=(sel,root=document)=>[...root.querySelectorAll(sel)];
export const esc=(v='')=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const num=v=>Number.isFinite(Number(v))?Number(v):null;

export function perthTime(date=new Date(),withSeconds=false){
  return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',hour:'2-digit',minute:'2-digit',second:withSeconds?'2-digit':undefined,hour12:false}).format(date);
}
export function fmtDateTime(v){
  if(v===null||v===undefined||v==='')return 'Not supplied';
  let input=v;if(typeof v==='string'&&/^\d{10,13}$/.test(v.trim()))input=Number(v);
  const d=new Date(input);if(Number.isNaN(d.getTime()))return String(v);
  return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(d);
}
export function relativeTime(v){
  const d=new Date(v);if(Number.isNaN(d.getTime()))return '--';
  const mins=Math.round((Date.now()-d.getTime())/60000);
  if(mins<1)return 'now';if(mins<60)return `${mins}m`;const h=Math.floor(mins/60);if(h<24)return `${h}h ${mins%60}m`;return `${Math.floor(h/24)}d`;
}
export function storageGet(key,fallback){try{const v=localStorage.getItem(key);return v===null?fallback:JSON.parse(v)}catch{return fallback}}
export function storageSet(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true}catch{return false}}
export async function fetchTimed(url,options={},timeout=18000){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{return await fetch(url,{...options,signal:controller.signal})}finally{clearTimeout(timer)}
}

export function pointInRing(lat,lon,ring=SWIN_RING){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const yi=ring[i][0],xi=ring[i][1],yj=ring[j][0],xj=ring[j][1];
    if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi))inside=!inside;
  }
  return inside;
}
export function inBounds(lat,lon,bounds){return lat>=bounds[0][0]&&lat<=bounds[1][0]&&lon>=bounds[0][1]&&lon<=bounds[1][1]}
export function bboxOverlap(a,b){return !!a&&!!b&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1]}
export function zoneBBox(zoneId){const b=(ZONES[zoneId]||ZONES.swin).bounds;return[b[0][0],b[0][1],b[1][0],b[1][1]]}

function pushLatLon(out,lat,lon){lat=Number(lat);lon=Number(lon);if(Number.isFinite(lat)&&Number.isFinite(lon))out.push([lat,lon])}
function walkGeoCoords(coords,out){
  if(!Array.isArray(coords))return;
  if(coords.length>=2&&Number.isFinite(Number(coords[0]))&&Number.isFinite(Number(coords[1]))){pushLatLon(out,coords[1],coords[0]);return}
  for(const x of coords)walkGeoCoords(x,out);
}
export function itemPoints(item){
  const out=[];
  if(Array.isArray(item?.point)&&item.point.length>=2)pushLatLon(out,item.point[0],item.point[1]);
  const polys=Array.isArray(item?.polygons)?item.polygons:(Array.isArray(item?.polygon)?[item.polygon]:[]);
  const walkLatLon=a=>{if(!Array.isArray(a))return;if(a.length>=2&&Number.isFinite(Number(a[0]))&&Number.isFinite(Number(a[1]))){pushLatLon(out,a[0],a[1]);return}for(const x of a)walkLatLon(x)};
  walkLatLon(polys);
  if(item?.geometry?.coordinates)walkGeoCoords(item.geometry.coordinates,out);
  if(Number.isFinite(Number(item?.lat))&&Number.isFinite(Number(item?.lon)))pushLatLon(out,item.lat,item.lon);
  return out;
}
export function itemBBox(item){
  const pts=itemPoints(item);if(!pts.length)return null;
  let minLat=90,minLon=180,maxLat=-90,maxLon=-180;
  for(const [lat,lon] of pts){minLat=Math.min(minLat,lat);minLon=Math.min(minLon,lon);maxLat=Math.max(maxLat,lat);maxLon=Math.max(maxLon,lon)}
  return[minLat,minLon,maxLat,maxLon];
}
export function itemInZone(item,zoneId){
  if(String(item?.source||'').toLowerCase().includes('western power')&&!itemBBox(item))return true;
  return bboxOverlap(itemBBox(item),zoneBBox(zoneId));
}
export function itemInMapBounds(item,leafletBounds){
  const b=itemBBox(item);if(!b||!leafletBounds)return false;
  return bboxOverlap(b,[leafletBounds.getSouth(),leafletBounds.getWest(),leafletBounds.getNorth(),leafletBounds.getEast()]);
}
export function sourceKey(item){
  const s=String(item?.source||'').toLowerCase();
  if(s.includes('western power'))return'wp';if(s.includes('emergency'))return'ewa';if(s.includes('main roads'))return'mr';return'bom';
}
export function wpCategory(item){
  if(item?.outageCategory)return item.outageCategory;if(item?.planned===true)return'planned';if(item?.planned===false)return'unplanned';return'unknown';
}
export function itemKey(item){return `${sourceKey(item)}:${String(item?.id||item?.rawId||item?.title||Math.random())}`}
export function roadCategory(item){return String(item?.category||'incident').toLowerCase()}
export function roadClosed(item){const c=roadCategory(item);return c==='closed'||/closed/i.test(String(item?.categoryLabel||item?.incidentType||item?.title||''))}
export function priorityScore(item){
  const s=sourceKey(item);
  if(s==='ewa')return 1000;
  if(s==='bom')return 900;
  if(s==='wp'&&wpCategory(item)==='unplanned')return 700+Math.min(199,Math.log10(Math.max(1,Number(item?.customersImpacted||0)))*35);
  if(s==='mr'&&roadClosed(item))return 650;
  if(s==='mr'&&roadCategory(item)==='signal')return 520;
  if(s==='wp')return 350;
  if(s==='mr')return 300;
  return 100;
}
export function isPriority(item){const s=sourceKey(item);if(s==='ewa'||s==='bom')return true;if(s==='wp'&&wpCategory(item)==='unplanned'&&Number(item?.customersImpacted||0)>=100)return true;return s==='mr'&&roadClosed(item)}
