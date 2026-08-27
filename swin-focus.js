(function(){
'use strict';

const VERSION='20260827-1700';
const SWIN_RING=[
  [-27.55,114.05],[-27.45,114.55],[-28.35,115.70],[-29.10,116.25],
  [-29.80,116.60],[-30.50,117.20],[-30.60,118.50],[-30.80,119.60],
  [-30.45,121.00],[-30.45,121.75],[-31.40,122.00],[-31.55,120.60],
  [-31.85,119.40],[-32.45,118.75],[-33.20,120.20],[-33.75,120.10],
  [-34.10,119.75],[-34.55,119.50],[-35.10,118.35],[-35.15,117.60],
  [-35.05,116.90],[-34.70,116.20],[-34.35,115.20],[-33.85,114.90],
  [-33.25,115.10],[-32.60,115.60],[-31.95,115.65],[-31.25,115.40],
  [-30.55,115.00],[-29.85,114.80],[-29.10,114.85],[-28.35,114.50]
];
const VIEWS={
  swin:{label:'SWIN',fit:true},
  metro:{label:'Metro',lat:-31.95,lon:115.86,z:9},
  midwest:{label:'Mid West',lat:-28.78,lon:114.62,z:7},
  wheatbelt:{label:'Wheatbelt',lat:-31.65,lon:117.35,z:7},
  goldfields:{label:'Goldfields',lat:-30.75,lon:121.47,z:7},
  southwest:{label:'South West',lat:-33.25,lon:115.75,z:7},
  greatsouthern:{label:'Great Southern',lat:-34.55,lon:117.70,z:7}
};
const WEATHER_REGIONS=[
  {id:'kalbarri',name:'Kalbarri',group:'Mid West North',lat:-27.71,lon:114.16},
  {id:'geraldton',name:'Geraldton',group:'Mid West',lat:-28.78,lon:114.61},
  {id:'perth',name:'Perth',group:'Metro',lat:-31.95,lon:115.86},
  {id:'northam',name:'Northam',group:'Wheatbelt West',lat:-31.65,lon:116.67},
  {id:'merredin',name:'Merredin',group:'Wheatbelt East',lat:-31.48,lon:118.28},
  {id:'kalgoorlie',name:'Kalgoorlie',group:'Goldfields',lat:-30.75,lon:121.47},
  {id:'bunbury',name:'Bunbury',group:'South West',lat:-33.33,lon:115.64},
  {id:'albany',name:'Albany',group:'Great Southern',lat:-35.03,lon:117.88}
];
const SWIN_TEXT=/(kalbarri|geraldton|dongara|jurien|moora|lancelin|perth|joondalup|midland|fremantle|rockingham|mandurah|pinjarra|bunbury|busselton|margaret river|augusta|bridgetown|manjimup|walpole|denmark|albany|bremer bay|ravensthorpe|jerramungup|northam|york|beverley|narrogin|wagin|katanning|merredin|southern cross|coolgardie|kalgoorlie|wheatbelt|lower west|south west|south coastal|great southern|central west|goldfields|perth metropolitan|metro|southern gascoyne)/i;
const OUTSIDE_TEXT=/(kimberley|pilbara|north interior|eucla|karratha|port hedland|broome|derby|kununurra|exmouth|newman|meekatharra|laverton|leonora|esperance)/i;
const SWIN_FIRE=/(central west|lower west|south west|south coastal|great southern|central wheat belt|inland central west|gascoyne coast|goldfields|perth)/i;

let boundaryLayer=null,maskLayer=null,weatherTimer=null,searchMarker=null,scoping=false;
const q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)];
const safe=s=>typeof esc==='function'?esc(s):String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function pointInRing(lat,lon,ring=SWIN_RING){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const yi=ring[i][0],xi=ring[i][1],yj=ring[j][0],xj=ring[j][1];
    if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi))inside=!inside;
  }
  return inside;
}
function orient(a,b,c){return (b.lon-a.lon)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lon-a.lon)}
function onSeg(a,b,c){return Math.min(a.lon,c.lon)-1e-9<=b.lon&&b.lon<=Math.max(a.lon,c.lon)+1e-9&&Math.min(a.lat,c.lat)-1e-9<=b.lat&&b.lat<=Math.max(a.lat,c.lat)+1e-9}
function segX(a,b,c,d){const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b),e=1e-9;if(((o1>e&&o2<-e)||(o1<-e&&o2>e))&&((o3>e&&o4<-e)||(o3<-e&&o4>e)))return true;if(Math.abs(o1)<=e&&onSeg(a,c,b))return true;if(Math.abs(o2)<=e&&onSeg(a,d,b))return true;if(Math.abs(o3)<=e&&onSeg(c,a,d))return true;if(Math.abs(o4)<=e&&onSeg(c,b,d))return true;return false}
const EDGES=SWIN_RING.map((p,i)=>[{lat:p[0],lon:p[1]},{lat:SWIN_RING[(i+1)%SWIN_RING.length][0],lon:SWIN_RING[(i+1)%SWIN_RING.length][1]}]);
function geoLines(coords,out=[]){if(!Array.isArray(coords))return out;if(coords.length&&Array.isArray(coords[0])&&coords[0].length>=2&&Number.isFinite(+coords[0][0])&&Number.isFinite(+coords[0][1])){out.push(coords.map(p=>({lat:+p[1],lon:+p[0]})));return out}coords.forEach(x=>geoLines(x,out));return out}
function latLonLines(coords,out=[]){if(!Array.isArray(coords))return out;if(coords.length&&Array.isArray(coords[0])&&coords[0].length>=2&&Number.isFinite(+coords[0][0])&&Number.isFinite(+coords[0][1])){out.push(coords.map(p=>({lat:+p[0],lon:+p[1]})));return out}coords.forEach(x=>latLonLines(x,out));return out}
function itemLines(i){const out=[];if(i?.geometry?.coordinates)geoLines(i.geometry.coordinates,out);if(Array.isArray(i?.polygons))latLonLines(i.polygons,out);if(Array.isArray(i?.polygon))latLonLines([i.polygon],out);if(Array.isArray(i?.point)&&i.point.length>=2)out.push([{lat:+i.point[0],lon:+i.point[1]}]);return out.filter(a=>a.every(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)))}
function ringContains(line,p){let inside=false;if(line.length<3)return false;for(let i=0,j=line.length-1;i<line.length;j=i++){const a=line[i],b=line[j];if(((a.lat>p.lat)!==(b.lat>p.lat))&&(p.lon<(b.lon-a.lon)*(p.lat-a.lat)/((b.lat-a.lat)||1e-12)+a.lon))inside=!inside}return inside}
function geomIntersects(i){const lines=itemLines(i);for(const line of lines){for(const p of line)if(pointInRing(p.lat,p.lon))return true;for(let n=0;n<line.length-1;n++)for(const [a,b] of EDGES)if(segX(line[n],line[n+1],a,b))return true;if(line.length>=3)for(const p of SWIN_RING)if(ringContains(line,{lat:p[0],lon:p[1]}))return true}return false}
function typeOf(i){const s=String(i?.source||'').toLowerCase();return s.includes('western')?'wp':s.includes('emergency')?'ewa':s.includes('main roads')?'mr':'bom'}
function itemText(i){return `${i?.title||''} ${i?.area||''} ${i?.description||''} ${i?.affectedArea||''} ${i?.location||''} ${i?.road||''} ${i?.suburb||''} ${i?.region||''}`}
function relevant(i){
  if(typeOf(i)==='wp')return true;
  if(geomIntersects(i))return true;
  const t=itemText(i);
  if(SWIN_TEXT.test(t))return true;
  if(OUTSIDE_TEXT.test(t))return false;
  return false;
}
function rawClone(d){return{...d,bom:[...(d?.bom||[])],emergency:[...(d?.emergency||[])],westernPower:[...(d?.westernPower||[])],mainRoads:[...(d?.mainRoads||[])]}}
function scopedFrom(d){return{...d,bom:(d?.bom||[]).filter(relevant),emergency:(d?.emergency||[]).filter(relevant),westernPower:(d?.westernPower||[]).filter(relevant),mainRoads:(d?.mainRoads||[]).filter(relevant)}}
function counts(){const d=typeof feedData!=='undefined'?feedData:{},wp=d.westernPower||[];return{bom:(d.bom||[]).length,ewa:(d.emergency||[]).length,wpU:wp.filter(x=>(typeof wpCategory==='function'?wpCategory(x):x.outageCategory)!=='planned').length,wpP:wp.filter(x=>(typeof wpCategory==='function'?wpCategory(x):x.outageCategory)==='planned').length,mr:(d.mainRoads||[]).length,total:(d.bom||[]).length+(d.emergency||[]).length+wp.length+(d.mainRoads||[]).length}}
function scopeCurrent(){
  if(scoping||typeof feedData==='undefined'||!feedData)return;scoping=true;
  try{
    const raw=rawClone(feedData);window.WAOSRawFeedData=raw;
    const s=scopedFrom(raw);feedData.bom=s.bom;feedData.emergency=s.emergency;feedData.westernPower=s.westernPower;feedData.mainRoads=s.mainRoads;
    try{renderWarnings?.()}catch{}
    try{plot?.()}catch{}
    updateStatus();scopeEnvironment();
  }finally{scoping=false}
}
function wrapFeedLoader(){
  if(typeof loadFeeds!=='function'||loadFeeds.__swinWrapped)return;
  const base=loadFeeds;
  const wrapped=async function(){const r=await base.apply(this,arguments);scopeCurrent();return r};wrapped.__swinWrapped=true;loadFeeds=wrapped;
}

function style(){if(q('#swinCoreStyle'))return;const s=document.createElement('style');s.id='swinCoreStyle';s.textContent=`
body.swin-core .mapwrap{box-shadow:inset 0 0 0 1px #f9731648}
.swin-core-badge{display:inline-flex;align-items:center;gap:5px;border:1px solid #7c3f1d;border-radius:999px;background:#24150d;color:#fdba74;padding:3px 7px;font-size:8px;font-weight:900;margin-top:5px}.swin-core-badge:before{content:'';width:6px;height:6px;border-radius:50%;background:#f97316;box-shadow:0 0 0 2px #7c2d12}
.swin-overview{border:1px solid #4b3325;background:linear-gradient(180deg,#17120f,#111);border-radius:12px;padding:10px}.swin-overview-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px}.swin-overview-head strong{font-size:12px;color:#f5f5f5}.swin-overview-head span{font-size:8px;color:#9ca3af}.swin-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.swin-kpi{border:1px solid #2d2d2d;border-radius:9px;background:#151515;padding:7px}.swin-kpi span{display:block;color:#999;font-size:8px}.swin-kpi b{display:block;color:#f4f4f5;font-size:15px;margin-top:2px}.swin-kpi.orange b{color:#fb923c}.swin-kpi.red b{color:#fca5a5}.swin-kpi.yellow b{color:#fde047}.swin-kpi.blue b{color:#93c5fd}.swin-scope-note{font-size:8px;color:#858585;line-height:1.4;margin-top:7px}
.swin-weather-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.swin-weather-card{border:1px solid #303030;border-radius:10px;background:#141414;padding:8px;cursor:pointer}.swin-weather-card:hover{border-color:#5a3a24}.swin-weather-card .region{font-size:7.5px;color:#8f8f8f;text-transform:uppercase;letter-spacing:.05em}.swin-weather-card strong{display:block;color:#f5f5f5;font-size:10px;margin-top:2px}.swin-weather-now{display:flex;align-items:end;justify-content:space-between;gap:8px;margin-top:6px}.swin-weather-temp{font-size:20px;font-weight:900;color:#fff}.swin-weather-cond{font-size:8px;color:#b7b7b7;text-align:right}.swin-weather-meta{font-size:7.5px;color:#888;margin-top:5px;line-height:1.4}.swin-weather-alert{color:#fdba74!important}
body.swin-core .weather-old-hidden{display:none!important}.swin-legend-key{display:flex!important}.swin-map-note{font-size:8px;color:#888;margin-top:5px}
@media(max-width:680px){.swin-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.swin-weather-grid{grid-template-columns:1fr}}
`;document.head.appendChild(s)}

function injectOverview(){
  if(q('#swinOpsOverview'))return;
  const live=q('#liveIncidentsHeading')?.closest('.ops-section');if(!live)return;
  const sec=document.createElement('section');sec.id='swinOpsOverview';sec.className='ops-section';sec.innerHTML=`<div class="swin-overview"><div class="swin-overview-head"><div><strong>SWIN operational picture</strong><span>Western Power network footprint only</span></div><b class="swin-core-badge">SWIN</b></div><div class="swin-kpis"><div class="swin-kpi red"><span>Emergency WA</span><b id="swinKpiEwa">--</b></div><div class="swin-kpi yellow"><span>BOM warnings</span><b id="swinKpiBom">--</b></div><div class="swin-kpi orange"><span>Unplanned power</span><b id="swinKpiWpU">--</b></div><div class="swin-kpi"><span>Planned power</span><b id="swinKpiWpP">--</b></div><div class="swin-kpi blue"><span>Main Roads</span><b id="swinKpiMr">--</b></div><div class="swin-kpi"><span>Total live items</span><b id="swinKpiTotal">--</b></div></div><div class="swin-scope-note">All operational feeds on this page are scoped to items mapped within, crossing, or clearly referring to the Western Power SWIN footprint. Boundary is indicative for situational awareness.</div></div>`;
  live.insertAdjacentElement('beforebegin',sec);
}
function injectWeather(){
  const details=qa('.ops-panel details.fold').find(d=>/Perth weather/i.test(d.querySelector(':scope > summary')?.textContent||''));if(!details)return;
  const summary=details.querySelector(':scope > summary');if(summary)summary.innerHTML='SWIN weather overview <span class="foldhint">8 work regions</span>';
  const content=details.querySelector(':scope > .foldcontent');if(!content)return;
  if(!q('#swinWeatherGrid'))content.insertAdjacentHTML('afterbegin','<div class="swin-weather-grid" id="swinWeatherGrid"><div class="swin-weather-card"><strong>Loading SWIN regional weather…</strong></div></div><div class="swin-map-note">Regional weather uses representative centres across the SWIN. Select a card to jump the map to that work region.</div>');
  [...content.children].forEach(ch=>{if(ch.id==='swinWeatherGrid'||ch.classList.contains('swin-map-note'))return;if(ch.classList.contains('weather')||ch.tagName==='DETAILS'||ch.style?.height)ch.classList.add('weather-old-hidden')});
}
function rebrand(){
  document.body.classList.add('swin-core');document.title='WAOS — SWIN Operations';
  const desc=q('meta[name="description"]');if(desc)desc.content='WAOS — Western Power SWIN operational dashboard for outages, warnings, weather, roads, fire and environmental conditions.';
  const mapcard=q('.mapcard');if(mapcard){const st=mapcard.querySelector('strong');if(st)st.textContent='Western Power SWIN';if(!q('#swinHeaderBadge'))mapcard.insertAdjacentHTML('beforeend','<b class="swin-core-badge" id="swinHeaderBadge">NETWORK OPERATIONS</b>')}
  const liveLabel=qa('.topstats .stat span').find(x=>/Live items/i.test(x.textContent));if(liveLabel)liveLabel.textContent='SWIN items';
  const mapWrap=q('.mapwrap');mapWrap?.setAttribute('aria-label','Western Power SWIN operational map');
}
function mapUI(){
  const box=q('.mapbuttons');if(box){box.innerHTML=Object.entries(VIEWS).map(([id,v])=>`<button type="button" data-swin-view="${id}">${v.label}</button>`).join('');qa('[data-swin-view]').forEach(b=>b.onclick=()=>showView(b.dataset.swinView))}
  const input=q('#mapSearchInput');if(input){input.placeholder='Search address or place within the SWIN';input.setAttribute('aria-label','Search address or place within the Western Power SWIN')}
  const grid=q('.layergrid');q('#swinFocusToggle')?.closest('label')?.remove();q('#swinPreset')?.remove();
  const hint=q('.layerhint');if(hint)hint.textContent='All operational layers are permanently scoped to the Western Power SWIN. Layer choices only control what is visible inside the network area.';
  const allPreset=q('[data-layer-preset="all"]');if(allPreset)allPreset.textContent='All SWIN';
  const legend=q('.legend');if(legend&&!q('#swinPermanentLegend'))legend.insertAdjacentHTML('beforeend','<div class="swin-legend-key" id="swinPermanentLegend"><i class="swatch" style="background:#f97316"></i>SWIN operational boundary</div>');
  if(grid)grid.setAttribute('aria-label','SWIN operational map layers');
}
function ensureBoundary(){
  if(typeof map==='undefined'||!map||typeof L==='undefined')return;
  if(!map.getPane('swinMaskPane')){const p=map.createPane('swinMaskPane');p.style.zIndex='590';p.style.pointerEvents='none'}
  if(!map.getPane('swinBoundaryPane')){const p=map.createPane('swinBoundaryPane');p.style.zIndex='610'}
  if(!maskLayer){const outer=[[-85,-180],[-85,180],[85,180],[85,-180]];maskLayer=L.polygon([outer,SWIN_RING],{pane:'swinMaskPane',stroke:false,fill:true,fillColor:'#050505',fillOpacity:.78,fillRule:'evenodd',interactive:false}).addTo(map)}
  if(!boundaryLayer){boundaryLayer=L.polygon(SWIN_RING,{pane:'swinBoundaryPane',color:'#f97316',weight:2.6,opacity:.98,fill:false,dashArray:'9 6'}).addTo(map);boundaryLayer.bindTooltip('Western Power SWIN operational footprint — indicative',{sticky:true});boundaryLayer.bindPopup('<strong>Western Power SWIN operational footprint</strong><br>WAOS uses an indicative footprint for operational filtering. Western Power states the SWIN spans more than 255,000 km² from Kalbarri to Albany/Bremer Bay and east to Kalgoorlie.<br><br><a href="https://www.westernpower.com.au/about/what-we-do/regulation/access-arrangements/" target="_blank" rel="noopener">Western Power SWIN description</a><br><a href="https://www.erawa.com.au/licensing/electricity-licensing/licence-holders/western-power-edl1-etl2" target="_blank" rel="noopener">ERA licensed-area maps</a>')}
  map.setMaxBounds([[-36.0,113.2],[-26.6,122.7]]);map.options.maxBoundsViscosity=.35;
}
function showView(id){if(typeof map==='undefined'||!map)return;ensureBoundary();const v=VIEWS[id]||VIEWS.swin;if(v.fit&&boundaryLayer){map.fitBounds(boundaryLayer.getBounds(),{padding:[24,24],maxZoom:7,animate:true});return}map.setView([v.lat,v.lon],v.z,{animate:true})}
function bindSearch(){
  const form=q('#mapSearch'),input=q('#mapSearchInput'),status=q('#mapSearchStatus');if(!form||!input||form.dataset.swinSearch==='1')return;form.dataset.swinSearch='1';
  const show=(m,bad=false)=>{if(!status)return;status.textContent=m;status.style.display='block';status.style.background=bad?'#7f1d1dee':'#15191ef2';clearTimeout(show.t);show.t=setTimeout(()=>status.style.display='none',6000)};
  form.addEventListener('submit',async e=>{
    e.preventDefault();e.stopImmediatePropagation();const text=input.value.trim();if(text.length<3){show('Enter at least 3 characters.',true);return}show('Searching within the SWIN…');
    try{const u=new URL('https://nominatim.openstreetmap.org/search');u.searchParams.set('q',text+', Western Australia, Australia');u.searchParams.set('format','jsonv2');u.searchParams.set('limit','8');u.searchParams.set('countrycodes','au');u.searchParams.set('addressdetails','1');u.searchParams.set('viewbox','113.2,-26.6,122.7,-36.0');const r=await fetch(u,{headers:{Accept:'application/json','Accept-Language':'en-AU'}});if(!r.ok)throw Error('search '+r.status);const d=await r.json();const hit=(Array.isArray(d)?d:[]).find(x=>pointInRing(+x.lat,+x.lon));if(!hit){show('No matching address or place found inside the SWIN footprint.',true);return}const lat=+hit.lat,lon=+hit.lon;if(searchMarker&&map.hasLayer(searchMarker))map.removeLayer(searchMarker);searchMarker=L.marker([lat,lon]).addTo(map).bindPopup(`<strong>${safe(hit.display_name||text)}</strong><br>SWIN search result`).openPopup();map.setView([lat,lon],16,{animate:true});if(typeof pointWeather==='function')await pointWeather(lat,lon,hit.display_name||text);show('Found within SWIN: '+(hit.display_name||text))}catch(err){console.error(err);show('SWIN address search unavailable right now.',true)}
  },true);
  const locate=q('#locate');if(locate)locate.onclick=()=>navigator.geolocation?.getCurrentPosition(async p=>{const lat=p.coords.latitude,lon=p.coords.longitude;if(!pointInRing(lat,lon)){show('Your current location is outside the SWIN operational footprint.',true);return}map.setView([lat,lon],13);if(typeof selectedMarker!=='undefined'&&selectedMarker)selectedMarker.remove();selectedMarker=L.marker([lat,lon]).addTo(map).bindPopup('Your location').openPopup();if(typeof pointWeather==='function')await pointWeather(lat,lon,'Your location')},()=>show('Location permission unavailable.',true));
}

function condition(code){try{return typeof wx==='function'?wx(code):'Conditions'}catch{return'Conditions'}}
async function weatherOne(rg){const u=new URL('https://api.open-meteo.com/v1/forecast');u.searchParams.set('latitude',rg.lat);u.searchParams.set('longitude',rg.lon);u.searchParams.set('current','temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m');u.searchParams.set('daily','temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code');u.searchParams.set('forecast_days','1');u.searchParams.set('timezone','Australia/Perth');const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error('weather '+r.status);const d=await r.json();return{...rg,current:d.current||{},daily:d.daily||{}}}
async function loadSwinWeather(){const grid=q('#swinWeatherGrid');if(!grid)return;const results=await Promise.allSettled(WEATHER_REGIONS.map(weatherOne));const data=results.filter(x=>x.status==='fulfilled').map(x=>x.value);grid.innerHTML=data.length?data.map(x=>{const c=x.current||{},gust=Number(c.wind_gusts_10m||0),rain=Number(x.daily?.precipitation_sum?.[0]||0),alert=gust>=70||rain>=20;return `<div class="swin-weather-card" data-weather-region="${x.id}"><div class="region">${safe(x.group)}</div><strong>${safe(x.name)}</strong><div class="swin-weather-now"><div class="swin-weather-temp">${Math.round(c.temperature_2m)}°</div><div class="swin-weather-cond ${alert?'swin-weather-alert':''}">${safe(condition(c.weather_code))}</div></div><div class="swin-weather-meta">Feels ${Math.round(c.apparent_temperature)}° · Wind ${Math.round(c.wind_speed_10m)} km/h · Gust ${Math.round(gust)} km/h<br>Today ${Math.round(x.daily.temperature_2m_min?.[0])}–${Math.round(x.daily.temperature_2m_max?.[0])}° · Rain ${rain.toFixed(1)} mm</div></div>`}).join(''):'<div class="swin-weather-card"><strong>Regional weather unavailable</strong></div>';qa('[data-weather-region]').forEach(n=>n.onclick=()=>{const rg=WEATHER_REGIONS.find(x=>x.id===n.dataset.weatherRegion);if(rg)map.setView([rg.lat,rg.lon],9,{animate:true})});if(data.length){const temps=data.map(x=>+x.current.temperature_2m).filter(Number.isFinite);if(temps.length){const t=q('#topTemp');if(t)t.textContent=`${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°C`}}}
function startWeather(){loadSwinWeather();clearInterval(weatherTimer);weatherTimer=setInterval(loadSwinWeather,15*60*1000)}

function updateStatus(){
  const c=counts();const set=(id,v)=>{const n=q(id);if(n)n.textContent=v};set('#swinKpiEwa',c.ewa);set('#swinKpiBom',c.bom);set('#swinKpiWpU',c.wpU);set('#swinKpiWpP',c.wpP);set('#swinKpiMr',c.mr);set('#swinKpiTotal',c.total);set('#warningCount',c.total);
  set('#bomCount',c.bom);set('#ewaCount',c.ewa);set('#wpCount',c.wpU+c.wpP);set('#mrCount',c.mr);
  const bf=q('#bomFeed');if(bf)bf.textContent=`SWIN scoped · ${c.bom} item${c.bom===1?'':'s'}`;const ef=q('#ewaFeed');if(ef)ef.textContent=`SWIN scoped · ${c.ewa} item${c.ewa===1?'':'s'}`;const wf=q('#wpFeed');if(wf)wf.textContent=`SWIN · ${c.wpP} planned · ${c.wpU} unplanned`;const mf=q('#mrFeed');if(mf)mf.textContent=`SWIN scoped · ${c.mr} travel item${c.mr===1?'':'s'}`;
  const ms=q('#mapStatus');if(ms)ms.textContent=`SWIN · ${c.total} operational items · ${c.wpU} unplanned outages · ${c.ewa+c.bom} warnings`;
}
function overrideMapStatus(){if(typeof updateMapStatus!=='function'||updateMapStatus.__swin)return;const fn=function(){updateStatus()};fn.__swin=true;updateMapStatus=fn}

function scopeEnvironment(){
  const env=q('#v3Environment');if(!env)return;
  const airHead=qa('#v3Environment .v3-env-card-head strong').find(x=>/Perth air quality/i.test(x.textContent));if(airHead)airHead.textContent='SWIN air quality';
  const eqHead=qa('#v3Environment .v3-env-card-head strong').find(x=>/Recent WA earthquakes/i.test(x.textContent));if(eqHead)eqHead.textContent='Recent SWIN earthquakes';
  const tfb=(typeof feedData!=='undefined'?(feedData.emergency||[]):[]).filter(i=>/total fire ban/i.test(itemText(i)));const tv=q('#v3TfbValue'),tl=q('#v3TfbLabel');if(tv&&tl){tv.textContent=tfb.length?`${tfb.length} SWIN notice${tfb.length===1?'':'s'}`:'Verify official status';tl.textContent=tfb.length?tfb.slice(0,2).map(x=>x.title).join(' · '):'No SWIN Total Fire Ban notice is present in the scoped CAP feed. Verify Emergency WA.'}
  qa('#v3Environment .v3-fdr-item').forEach(n=>{n.style.display=SWIN_FIRE.test(n.textContent)?'':'none'});
  const fl=q('#v3FdrLabel');if(fl&&!/SWIN/i.test(fl.textContent))fl.textContent='Fire danger ratings shown for SWIN-relevant districts where available. Verify BOM for official ratings.';
  scopeQuakes();loadSwinAir();
}
let airStamp=0;
async function loadSwinAir(){const now=Date.now();if(now-airStamp<10*60*1000)return;airStamp=now;const v=q('#v3AqiValue'),l=q('#v3AqiLabel'),m=q('#v3AqiMeta');if(!v||!l)return;try{const sample=[WEATHER_REGIONS[1],WEATHER_REGIONS[2],WEATHER_REGIONS[3],WEATHER_REGIONS[5],WEATHER_REGIONS[6],WEATHER_REGIONS[7]];const rows=await Promise.all(sample.map(async rg=>{const u=new URL('https://air-quality-api.open-meteo.com/v1/air-quality');u.searchParams.set('latitude',rg.lat);u.searchParams.set('longitude',rg.lon);u.searchParams.set('current','us_aqi,pm2_5,pm10');u.searchParams.set('timezone','Australia/Perth');const r=await fetch(u);if(!r.ok)throw Error('aqi '+r.status);return{rg,c:(await r.json()).current||{}}}));rows.sort((a,b)=>(+b.c.us_aqi||0)-(+a.c.us_aqi||0));const w=rows[0],n=Math.round(+w.c.us_aqi);v.textContent=`${n} · worst sampled (${w.rg.name})`;l.textContent='Modeled Open-Meteo/CAMS AQI sampled across representative SWIN work regions. DWER remains the official WA monitoring source.';if(m)m.innerHTML=rows.slice(0,4).map(x=>`<span class="v3-chip info"><i></i>${safe(x.rg.name)} ${Math.round(+x.c.us_aqi)}</span>`).join('')}catch{l.textContent='SWIN air-quality sampling unavailable. Use DWER for official WA monitoring.'}}
function scopeQuakes(){const V=window.WAOpsV3;if(!V||!Array.isArray(V.quakes))return;V.quakes=V.quakes.filter(e=>pointInRing(+e.lat,+e.lon));const list=q('#v3EqList');if(list){list.innerHTML=V.quakes.length?V.quakes.slice(0,12).map(e=>`<div class="v3-eq-item" data-swin-eq="${safe(e.id)}"><div><strong><i class="v3-eq-dot"></i>M${Number(e.mag).toFixed(1)} · ${safe(e.place)}</strong><span>${new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(e.time))} · depth ${Number(e.depth||0).toFixed(0)} km</span></div></div>`).join(''):'<div class="v3-empty-note">No magnitude 2.0+ earthquakes found inside the SWIN footprint in the current 7-day catalogue.</div>';qa('[data-swin-eq]').forEach(n=>n.onclick=()=>{const e=V.quakes.find(x=>x.id===n.dataset.swinEq);if(e)map.setView([e.lat,e.lon],9,{animate:true})})}if(V.quakeLayer&&typeof L!=='undefined'){V.quakeLayer.clearLayers();for(const e of V.quakes)L.circleMarker([e.lat,e.lon],{radius:Math.max(5,Math.min(12,4+e.mag*1.4)),color:'#fff',weight:1.5,fillColor:'#a855f7',fillOpacity:.86}).bindPopup(`<strong>Earthquake M${e.mag.toFixed(1)}</strong><br>${safe(e.place)}<br>Depth ${Number(e.depth||0).toFixed(0)} km`).addTo(V.quakeLayer)}}

function reorder(){const panel=q('.panel-content'),overview=q('#swinOpsOverview');if(!panel||!overview)return;const head=q('.ops-head');if(head&&overview.previousElementSibling!==head)head.insertAdjacentElement('afterend',overview);const weather=qa('.ops-section').find(s=>/SWIN weather overview/i.test(s.textContent||''));const live=q('#liveIncidentsHeading')?.closest('.ops-section');if(weather&&live&&weather.previousElementSibling!==overview)overview.insertAdjacentElement('afterend',weather)}
function boot(){
  if(typeof map==='undefined'||!map||typeof feedData==='undefined'){setTimeout(boot,150);return}
  style();rebrand();injectOverview();injectWeather();mapUI();ensureBoundary();bindSearch();wrapFeedLoader();overrideMapStatus();reorder();scopeCurrent();startWeather();
  if(!location.hash)showView('swin');
  setTimeout(scopeCurrent,1000);setTimeout(scopeEnvironment,2500);setInterval(()=>{updateStatus();scopeEnvironment()},60*1000);
  console.info('WAOS SWIN-only operations mode loaded',VERSION);
}
window.WAOpsSWIN={ring:SWIN_RING,pointInRing,relevant,scopeCurrent,showView,weatherRegions:WEATHER_REGIONS};
boot();
})();
