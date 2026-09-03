import {VERSION,REFRESH_MS,LAYER_DEFAULTS,FACILITY_DEFAULTS,ZONES,FACILITY_META} from './config.js';
import {$,$$,esc,perthTime,fmtDateTime,relativeTime,storageGet,storageSet,itemInZone,itemInMapBounds,sourceKey,wpCategory,itemKey,roadCategory,roadClosed,priorityScore,isPriority,pointInRing} from './utils.js';
import {loadFeeds,feedFreshness,loadWeather,weatherLabel,searchPlaces,loadRadarFrame} from './data.js';
import {loadFacility} from './facilities.js';
import {createMapController} from './map.js';

const state={
  feeds:{bom:[],emergency:[],westernPower:[],mainRoads:[],sources:{},updatedAt:null},
  feedFallback:false,feedError:null,weather:null,section:'live',liveFilter:'all',zone:'swin',
  layers:{...LAYER_DEFAULTS,...storageGet('waosV5Layers',{})},
  facilityPrefs:{...FACILITY_DEFAULTS,...storageGet('waosV5Facilities',{})},
  facilities:{police:[],fire:[],ambulance:[],hospital:[],wp:[]},facilityZone:{},facilityErrors:{},
  refreshing:false,selected:null
};
let mapCtl;

function toast(message,ms=3200){const el=$('toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add('hidden'),ms)}
function setPanelOpen(open){document.body.classList.toggle('panel-open',open)}
function clock(){const el=$('clock');if(el)el.textContent=perthTime(new Date())}clock();setInterval(clock,1000);
function nfmt(n){n=Number(n||0);if(n>=1000000)return`${(n/1000000).toFixed(1)}m`;if(n>=10000)return`${Math.round(n/1000)}k`;return n.toLocaleString('en-AU')}

function scopedFeeds(){
  const z=state.zone,f=state.feeds;
  return{
    bom:(f.bom||[]).filter(x=>itemInZone(x,z)),
    emergency:(f.emergency||[]).filter(x=>itemInZone(x,z)),
    westernPower:(f.westernPower||[]).filter(x=>itemInZone(x,z)),
    mainRoads:(f.mainRoads||[]).filter(x=>itemInZone(x,z))
  };
}
function allItems(scoped=scopedFeeds()){
  return[...scoped.emergency,...scoped.bom,...scoped.westernPower,...scoped.mainRoads].sort((a,b)=>priorityScore(b)-priorityScore(a));
}
function effectiveLayers(){
  if(state.section==='power')return{bom:false,ewa:false,wpUnplanned:state.layers.wpUnplanned,wpPlanned:state.layers.wpPlanned,mr:false,mrRoadworks:false};
  if(state.section==='warnings')return{bom:state.layers.bom,ewa:state.layers.ewa,wpUnplanned:false,wpPlanned:false,mr:false,mrRoadworks:false};
  if(state.section==='roads')return{bom:false,ewa:false,wpUnplanned:false,wpPlanned:false,mr:state.layers.mr,mrRoadworks:state.layers.mrRoadworks};
  if(state.section==='facilities')return{bom:false,ewa:false,wpUnplanned:false,wpPlanned:false,mr:false,mrRoadworks:false};
  return{...state.layers};
}
function visibleByLayer(item){
  const s=sourceKey(item);if(s==='bom')return state.layers.bom;if(s==='ewa')return state.layers.ewa;
  if(s==='wp')return wpCategory(item)==='planned'?state.layers.wpPlanned:state.layers.wpUnplanned;
  if(s==='mr')return roadCategory(item)==='roadworks'?state.layers.mrRoadworks:state.layers.mr;return true;
}
function typeInfo(item){
  const s=sourceKey(item);if(s==='ewa')return{cls:'ewa',label:'Emergency WA'};if(s==='bom')return{cls:'bom',label:'BOM warning'};
  if(s==='wp'){const p=wpCategory(item)==='planned';return{cls:p?'wp-p':'wp-u',label:p?'Planned power':'Unplanned power'}}
  return{cls:'mr',label:item.categoryLabel||'Main Roads'};
}
function itemTitle(item){return item.affectedArea&&sourceKey(item)==='wp'?item.affectedArea:item.title||item.location||'Operational item'}
function itemDescription(item){
  const s=sourceKey(item);if(s==='wp'){const c=item.customersImpacted!=null?`${nfmt(item.customersImpacted)} customers`:'Customer count unavailable';const r=item.estimatedRestorationTime?`${wpCategory(item)==='planned'?'Finish':'ETR'} ${fmtDateTime(item.estimatedRestorationTime)}`:'Restoration/finish estimate unavailable';return`${c} · ${r}`}
  if(s==='mr')return item.trafficImpact||[item.road,item.suburb].filter(Boolean).join(', ')||item.location||'Travel-map item';return item.description||item.area||'Open item for more information';
}
function itemTime(item){return item.updatedAt||item.published||item.outageStartTime||item.startTime||item.timeAdded||null}
function itemLink(item){const s=sourceKey(item);return item.link||(s==='wp'?'https://www.westernpower.com.au/faults-outages/power-outages/':s==='ewa'?'https://www.emergency.wa.gov.au/':s==='mr'?'https://travelmap.mainroads.wa.gov.au/Home/Map':'https://www.bom.gov.au/wa/warnings/')}
function cardHtml(item){
  const t=typeInfo(item),priority=isPriority(item),powerPriority=sourceKey(item)==='wp'&&wpCategory(item)==='unplanned';const when=itemTime(item);
  const meta=[];if(item.area)meta.push(item.area);if(item.incidentRef)meta.push(`Incident ${item.incidentRef}`);if(item.region)meta.push(item.region);if(item.road)meta.push(item.road);
  return`<article class="incident-card ${priority?'priority':''} ${powerPriority?'power-priority':''}" data-item-key="${esc(itemKey(item))}"><div class="card-top"><span class="type-badge ${t.cls}">${esc(t.label)}</span><time>${when?esc(relativeTime(when)):''}</time></div><h4>${esc(itemTitle(item))}</h4><p>${esc(itemDescription(item)).slice(0,220)}</p>${meta.length?`<div class="card-meta">${meta.slice(0,3).map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}</article>`
}
function bindCards(root,items){const byKey=new Map(items.map(x=>[itemKey(x),x]));$$('[data-item-key]',root).forEach(el=>el.onclick=()=>{const item=byKey.get(el.dataset.itemKey);if(item)openItem(item)})}

function renderMetrics(scoped){
  if(!state.feeds.updatedAt){$('metricPriority').textContent='--';$('metricCustomers').textContent='--';$('metricOutages').textContent='--';$('metricClosures').textContent='--';return}
  const unplanned=scoped.westernPower.filter(x=>wpCategory(x)==='unplanned'),customers=unplanned.reduce((a,x)=>a+Number(x.customersImpacted||0),0),closures=scoped.mainRoads.filter(roadClosed).length,priority=allItems(scoped).filter(isPriority).length;
  $('metricPriority').textContent=nfmt(priority);$('metricCustomers').textContent=nfmt(customers);$('metricOutages').textContent=nfmt(unplanned.length);$('metricClosures').textContent=nfmt(closures);
}
function renderLists(scoped){
  let live=allItems(scoped).filter(visibleByLayer);if(state.liveFilter==='priority')live=live.filter(isPriority);if(state.liveFilter==='nearby')live=live.filter(x=>itemInMapBounds(x,mapCtl.getBounds()));
  $('liveCount').textContent=live.length;$('incidentList').innerHTML=live.length?live.slice(0,180).map(cardHtml).join(''):'<div class="empty-state">No visible operational items for this view.</div>';bindCards($('incidentList'),live);
  const power=scoped.westernPower.sort((a,b)=>priorityScore(b)-priorityScore(a));$('powerList').innerHTML=power.length?power.slice(0,140).map(cardHtml).join(''):'<div class="empty-state">No Western Power outages in this zone.</div>';bindCards($('powerList'),power);
  const warnings=[...scoped.emergency,...scoped.bom].sort((a,b)=>priorityScore(b)-priorityScore(a));$('warningList').innerHTML=warnings.length?warnings.slice(0,120).map(cardHtml).join(''):'<div class="empty-state">No mapped warning items in this zone.</div>';bindCards($('warningList'),warnings);
  const roads=[...scoped.mainRoads].sort((a,b)=>priorityScore(b)-priorityScore(a));$('roadList').innerHTML=roads.length?roads.slice(0,160).map(cardHtml).join(''):'<div class="empty-state">No Main Roads items in this zone.</div>';bindCards($('roadList'),roads);
}
function renderSources(){
  const f=state.feeds.sources||{},rows=[['bom','BOM warnings'],['emergency','Emergency WA'],['westernPower','Western Power'],['mainRoads','Main Roads']],ready=!!state.feeds.updatedAt;
  $('sourceList').innerHTML=rows.map(([key,label])=>{const s=f[key];if(!ready&&!s)return`<div class="source-row"><i></i><div><b>${label}</b><span>Connecting…</span></div><strong>--</strong></div>`;const ok=!!s?.ok,count=s?.count??0,msg=ok?(key==='westernPower'?`${s.plannedCount??0} planned · ${s.unplannedCount??0} unplanned`:key==='mainRoads'&&s.failedLayers?`${s.failedLayers} layer(s) unavailable`:'Feed responding'):(s?.message||'Source unavailable');return`<div class="source-row ${ok?'good':'bad'}"><i></i><div><b>${label}</b><span>${esc(msg)}</span></div><strong>${count}</strong></div>`}).join('');
  const failures=rows.filter(([key])=>f[key]&&!f[key].ok).length,overall=$('overallStatus');overall.classList.remove('good','bad');if(!ready){overall.querySelector('b').textContent='Connecting';return}overall.classList.toggle('good',failures===0&&!state.feedFallback);overall.classList.toggle('bad',failures>=2);overall.querySelector('b').textContent=state.feedFallback?'Cached data':failures?`${failures} source issue${failures===1?'':'s'}`:'All core feeds live';
}
function renderFreshness(){const el=$('freshnessBadge');if(!state.feeds.updatedAt){el.className='map-freshness';el.textContent='Waiting for feeds';$('updatedAt').textContent='--';return}const fr=feedFreshness(state.feeds.updatedAt);el.className=`map-freshness ${fr.key}`;el.textContent=state.feedFallback?`LAST KNOWN · ${fr.label}`:fr.label;$('updatedAt').textContent=relativeTime(state.feeds.updatedAt)}
function renderLayerChecks(){$$('[data-layer]').forEach(x=>x.checked=!!state.layers[x.dataset.layer]);$$('[data-facility]').forEach(x=>x.checked=!!state.facilityPrefs[x.dataset.facility])}
function renderFacilityCounts(){for(const k of Object.keys(state.facilities)){const id=`facCount${k[0].toUpperCase()}${k.slice(1)}`,el=$(id);if(!el)continue;el.textContent=state.facilityErrors[k]?'ERR':state.facilities[k]?.length??'--'}}
function visibleFacilities(){const out=[];for(const [kind,on] of Object.entries(state.facilityPrefs)){if(on&&state.facilityZone[kind]===state.zone)out.push(...(state.facilities[kind]||[]))}return out}
function renderAll(){const scoped=scopedFeeds();renderMetrics(scoped);renderLists(scoped);renderSources();renderFreshness();renderLayerChecks();renderFacilityCounts();mapCtl.plotFeeds(scoped,effectiveLayers());mapCtl.renderFacilities(visibleFacilities())}

function openItem(item){
  state.selected=item;const t=typeInfo(item),s=sourceKey(item),grid=[];
  if(s==='wp'){grid.push(['Type',wpCategory(item)],['Customers',item.customersImpacted!=null?nfmt(item.customersImpacted):'Unavailable'],['Outage start',item.outageStartTime?fmtDateTime(item.outageStartTime):'Not supplied'],['Restoration / finish',item.estimatedRestorationTime?fmtDateTime(item.estimatedRestorationTime):'Not supplied'])}
  else if(s==='mr'){grid.push(['Category',item.categoryLabel||roadCategory(item)],['Road',item.road||'Not supplied'],['Suburb',item.suburb||'Not supplied'],['Updated',itemTime(item)?fmtDateTime(itemTime(item)):'Not supplied'])}
  else{grid.push(['Source',t.label],['Area',item.area||'See official source'],['Published',itemTime(item)?fmtDateTime(itemTime(item)):'Not supplied'],['Severity',item.severity||'Not supplied'])}
  $('detailContent').innerHTML=`<span class="detail-type">${esc(t.label)}</span><h3>${esc(itemTitle(item))}</h3><p class="detail-description">${esc(itemDescription(item))}</p><div class="detail-grid">${grid.map(([a,b])=>`<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')}</div><div class="detail-actions"><button type="button" id="detailFocus">Show on map</button><a href="${esc(itemLink(item))}" target="_blank" rel="noopener">Official source</a></div>`;$('detailSheet').classList.remove('hidden');$('detailFocus').onclick=()=>mapCtl.focusItem(itemKey(item));mapCtl.focusItem(itemKey(item));
}
function openFacility(f){
  const meta=FACILITY_META[f.kind]||FACILITY_META.fire;$('detailContent').innerHTML=`<span class="detail-type">${esc(meta.label)}</span><h3>${esc(f.name)}</h3><p class="detail-description">${esc(f.subtype||meta.label)}${f.address?` · ${esc(f.address)}`:''}</p><div class="detail-grid"><div><span>Reference source</span><b>${esc(f.source||meta.source)}</b></div><div><span>Location</span><b>${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}</b></div></div><p class="source-note">Facility locations are reference points only and do not indicate staffing, dispatch availability or operational status.</p><div class="detail-actions"><button type="button" id="detailFocus">Centre map</button><a href="${esc(f.verify||meta.verify)}" target="_blank" rel="noopener">Verify source</a></div>`;$('detailSheet').classList.remove('hidden');$('detailFocus').onclick=()=>mapCtl.setSelection(f.lat,f.lon,f.name);mapCtl.setSelection(f.lat,f.lon,f.name);
}
async function openPlace(label,lat,lon){
  mapCtl.setSelection(lat,lon,label);$('detailContent').innerHTML=`<span class="detail-type">Selected place</span><h3>${esc(label)}</h3><p class="detail-description" id="placeWeather">Loading local weather…</p><div class="detail-grid"><div><span>Latitude</span><b>${lat.toFixed(5)}</b></div><div><span>Longitude</span><b>${lon.toFixed(5)}</b></div></div>`;$('detailSheet').classList.remove('hidden');
  try{const d=await loadWeather(lat,lon,1),c=d.current;$('placeWeather').textContent=`${Math.round(c.temperature_2m)}°C · ${weatherLabel(c.weather_code)} · feels ${Math.round(c.apparent_temperature)}°C · wind ${Math.round(c.wind_speed_10m)} km/h · gusts ${Math.round(c.wind_gusts_10m)} km/h · rain ${Number(c.precipitation).toFixed(1)} mm.`}catch{$('placeWeather').textContent='Local weather unavailable.'}
}

async function refreshFeeds(silent=false){
  if(state.refreshing)return;state.refreshing=true;$('refreshBtn').disabled=true;$('refreshBtn').textContent='…';
  try{const result=await loadFeeds();state.feeds={bom:[],emergency:[],westernPower:[],mainRoads:[],sources:{},...result.data};state.feedFallback=result.fallback;state.feedError=result.error;renderAll();if(!silent)toast(result.fallback?'Live feeds unavailable — using last known data.':'Operational feeds refreshed.')}catch(e){state.feedError=e;renderSources();toast('Unable to load operational feeds and no cached snapshot is available.',5000)}finally{state.refreshing=false;$('refreshBtn').disabled=false;$('refreshBtn').textContent='↻'}
}
async function refreshWeather(){
  try{const d=await loadWeather();state.weather=d;const c=d.current;$('weatherTemp').textContent=`${Math.round(c.temperature_2m)}°`;$('weatherCondition').textContent=weatherLabel(c.weather_code);$('weatherFeels').textContent=`${Math.round(c.apparent_temperature)}°`;$('weatherWind').textContent=`${Math.round(c.wind_speed_10m)} km/h`;$('weatherGust').textContent=`${Math.round(c.wind_gusts_10m)} km/h`;$('weatherRain').textContent=`${Number(c.precipitation).toFixed(1)} mm`;$('forecast').innerHTML=d.daily.time.map((x,i)=>{const day=i===0?'Today':new Intl.DateTimeFormat('en-AU',{weekday:'short',timeZone:'Australia/Perth'}).format(new Date(`${x}T12:00:00+08:00`));return`<div class="forecast-day"><b>${day}</b><span>${weatherLabel(d.daily.weather_code[i])}</span><span>${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°</span><span>${Number(d.daily.precipitation_sum[i]).toFixed(1)} mm</span></div>`}).join('')}catch(e){$('weatherCondition').textContent='Weather unavailable';console.warn(e)}
}
async function loadSelectedFacilities(){
  const kinds=Object.keys(state.facilityPrefs).filter(k=>state.facilityPrefs[k]);if(!kinds.length){toast('Select at least one facility type first.');return}
  $('loadFacilitiesBtn').disabled=true;$('loadFacilitiesBtn').textContent='Loading selected facilities…';$('facilityStatus').textContent='Loading facility sources. Some public mapped sources can take several seconds.';
  for(const kind of kinds){const id=`facCount${kind[0].toUpperCase()}${kind.slice(1)}`,el=$(id);if(el)el.textContent='…';try{state.facilities[kind]=await loadFacility(kind,state.zone);state.facilityZone[kind]=state.zone;delete state.facilityErrors[kind]}catch(e){state.facilities[kind]=[];state.facilityZone[kind]=state.zone;state.facilityErrors[kind]=String(e?.message||e)}}
  $('loadFacilitiesBtn').disabled=false;$('loadFacilitiesBtn').textContent='Load selected facilities for this zone';$('facilityStatus').textContent='Facility locations loaded where sources were available. ERR means that source could not be reached; it does not mean there are zero facilities.';renderFacilityCounts();mapCtl.renderFacilities(visibleFacilities());
}

function switchSection(section){
  state.section=section;$$('.rail-btn').forEach(b=>b.classList.toggle('active',b.dataset.section===section));$$('.panel-view').forEach(v=>v.classList.toggle('active',v.dataset.view===section));const titles={live:['SWIN overview','Live operations'],power:['Electricity network','Western Power'],warnings:['Safety picture','Warnings & emergencies'],roads:['Transport network','Main Roads'],facilities:['Reference layer','Operational facilities'],weather:['Conditions','Weather'],sources:['Data quality','Sources & health']},t=titles[section]||titles.live;$('panelEyebrow').textContent=t[0];$('panelTitle').textContent=t[1];if(innerWidth<=860)setPanelOpen(true);renderAll()}
function setZone(id){state.zone=id in ZONES?id:'swin';$$('[data-zone]').forEach(b=>b.classList.toggle('active',b.dataset.zone===state.zone));$('zoneBadge').textContent=ZONES[state.zone].label;renderAll()}

function bindUi(){
  $$('.rail-btn').forEach(b=>b.onclick=()=>switchSection(b.dataset.section));$('refreshBtn').onclick=()=>{refreshFeeds();refreshWeather()};$('panelToggle').onclick=()=>setPanelOpen(!document.body.classList.contains('panel-open'));$('sheetHandle').onclick=()=>setPanelOpen(!document.body.classList.contains('panel-open'));$('detailClose').onclick=()=>{$('detailSheet').classList.add('hidden');state.selected=null};
  $$('[data-live-filter]').forEach(b=>b.onclick=()=>{state.liveFilter=b.dataset.liveFilter;$$('[data-live-filter]').forEach(x=>x.classList.toggle('active',x===b));renderLists(scopedFeeds())});
  $$('[data-layer]').forEach(x=>x.onchange=()=>{state.layers[x.dataset.layer]=x.checked;storageSet('waosV5Layers',state.layers);renderAll()});
  $$('[data-facility]').forEach(x=>x.onchange=()=>{state.facilityPrefs[x.dataset.facility]=x.checked;storageSet('waosV5Facilities',state.facilityPrefs);mapCtl.renderFacilities(visibleFacilities())});$('loadFacilitiesBtn').onclick=loadSelectedFacilities;
  $$('[data-zone]').forEach(b=>b.onclick=()=>mapCtl.setZone(b.dataset.zone,true));
  $$('.metric').forEach(b=>b.onclick=()=>{const m=b.dataset.metric;if(m==='customers'||m==='outages')switchSection('power');else if(m==='roads')switchSection('roads');else{switchSection('live');state.liveFilter='priority';$$('[data-live-filter]').forEach(x=>x.classList.toggle('active',x.dataset.liveFilter==='priority'));renderLists(scopedFeeds())}});
  $('basemapBtn').onclick=()=>$('basemapMenu').classList.toggle('hidden');$$('[data-basemap]').forEach(b=>b.onclick=()=>{mapCtl.setBasemap(b.dataset.basemap);$$('[data-basemap]').forEach(x=>x.classList.toggle('active',x===b));$('basemapMenu').classList.add('hidden')});
  $('locateBtn').onclick=()=>{if(!navigator.geolocation){toast('Location is not available in this browser.');return}navigator.geolocation.getCurrentPosition(p=>{const lat=p.coords.latitude,lon=p.coords.longitude;if(!pointInRing(lat,lon)){toast('Your current location is outside the indicative SWIN footprint.');return}openPlace('Your location',lat,lon)},()=>toast('Location permission was unavailable.'))};
  $('searchForm').onsubmit=async e=>{e.preventDefault();const q=$('searchInput').value.trim();if(q.length<3)return;const box=$('searchResults');box.classList.remove('hidden');box.innerHTML='<div class="empty-state">Searching…</div>';try{const rows=(await searchPlaces(q)).filter(x=>pointInRing(+x.lat,+x.lon));if(!rows.length){box.innerHTML='<div class="empty-state">No matching place found inside the SWIN.</div>';return}box.innerHTML=rows.map((x,i)=>`<button class="search-result" data-search-index="${i}" type="button"><b>${esc((x.display_name||'').split(',').slice(0,2).join(','))}</b><span>${esc(x.display_name||'')}</span></button>`).join('');$$('[data-search-index]',box).forEach(b=>b.onclick=()=>{const x=rows[+b.dataset.searchIndex];box.classList.add('hidden');openPlace(x.display_name,+x.lat,+x.lon)})}catch{box.innerHTML='<div class="empty-state">Place search is temporarily unavailable.</div>'}};
  $('radarToggle').onchange=async()=>{if(!$('radarToggle').checked){mapCtl.setRadar(null);return}try{const frame=await loadRadarFrame();mapCtl.setRadar(frame.path);toast('Latest radar frame loaded.')}catch{$('radarToggle').checked=false;toast('Radar is temporarily unavailable.')}};
  addEventListener('keydown',e=>{if(e.target?.matches?.('input,textarea'))return;const key=e.key.toLowerCase();if(key==='r')refreshFeeds();if(key==='1')switchSection('power');if(key==='2')switchSection('warnings');if(key==='3')switchSection('roads');if(key==='4')switchSection('facilities');if(key==='0')switchSection('live');if(key==='/'){e.preventDefault();$('searchInput').focus()}});
}

function initMap(){mapCtl=createMapController({onItemClick:openItem,onFacilityClick:openFacility,onMapClick:ll=>{if(pointInRing(ll.lat,ll.lng))openPlace('Selected map point',ll.lat,ll.lng)},onZoneChanged:setZone});mapCtl.fitSwin()}
async function boot(){
  initMap();bindUi();renderLayerChecks();setPanelOpen(innerWidth>860);await Promise.allSettled([refreshFeeds(true),refreshWeather()]);
  setInterval(()=>refreshFeeds(true),REFRESH_MS);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.feeds.updatedAt&&Date.now()-new Date(state.feeds.updatedAt).getTime()>REFRESH_MS)refreshFeeds(true)});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js?v='+VERSION).catch(e=>console.warn('Service worker unavailable',e));
  console.info(`WAOS ${VERSION} clean rebuild loaded`);
}
boot();
