(function(){
'use strict';
const DAY=24*60*60*1000;
const MAX_LIVE_AGE=28*DAY;
let wrappedLoader=false;
let renderBase=null,plotOutagesBase=null;

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
function over28Days(i,now=Date.now()){
  const start=parseTime(i?.outageStartTime);
  return start!==null&&start<=now&&(now-start)>MAX_LIVE_AGE;
}
function currentWp(items){return (Array.isArray(items)?items:[]).filter(i=>!over28Days(i))}
function hiddenWp(items){return (Array.isArray(items)?items:[]).filter(over28Days)}
function setWpHealth(reason,visible){
  const feed=document.getElementById('wpFeed'),count=document.getElementById('wpCount');
  if(count&&Number.isFinite(visible))count.textContent=String(visible);
  if(!feed||!reason)return;
  const base=feed.textContent.replace(/\s·\s(?:\d+ WP records? older than 28 days hidden|last-known outages hidden).*$/,'');
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
    suppressed=hiddenWp(incoming);kept=currentWp(incoming);
    if(suppressed.length)reason=`${suppressed.length} WP record${suppressed.length===1?'':'s'} older than 28 days hidden`;
  }
  window.GRIDPULSESuppressedWp={
    at:new Date().toISOString(),
    policy:'Western Power incidents with an outage start more than 28 days ago are excluded from live views.',
    reason,
    items:suppressed.map(i=>({id:i.id,incidentRef:i.incidentRef,affectedArea:i.affectedArea,outageStartTime:i.outageStartTime,estimatedRestorationTime:i.estimatedRestorationTime}))
  };
  if(kept.length!==incoming.length){feedData.westernPower=kept;rerender()}
  if(reason)setWpHealth(reason,kept.length);
}
function withCurrentWp(fn,ctx,args){
  if(typeof feedData==='undefined'||!feedData||!Array.isArray(feedData.westernPower))return fn.apply(ctx,args);
  const raw=feedData.westernPower;
  const source=feedData.sources?.westernPower||{};
  const visible=source.ok===false?[]:currentWp(raw);
  if(visible.length===raw.length)return fn.apply(ctx,args);
  feedData.westernPower=visible;
  try{return fn.apply(ctx,args)}finally{feedData.westernPower=raw}
}
function installRenderGuards(){
  if(typeof renderWarnings==='function'&&!renderWarnings.__gridpulse28){
    renderBase=renderWarnings;
    const wrapped=function(){return withCurrentWp(renderBase,this,arguments)};
    wrapped.__gridpulse28=true;wrapped.__gridpulseBase=renderBase;renderWarnings=wrapped;
  }
  if(typeof plotOutages==='function'&&!plotOutages.__gridpulse28){
    plotOutagesBase=plotOutages;
    const wrapped=function(){return withCurrentWp(plotOutagesBase,this,arguments)};
    wrapped.__gridpulse28=true;wrapped.__gridpulseBase=plotOutagesBase;plotOutages=wrapped;
  }
}
function wrapLoader(){
  if(wrappedLoader||typeof loadFeeds!=='function')return;
  const base=loadFeeds;
  loadFeeds=async function(){const r=await base.apply(this,arguments);installRenderGuards();guard();return r};
  loadFeeds.__gridpulse28=true;wrappedLoader=true;
}
function boot(){
  installRenderGuards();wrapLoader();guard();
  [250,600,1200,2200,4000,7000,11000].forEach(ms=>setTimeout(()=>{installRenderGuards();wrapLoader();guard()},ms));
  setInterval(()=>{installRenderGuards();guard()},5000);
  document.getElementById('refresh')?.addEventListener('click',()=>setTimeout(()=>{installRenderGuards();guard()},1000));
}
boot();
})();
