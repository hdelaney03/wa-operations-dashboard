(function(){
'use strict';
const DAY=24*60*60*1000;
let wrapped=false,lastSignature='';

function parseTime(v){
  if(v===null||v===undefined||v==='')return null;
  if(v instanceof Date)return Number.isNaN(v.getTime())?null:v.getTime();
  if(typeof v==='number'&&Number.isFinite(v))return v<1e11?v*1000:v;
  const s=String(v).trim();
  if(/^\d{10,13}$/.test(s)){const n=Number(s);return s.length===10?n*1000:n}
  const au=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if(au){
    let h=Number(au[4]);const ap=au[7].toUpperCase();
    if(ap==='PM'&&h!==12)h+=12;if(ap==='AM'&&h===12)h=0;
    const iso=`${au[3]}-${String(au[2]).padStart(2,'0')}-${String(au[1]).padStart(2,'0')}T${String(h).padStart(2,'0')}:${au[5]}:${au[6]||'00'}+08:00`;
    const t=new Date(iso).getTime();return Number.isFinite(t)?t:null;
  }
  const arc=s.match(/^\/Date\((\d+)\)\/$/);if(arc)return Number(arc[1]);
  const t=new Date(s).getTime();return Number.isFinite(t)?t:null;
}
function category(i){
  try{return typeof wpCategory==='function'?wpCategory(i):(i?.outageCategory||'unknown')}catch{return i?.outageCategory||'unknown'}
}
function clearlyStaleUnplanned(i,now=Date.now()){
  if(category(i)!=='unplanned')return false;
  const start=parseTime(i?.outageStartTime),etr=parseTime(i?.estimatedRestorationTime);
  const startOld=start!==null&&now-start>14*DAY;
  const etrOld=etr!==null&&now-etr>2*DAY;
  return startOld&&etrOld;
}
function setWpHealth(reason,visible){
  const feed=document.getElementById('wpFeed'),count=document.getElementById('wpCount');
  if(count&&Number.isFinite(visible))count.textContent=String(visible);
  if(!feed||!reason)return;
  const base=feed.textContent.replace(/\s·\s(?:\d+ stale ArcGIS records? suppressed|last-known outages hidden).*$/,'');
  feed.textContent=`${base} · ${reason}`;
}
function rerender(){
  try{renderWarnings?.()}catch{}
  try{plot?.()}catch{}
  try{typeof updateStatus==='function'&&updateStatus()}catch{}
  try{typeof updateMapStatus==='function'&&updateMapStatus()}catch{}
}
function guard(){
  if(typeof feedData==='undefined'||!feedData||!Array.isArray(feedData.westernPower))return;
  const source=feedData.sources?.westernPower||{};
  const incoming=feedData.westernPower;
  let kept=incoming,suppressed=[],reason='';

  if(source.ok===false){
    suppressed=[...incoming];kept=[];reason='last-known outages hidden';
  }else{
    suppressed=incoming.filter(clearlyStaleUnplanned);
    if(suppressed.length)kept=incoming.filter(i=>!clearlyStaleUnplanned(i));
    if(suppressed.length)reason=`${suppressed.length} stale ArcGIS record${suppressed.length===1?'':'s'} suppressed`;
  }

  window.GRIDPULSESuppressedWp={at:new Date().toISOString(),reason,items:suppressed.map(i=>({id:i.id,incidentRef:i.incidentRef,affectedArea:i.affectedArea,outageStartTime:i.outageStartTime,estimatedRestorationTime:i.estimatedRestorationTime}))};
  const signature=`${source.ok}|${incoming.length}|${kept.length}|${suppressed.map(i=>i.id||i.incidentRef||i.affectedArea).join(',')}`;
  if(kept.length!==incoming.length){feedData.westernPower=kept;rerender()}
  if(reason)setWpHealth(reason,kept.length);
  lastSignature=signature;
}
function wrapLoader(){
  if(wrapped||typeof loadFeeds!=='function')return;
  const base=loadFeeds;
  loadFeeds=async function(){const r=await base.apply(this,arguments);guard();return r};
  wrapped=true;
}
function boot(){
  wrapLoader();guard();
  [300,800,1500,3000,6000,10000].forEach(ms=>setTimeout(()=>{wrapLoader();guard()},ms));
  setInterval(guard,5000);
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(guard,1200));
}
boot();
})();
