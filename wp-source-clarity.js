(function(){
'use strict';

const OBS_KEY='waOpsWpObservedV3';
const MAX_EVENTS=20;
const MAX_RECORDS=80;

function safe(v=''){return typeof esc==='function'?esc(v):String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function titleCase(v=''){return String(v).trim().toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}
function parseDate(v){
  if(v===null||v===undefined||v==='')return null;
  if(v instanceof Date)return Number.isNaN(v.getTime())?null:v;
  if(typeof v==='number'&&Number.isFinite(v))return new Date(v);
  const s=String(v).trim();
  if(/^\d{10,13}$/.test(s))return new Date(Number(s));
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if(m){
    let h=Number(m[4]);
    const ap=m[6].toUpperCase();
    if(ap==='PM'&&h!==12)h+=12;
    if(ap==='AM'&&h===12)h=0;
    const d=new Date(`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}T${String(h).padStart(2,'0')}:${m[5]}:00+08:00`);
    return Number.isNaN(d.getTime())?null:d;
  }
  const d=new Date(s);
  return Number.isNaN(d.getTime())?null:d;
}
function fmtDate(v){
  const d=parseDate(v);
  if(!d)return String(v||'Not supplied');
  return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d);
}
function areas(i){
  const names=String(i?.affectedArea||'').split(',').map(x=>titleCase(x)).filter(Boolean);
  const counts=String(i?.affectedAreaNoCustomers||'').split(',').map(x=>{const s=String(x).trim();if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:null});
  return names.map((name,index)=>({name,count:counts[index]??null}));
}
function areaText(i){
  const a=areas(i).map(x=>x.name);
  if(!a.length)return'';
  if(a.length===1)return a[0];
  if(a.length===2)return`${a[0]} and ${a[1]}`;
  return`${a.slice(0,-1).join(', ')} and ${a[a.length-1]}`;
}
function areaBreakdown(i){
  const a=areas(i).filter(x=>x.count!==null);
  if(!a.length)return'';
  return `<div class="wpfeedareas">${a.map(x=>`<span><strong>${safe(x.name)}</strong>${Number(x.count).toLocaleString('en-AU')} shown</span>`).join('')}</div>`;
}
function customerCount(i){
  if(i?.customersImpacted===null||i?.customersImpacted===undefined||i?.customersImpacted==='')return null;
  const n=Number(i.customersImpacted);
  return Number.isFinite(n)?n:null;
}
function feedChecked(){return feedData?.sources?.westernPower?.fetchedAt||feedData?.updatedAt||new Date().toISOString()}
function loadObserved(){try{const v=JSON.parse(localStorage.getItem(OBS_KEY)||'{}');return v&&typeof v==='object'?v:{}}catch{return{}}}
function saveObserved(store){
  try{
    const trimmed=Object.entries(store).sort((a,b)=>String(b[1]?.updatedAt||'').localeCompare(String(a[1]?.updatedAt||''))).slice(0,MAX_RECORDS);
    localStorage.setItem(OBS_KEY,JSON.stringify(Object.fromEntries(trimmed)));
  }catch{}
}
function observationKey(i){return String(i?.id||i?.incidentRef||i?.enarNumber||i?.affectedArea||'outage')}
function currentState(i){return{customers:customerCount(i),etr:String(i?.estimatedRestorationTime||''),areas:areas(i)}}
function observe(i){
  const store=loadObserved(),key=observationKey(i),now=feedChecked(),state=currentState(i);
  let rec=store[key];
  if(!rec){rec={last:state,events:[],updatedAt:now};store[key]=rec;saveObserved(store);return rec.events}
  const prev=rec.last||{};
  const add=(text,kind)=>{rec.events.unshift({text,kind,at:now});rec.events=rec.events.slice(0,MAX_EVENTS)};
  if(prev.customers!==null&&prev.customers!==undefined&&state.customers!==null&&state.customers!==prev.customers){
    add(`Public feed customer count changed from ${Number(prev.customers).toLocaleString('en-AU')} to ${Number(state.customers).toLocaleString('en-AU')}.`,'customers');
  }
  if(prev.etr&&state.etr&&prev.etr!==state.etr){
    add(`Public feed estimated restoration changed from ${fmtDate(prev.etr)} to ${fmtDate(state.etr)}.`,'etr');
  }
  const oldAreas=new Map((prev.areas||[]).map(x=>[x.name,x.count]));
  for(const a of state.areas){
    const before=oldAreas.get(a.name);
    if(before!==undefined&&before!==null&&a.count!==null&&before!==a.count){
      add(`${a.name} public-feed count changed from ${Number(before).toLocaleString('en-AU')} to ${Number(a.count).toLocaleString('en-AU')}.`,'area');
    }
  }
  rec.last=state;rec.updatedAt=now;store[key]=rec;saveObserved(store);return rec.events||[];
}
function observedHtml(i){
  const events=observe(i);
  if(!events.length)return'';
  return `<details class="wpobserve"><summary>WAOS observed changes <span>${events.length}</span></summary><div class="wpobserve-list">${events.slice(0,8).map(e=>`<div><strong>${safe(e.text)}</strong><small>WAOS observed ${safe(fmtDate(e.at))}</small></div>`).join('')}</div><p>These timestamps show when WAOS noticed a public-feed change. They are not Western Power's official outage timeline.</p></details>`;
}
function sourceNote(){return '<p class="wpfeednote">Public ArcGIS feed snapshot. Western Power\'s official outage page may update separately and is the source of truth for customer-facing outage details.</p>'}
function styles(){
  if(document.getElementById('wpSourceClarityStyle'))return;
  const s=document.createElement('style');s.id='wpSourceClarityStyle';
  s.textContent=`.wpfeednote{margin:7px 0!important;padding:6px 7px!important;border:1px solid #3c3c3c;border-radius:7px;background:#141414;color:#a9a9a9!important;font-size:8px!important;line-height:1.4!important}.wpsourcegrid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:7px 0}.wpsourcegrid>div{border:1px solid #343434;border-radius:7px;background:#151515;padding:6px}.wpsourcegrid span{display:block;color:#8f8f8f;font-size:7.5px;text-transform:uppercase;letter-spacing:.45px}.wpsourcegrid strong{display:block;color:#efefef;font-size:9px;margin-top:2px}.wppubliccount{margin:7px 0!important;color:#f5f5f5!important;font-size:10px!important}.wppubliccount small{display:block;color:#8f8f8f;font-size:7.5px;font-weight:500;margin-top:2px}.wpfeedareas{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;margin:6px 0}.wpfeedareas span{display:flex;justify-content:space-between;gap:5px;border:1px solid #303030;border-radius:6px;padding:4px 5px;color:#aaa;font-size:7.5px}.wpfeedareas strong{color:#ddd;font-size:7.5px}.wpobserve{margin-top:7px;border-top:1px solid #343434;padding-top:6px}.wpobserve>summary{cursor:pointer;color:#ddd;font-size:9px;font-weight:900}.wpobserve>summary span{float:right;color:#f97316}.wpobserve-list{display:grid;gap:5px;margin-top:6px}.wpobserve-list>div{border-left:2px solid #f97316;padding-left:6px}.wpobserve-list strong{display:block;color:#ddd;font-size:8px;line-height:1.35}.wpobserve-list small{display:block;color:#858585;font-size:7px;margin-top:2px}.wpobserve>p{font-size:7px!important;color:#777!important;line-height:1.35!important;margin:6px 0 0!important}.leaflet-popup-content .wpfeednote{font-size:8px!important}.leaflet-popup-content .wpfeedareas,.leaflet-popup-content .wpobserve{display:none}@media(max-width:760px){.wpsourcegrid{grid-template-columns:1fr}.wpfeedareas{grid-template-columns:1fr}}`;
  document.head.appendChild(s);
}
function card(i){
  const category=wpCategory(i),label=category==='planned'?'PLANNED':category==='unplanned'?'UNPLANNED':'OUTAGE';
  const count=customerCount(i),area=areaText(i),etr=i.estimatedRestorationTime?fmtDate(i.estimatedRestorationTime):'',start=i.outageStartTime?fmtDate(i.outageStartTime):'',checked=fmtDate(feedChecked());
  const incident=i.incidentRef?`Incident ${safe(i.incidentRef)}`:'Western Power outage';
  const restorationLabel=category==='planned'?'Planned finish':'Estimated restoration';
  return `<article class="warning wp ${category} ${hasMapData(i)?'map-focusable':''}" data-map-key="${safe(itemKey(i))}"><div class="wphead"><span class="wpbadge ${category}">${label}</span>${i.outageType?`<span class="wpcode">Code ${safe(i.outageType)}</span>`:''}</div><h3>${safe(titleCase(i.affectedArea)||i.title||'Western Power outage')}</h3>${sourceNote()}${etr?`<div class="wpdetail"><span>${restorationLabel} · public feed</span><strong>${safe(etr)}</strong></div>`:''}<div class="wpsourcegrid"><div><span>Outage start</span><strong>${safe(start||'Not supplied')}</strong></div><div><span>Public feed checked</span><strong>${safe(checked)}</strong></div></div>${count!==null?`<p class="wppubliccount"><strong>${count.toLocaleString('en-AU')} customer${count===1?'':'s'} currently shown affected</strong><small>Western Power public ArcGIS feed value</small></p>`:''}${area?`<p class="wpareas">${safe(area)}</p>`:''}${areaBreakdown(i)}${observedHtml(i)}<div class="meta"><span>${incident}</span><span>Public feed</span></div><a href="${safe(i.link||'https://www.westernpower.com.au/faults-outages/power-outages/')}" target="_blank" rel="noopener">Open official outage page</a></article>`;
}
function popup(i){
  const category=wpCategory(i),label=category==='planned'?'PLANNED':category==='unplanned'?'UNPLANNED':'OUTAGE',count=customerCount(i),etr=i.estimatedRestorationTime?fmtDate(i.estimatedRestorationTime):'',start=i.outageStartTime?fmtDate(i.outageStartTime):'',checked=fmtDate(feedChecked()),area=areaText(i);
  observe(i);
  return `<strong>${label}: ${safe(titleCase(i.affectedArea)||'Western Power outage')}</strong>${etr?`<br><strong>${category==='planned'?'Planned finish':'Estimated restoration'}:</strong> ${safe(etr)} <small>(public feed)</small>`:''}${count!==null?`<br><strong>${count.toLocaleString('en-AU')} customer${count===1?'':'s'} currently shown affected</strong> <small>(public feed)</small>`:''}${area?`<br>${safe(area)}`:''}${start?`<br>Outage start: ${safe(start)}`:''}<br>Public feed checked: ${safe(checked)}<br><small>Official outage page may differ and is the customer-facing source of truth.</small>${i.incidentRef?`<br>Incident: ${safe(i.incidentRef)}`:''}<br><a href="${safe(i.link||'https://www.westernpower.com.au/faults-outages/power-outages/')}" target="_blank">Open official outage page</a>`;
}
function apply(){
  if(typeof wpCard!=='function'||typeof plotOutages!=='function'||typeof renderWarnings!=='function'||typeof plot!=='function'){setTimeout(apply,100);return}
  styles();
  wpCard=card;
  plotOutages=function(){
    plannedOutageLayer.clearLayers();unplannedOutageLayer.clearLayers();unknownOutageLayer.clearLayers();let plotted=0;
    for(const i of feedData.westernPower||[]){
      if(!i.geometry)continue;
      const category=wpCategory(i),color=category==='planned'?COLORS.wpPlanned:category==='unplanned'?COLORS.wpUnplanned:COLORS.wpUnknown,target=category==='planned'?plannedOutageLayer:category==='unplanned'?unplannedOutageLayer:unknownOutageLayer;
      const content=popup(i);
      try{const l=L.geoJSON(i.geometry,{style:{color,weight:category==='unplanned'?3:2,fillColor:color,fillOpacity:category==='planned'?.16:category==='unplanned'?.27:.12}}).bindPopup(content).addTo(target);registerMapItem(i,l,content);plotted++}catch(e){console.warn('Unable to plot Western Power geometry',e)}
    }
    return plotted;
  };
  if(Array.isArray(feedData?.westernPower)){renderWarnings();plot()}
  console.info('WAOS Western Power source-clarity layer loaded');
}
setTimeout(apply,120);
})();
