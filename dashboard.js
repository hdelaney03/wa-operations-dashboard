const PERTH={lat:-31.9523,lon:115.8613};
const WORKER='https://wa-operations-dashboard-new.haidenp10.workers.dev';
let map,selectedMarker,warningLayer,outageLayer;
let feedData={bom:[],emergency:[],westernPower:[],sources:{}};
let activeFilter='all';
const $=id=>document.getElementById(id);

const codes={0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Fog',48:'Fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',80:'Rain showers',81:'Rain showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Severe thunderstorm'};

function wx(c){return codes[c]||'Conditions'}
function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function ptime(opts){return new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',...opts}).format(new Date())}
function fmt(v){
  if(v===null||v===undefined||v==='')return 'Time not supplied';
  let input=v;
  if(typeof v==='string'&&/^\d{10,13}$/.test(v.trim()))input=Number(v);
  const d=new Date(input);
  return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(d);
}
function weatherURL(lat,lon,days=7){return `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Australia%2FPerth&forecast_days=${days}`}
async function getWeather(lat,lon,days=7){const r=await fetch(weatherURL(lat,lon,days),{cache:'no-store'});if(!r.ok)throw new Error(`Weather HTTP ${r.status}`);return r.json()}

function clock(){$('clock').textContent=ptime({hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}
clock();setInterval(clock,1000);

async function loadPerth(){
  $('weatherDot').className='dot warn';$('weatherFeed').textContent='Refreshing...';
  try{
    const d=await getWeather(PERTH.lat,PERTH.lon),c=d.current;
    $('temp').textContent=`${Math.round(c.temperature_2m)}°`;
    $('topTemp').textContent=`${Math.round(c.temperature_2m)}°C`;
    $('condition').textContent=wx(c.weather_code);
    $('feels').textContent=`${Math.round(c.apparent_temperature)}°`;
    $('wind').textContent=`${Math.round(c.wind_speed_10m)} km/h`;
    $('gusts').textContent=`${Math.round(c.wind_gusts_10m)} km/h`;
    $('rain').textContent=`${Number(c.precipitation).toFixed(1)} mm`;
    $('weatherFeed').textContent='Live via Open-Meteo';$('weatherDot').className='dot good';
    $('forecast').innerHTML=d.daily.time.map((x,i)=>{
      const day=i===0?'Today':new Intl.DateTimeFormat('en-AU',{weekday:'short'}).format(new Date(x+'T12:00:00+08:00'));
      return `<div class="day"><strong>${day}</strong><span class="desc">${esc(wx(d.daily.weather_code[i]))} · rain ${d.daily.precipitation_sum[i]} mm</span><strong>${Math.round(d.daily.temperature_2m_max[i])}° / ${Math.round(d.daily.temperature_2m_min[i])}°</strong></div>`;
    }).join('');
  }catch(e){
    console.error(e);$('weatherDot').className='dot bad';$('weatherFeed').textContent='Unavailable';$('condition').textContent='Weather unavailable';$('topTemp').textContent='ERR';
  }
}

async function pointWeather(lat,lon,label){
  $('selectedTitle').textContent=label;$('selectedWeather').textContent='Loading...';
  try{
    const d=await getWeather(lat,lon,1),c=d.current;
    $('selectedWeather').textContent=`${Math.round(c.temperature_2m)}°C, ${wx(c.weather_code)}. Feels ${Math.round(c.apparent_temperature)}°C. Wind ${Math.round(c.wind_speed_10m)} km/h, gusts ${Math.round(c.wind_gusts_10m)} km/h. Rain ${Number(c.precipitation).toFixed(1)} mm.`;
    return c;
  }catch{$('selectedWeather').textContent='Unable to load weather for this point.'}
}

function initMap(){
  if(typeof L==='undefined'){$('mapStatus').textContent='Map library unavailable';return}
  map=L.map('map').setView([PERTH.lat,PERTH.lon],9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  L.marker([PERTH.lat,PERTH.lon]).addTo(map).bindPopup('<strong>Perth</strong>');
  warningLayer=L.layerGroup().addTo(map);
  outageLayer=L.layerGroup().addTo(map);
  map.on('click',async e=>{
    if(selectedMarker)selectedMarker.remove();
    selectedMarker=L.marker([e.latlng.lat,e.latlng.lng]).addTo(map);
    const c=await pointWeather(e.latlng.lat,e.latlng.lng,`${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
    if(c)selectedMarker.bindPopup(`<strong>Selected point</strong><br>${Math.round(c.temperature_2m)}°C · ${esc(wx(c.weather_code))}`).openPopup();
  });
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{
    if(b.dataset.view==='perth')map.setView([PERTH.lat,PERTH.lon],11);
    if(b.dataset.view==='metro')map.setView([PERTH.lat,PERTH.lon],9);
    if(b.dataset.view==='wa')map.setView([-26.3,121.2],5);
  });
  $('locate').onclick=()=>navigator.geolocation?.getCurrentPosition(async p=>{
    const lat=p.coords.latitude,lon=p.coords.longitude;
    map.setView([lat,lon],13);
    if(selectedMarker)selectedMarker.remove();
    selectedMarker=L.marker([lat,lon]).addTo(map).bindPopup('Your location').openPopup();
    await pointWeather(lat,lon,'Your location');
  },()=>{$('mapStatus').textContent='Location permission unavailable'});
}

function src(item){
  const s=String(item.source||'').toLowerCase();
  if(s.includes('western power'))return 'wp';
  if(s.includes('emergency'))return 'ewa';
  return 'bom';
}

function wpCategory(i){
  if(i?.outageCategory)return i.outageCategory;
  if(i?.planned===true)return 'planned';
  if(i?.planned===false)return 'unplanned';
  return 'unknown';
}

function sourceStatus(key,dot,text,count){
  const arrays={bom:feedData.bom,emergency:feedData.emergency,westernPower:feedData.westernPower};
  const arr=arrays[key]||[];
  const s=feedData.sources?.[key];
  $(count).textContent=arr.length;
  if(s?.ok){
    $(dot).className='dot good';
    if(key==='westernPower'){
      const planned=s.plannedCount??arr.filter(x=>wpCategory(x)==='planned').length;
      const unplanned=s.unplannedCount??arr.filter(x=>wpCategory(x)==='unplanned').length;
      const unknown=s.unknownCount??arr.filter(x=>wpCategory(x)==='unknown').length;
      $(text).textContent=`${planned} planned · ${unplanned} unplanned${unknown?` · ${unknown} unknown`:''}`;
    }else{
      $(text).textContent=`Live · ${arr.length} item${arr.length===1?'':'s'}`;
    }
  }else{
    $(dot).className='dot bad';$(text).textContent=s?.message||'Feed unavailable';
  }
}

function wpCard(i){
  const category=wpCategory(i);
  const label=category==='planned'?'PLANNED':category==='unplanned'?'UNPLANNED':'TYPE UNKNOWN';
  const customers=i.customersImpacted!==null&&i.customersImpacted!==undefined?`${Number(i.customersImpacted).toLocaleString('en-AU')} customers`:'Customer count unavailable';
  const restoration=i.estimatedRestorationTime?`${category==='planned'?'Planned finish':'Est. restoration'} ${fmt(i.estimatedRestorationTime)}`:'End/restoration estimate unavailable';
  const incident=i.incidentRef?`Incident ${esc(i.incidentRef)}`:'Western Power outage';
  return `<article class="warning wp ${category}">
    <div class="wphead"><span class="wpbadge ${category}">${label}</span>${i.outageType?`<span class="wpcode">Code ${esc(i.outageType)}</span>`:''}</div>
    <h3>${esc(i.affectedArea||i.title||'Western Power outage')}</h3>
    <p>${esc(customers)} · ${esc(restoration)}</p>
    <div class="meta"><span>${incident}</span><span>${i.outageStartTime?esc(fmt(i.outageStartTime)):category==='planned'?'Upcoming':'Current'}</span></div>
    <a href="${esc(i.link||'https://www.westernpower.com.au/faults-outages/power-outages/')}" target="_blank" rel="noopener">Open official outage map</a>
  </article>`;
}

function warningCard(i){
  const type=src(i);
  return `<article class="warning ${type==='ewa'?'ewa':''}">
    <h3>${esc(i.title)}</h3>
    ${i.area?`<p><strong>${esc(i.area)}</strong></p>`:''}
    ${i.description?`<p>${esc(i.description).slice(0,260)}${i.description.length>260?'…':''}</p>`:''}
    <div class="meta"><span>${type==='ewa'?'Emergency WA':'BOM'}${i.severity?` · ${esc(i.severity)}`:''}</span><span>${esc(fmt(i.published))}</span></div>
    ${i.link?`<a href="${esc(i.link)}" target="_blank" rel="noopener">Open official item</a>`:''}
  </article>`;
}

function sortedWp(items){
  const rank={unplanned:0,unknown:1,planned:2};
  return [...items].sort((a,b)=>(rank[wpCategory(a)]??9)-(rank[wpCategory(b)]??9));
}

function renderWarnings(){
  const bom=feedData.bom||[],ewa=feedData.emergency||[],wp=sortedWp(feedData.westernPower||[]);
  let items=[...ewa,...wp.filter(x=>wpCategory(x)==='unplanned'),...bom,...wp.filter(x=>wpCategory(x)!=='unplanned')];
  if(activeFilter==='bom')items=bom;
  if(activeFilter==='ewa')items=ewa;
  if(activeFilter==='wp')items=wp;
  if(activeFilter==='wp-planned')items=wp.filter(x=>wpCategory(x)==='planned');
  if(activeFilter==='wp-unplanned')items=wp.filter(x=>wpCategory(x)==='unplanned');
  if(!items.length){$('warnings').innerHTML='<div class="empty">No items are currently returned for this filter. Check the feed status above.</div>';return}
  $('warnings').innerHTML=items.slice(0,150).map(i=>src(i)==='wp'?wpCard(i):warningCard(i)).join('');
}

function valid(p){return Array.isArray(p)&&p.length>=2&&Number.isFinite(+p[0])&&Number.isFinite(+p[1])}

function plotWarnings(){
  warningLayer.clearLayers();
  let plotted=0;
  for(const i of [...feedData.bom,...feedData.emergency]){
    const ewa=src(i)==='ewa',color=ewa?'#d93642':'#1877b8';
    const popup=`<strong>${esc(i.title)}</strong><br>${ewa?'Emergency WA':'BOM'}${i.area?`<br>${esc(i.area)}`:''}${i.link?`<br><a href="${esc(i.link)}" target="_blank">Official source</a>`:''}`;
    if(valid(i.point)){
      L.circleMarker([+i.point[0],+i.point[1]],{radius:8,color:'#fff',weight:2,fillColor:color,fillOpacity:1}).bindPopup(popup).addTo(warningLayer);
      plotted++;
    }
    const polygons=Array.isArray(i.polygons)&&i.polygons.length?i.polygons:(Array.isArray(i.polygon)?[i.polygon]:[]);
    for(const polygon of polygons){
      const pts=Array.isArray(polygon)?polygon.filter(valid).map(p=>[+p[0],+p[1]]):[];
      if(pts.length>=3){L.polygon(pts,{color,weight:2,fillColor:color,fillOpacity:.16}).bindPopup(popup).addTo(warningLayer);plotted++}
    }
  }
  return plotted;
}

function plotOutages(){
  outageLayer.clearLayers();
  let plotted=0;
  for(const i of feedData.westernPower||[]){
    if(!i.geometry)continue;
    const category=wpCategory(i);
    const color=category==='planned'?'#eab308':category==='unplanned'?'#c2410c':'#64748b';
    const customers=i.customersImpacted!==null&&i.customersImpacted!==undefined?`${Number(i.customersImpacted).toLocaleString('en-AU')} customers impacted`:'Customer count unavailable';
    const label=category==='planned'?'PLANNED':category==='unplanned'?'UNPLANNED':'TYPE UNKNOWN';
    const popup=`<strong>${label}: ${esc(i.affectedArea||'Western Power outage')}</strong><br>${esc(customers)}${i.incidentRef?`<br>Incident: ${esc(i.incidentRef)}`:''}${i.outageStartTime?`<br>Start: ${esc(fmt(i.outageStartTime))}`:''}${i.estimatedRestorationTime?`<br>${category==='planned'?'Finish':'Est. restoration'}: ${esc(fmt(i.estimatedRestorationTime))}`:''}<br><a href="${esc(i.link)}" target="_blank">Western Power outage map</a>`;
    try{
      L.geoJSON(i.geometry,{style:{color,weight:category==='unplanned'?3:2,fillColor:color,fillOpacity:category==='planned'?.12:category==='unplanned'?.23:.12}}).bindPopup(popup).addTo(outageLayer);
      plotted++;
    }catch(e){console.warn('Unable to plot Western Power geometry',e)}
  }
  return plotted;
}

function plot(){
  if(!warningLayer||!outageLayer)return;
  const warningShapes=plotWarnings();
  const outageShapes=plotOutages();
  const total=(feedData.bom?.length||0)+(feedData.emergency?.length||0)+(feedData.westernPower?.length||0);
  const planned=(feedData.westernPower||[]).filter(x=>wpCategory(x)==='planned').length;
  const unplanned=(feedData.westernPower||[]).filter(x=>wpCategory(x)==='unplanned').length;
  $('mapStatus').textContent=`${total} live items · WP ${unplanned} unplanned / ${planned} planned · ${warningShapes} warning shapes`;
}

async function loadFeeds(){
  ['bomDot','ewaDot','wpDot'].forEach(id=>$(id).className='dot warn');
  $('bomFeed').textContent=$('ewaFeed').textContent=$('wpFeed').textContent='Connecting to Cloudflare...';
  try{
    const r=await fetch(`${WORKER}/api/feeds`,{cache:'no-store'});
    if(!r.ok)throw new Error(`Cloudflare HTTP ${r.status}`);
    feedData=await r.json();
    feedData.bom=Array.isArray(feedData.bom)?feedData.bom:[];
    feedData.emergency=Array.isArray(feedData.emergency)?feedData.emergency:[];
    feedData.westernPower=Array.isArray(feedData.westernPower)?feedData.westernPower:[];
    feedData.sources=feedData.sources||{};
    sourceStatus('bom','bomDot','bomFeed','bomCount');
    sourceStatus('emergency','ewaDot','ewaFeed','ewaCount');
    sourceStatus('westernPower','wpDot','wpFeed','wpCount');
    const total=feedData.bom.length+feedData.emergency.length+feedData.westernPower.length;
    $('warningCount').textContent=total;
    $('feedAge').textContent=feedData.updatedAt?`Updated ${fmt(feedData.updatedAt)}`:'No update time';
    renderWarnings();plot();
  }catch(e){
    console.error(e);
    ['bomDot','ewaDot','wpDot'].forEach(id=>$(id).className='dot bad');
    $('bomFeed').textContent=$('ewaFeed').textContent=$('wpFeed').textContent='Cloudflare backend unreachable';
    $('warningCount').textContent='ERR';
    $('warnings').innerHTML=`<div class="empty">Cloudflare connection failed: ${esc(e.message)}.<br><a href="${WORKER}/api/feeds" target="_blank">Open feed endpoint</a></div>`;
    $('mapStatus').textContent='Operational feeds unavailable';
  }
}

document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{
  activeFilter=b.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));
  renderWarnings();
});

async function refresh(){
  await Promise.allSettled([loadPerth(),loadFeeds()]);
  $('last').textContent=ptime({hour:'2-digit',minute:'2-digit',hour12:false});
}
$('refresh').onclick=refresh;
initMap();
refresh();
setInterval(refresh,5*60*1000);
