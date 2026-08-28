(function(){
'use strict';
const DAY=24*60*60*1000;
let wrapped=false;

function parseTime(v){
  if(v===null||v===undefined||v==='')return null;
  if(typeof v==='number'&&Number.isFinite(v))return v;
  const s=String(v).trim();
  if(/^\d{10,13}$/.test(s))return Number(s.length===10?Number(s)*1000:Number(s));
  const t=new Date(s).getTime();
  return Number.isFinite(t)?t:null;
}
function category(i){
  try{return typeof wpCategory==='function'?wpCategory(i):(i?.outageCategory||'unknown')}catch{return i?.outageCategory||'unknown'}
}
function absurdlyOldUnplanned(i,now=Date.now()){
  if(category(i)!=='unplanned')return false;
  const start=parseTime(i?.outageStartTime),etr=parseTime(i?.estimatedRestorationTime);
  const startOld=start!==null&&now-start>14*DAY;
  const etrOld=etr!==null&&now-etr>2*DAY;
  return startOld&&etrOld;
}
function setWpHealth(extra){
  const el=document.getElementById('wpFeed');
  if(!el||!extra)return;
  if(!el.textContent.includes(extra))el.textContent=`${el.textContent} · ${extra}`;
}
function guard(){
  if(typeof feedData==='undefined'||!feedData||!Array.isArray(feedData.westernPower))return;
  const source=feedData.sources?.westernPower||{};
  const incoming=feedData.westernPower;
  let kept=incoming,suppressed=[],reason='';

  if(source.ok===false){
    suppressed=[...incoming];kept=[];reason='last-known outages hidden';
  }else if(source.ok===true){
    suppressed=incoming.filter(absurdlyOldUnplanned);
    if(suppressed.length)kept=incoming.filter(i=>!absurdlyOldUnplanned(i));
    reason=suppressed.length?`${suppressed.length} stale ArcGIS record${suppressed.length===1?'':'s'} suppressed`:'';
  }

  window.GRIDPULSESuppressedWp={at:new Date().toISOString(),reason,items:suppressed};
  if(kept.length!==incoming.length){
    feedData.westernPower=kept;
    try{renderWarnings?.()}catch{}
    try{plot?.()}catch{}
    try{typeof updateStatus==='function'&&updateStatus()}catch{}
  }
  if(reason)setTimeout(()=>setWpHealth(reason),0);
}
function wrapLoader(){
  if(wrapped||typeof loadFeeds!=='function')return;
  const base=loadFeeds;
  loadFeeds=async function(){const r=await base.apply(this,arguments);guard();return r};
  wrapped=true;
}
function boot(){
  wrapLoader();guard();
  setTimeout(()=>{wrapLoader();guard()},800);
  setTimeout(()=>guard(),2500);
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(guard,1000));
}
boot();
})();
