(function(){
'use strict';

const PREF_KEY='waOpsOperationalFacilitiesV2';
const CACHE_KEY='waOpsOperationalFacilitiesCacheV2';
const CACHE_MS=24*60*60*1000;
const WP_CACHE_MS=30*24*60*60*1000;
const SWIN_RING=[[-27.55,114.05],[-27.45,114.55],[-28.35,115.70],[-29.10,116.25],[-29.80,116.60],[-30.50,117.20],[-30.60,118.50],[-30.80,119.60],[-30.45,121.00],[-30.45,121.75],[-31.40,122.00],[-31.55,120.60],[-31.85,119.40],[-32.45,118.75],[-33.20,120.20],[-33.75,120.10],[-34.10,119.75],[-34.55,119.50],[-35.10,118.35],[-35.15,117.60],[-35.05,116.90],[-34.70,116.20],[-34.35,115.20],[-33.85,114.90],[-33.25,115.10],[-32.60,115.60],[-31.95,115.65],[-31.25,115.40],[-30.55,115.00],[-29.85,114.80],[-29.10,114.85],[-28.35,114.50]];
const ZONE_BBOXES=[
  '-31.30,113.95,-27.30,119.25',
  '-32.75,115.45,-31.25,116.35',
  '-35.30,114.60,-32.70,120.35',
  '-33.30,116.15,-30.15,122.25'
];
const META={
  police:{label:'Police stations',short:'P',colour:'#2563eb',source:'OpenStreetMap mapped police facilities; verify with WA Police',verify:'https://www.police.wa.gov.au/'},
  fire:{label:'Fire / DFES stations',short:'F',colour:'#dc2626',source:'WA Government DFES Stations (DFES-023)',verify:'https://catalogue.data.wa.gov.au/dataset/dfes-stations'},
  ambulance:{label:'Ambulance stations',short:'A',colour:'#ef4444',source:'OpenStreetMap mapped ambulance stations; verify with St John WA',verify:'https://www.stjohnwa.com.au/about-us/contact-us'},
  hospital:{label:'Emergency hospitals',short:'H',colour:'#ffffff',text:'#b91c1c',source:'WA Health Hospitals (HEALTH-001), Emergency Department Reporting',verify:'https://catalogue.data.wa.gov.au/dataset/health-establishments'},
  wp:{label:'Western Power depots',short:'WP',colour:'#f97316',source:'Publicly documented Western Power work locations, geocoded from published addresses',verify:'https://www.westernpower.com.au/'}
};
const DFES_URL='https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Infrastructure_and_Utilities/MapServer/33/query?where=1%3D1&outFields=objectid%2Cdisplaynam%2Ctype&returnGeometry=true&outSR=4326&f=geojson';
const HEALTH_URL='https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Health/MapServer/7/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson';
const OVERPASS=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
const WP_PUBLIC=[
  {name:'South Metro Depot / Boyli Mia',address:'114 Ayres Road, Forrestdale WA 6112'},
  {name:'Vasse Depot',address:'19 Ostler Drive, Vasse WA 6280'},
  {name:'Albany Depot / Kinjarling Pindjarri',address:'27-31 Chester Pass Road, Orana WA 6330'},
  {name:'Picton work location',address:'1757 Boyanup-Picton Road, Picton WA 6229'},
  {name:'Northam work location',address:'York Road, Northam WA 6401'},
  {name:'Narrogin work location',address:'55 Booth Street, Narrogin WA 6312'},
  {name:'Merredin work location',address:'Great Eastern Highway and Combes Drive, Merredin WA 6415'},
  {name:'Geraldton work location',address:'Eighth Avenue, Utakarra WA 6530'},
  {name:'Three Springs work location',address:'Perenjori Road, Three Springs WA 6519'}
];

let prefs={police:false,fire:false,ambulance:false,hospital:false,wp:false};
let cache={};
let facilities={police:[],fire:[],ambulance:[],hospital:[],wp:[]};
let errors={};
let layer=null;
try{prefs={...prefs,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch{}
try{cache=JSON.parse(localStorage.getItem(CACHE_KEY)||'{}')||{}}catch{cache={}}

const q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function inSwin(lat,lon){let inside=false;for(let i=0,j=SWIN_RING.length-1;i<SWIN_RING.length;j=i++){const yi=SWIN_RING[i][0],xi=SWIN_RING[i][1],yj=SWIN_RING[j][0],xj=SWIN_RING[j][1];if(((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi))inside=!inside}return inside}
function savePrefs(){try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}}
function saveCache(){try{localStorage.setItem(CACHE_KEY,JSON.stringify(cache))}catch{}}
function validCached(k,max=CACHE_MS){const c=cache[k];return c&&Array.isArray(c.items)&&Date.now()-Number(c.at||0)<max}
function setCached(k,items){cache[k]={at:Date.now(),items};saveCache();return items}
function pointFeature(f){const c=f?.geometry?.coordinates;return Array.isArray(c)&&Number.isFinite(+c[0])&&Number.isFinite(+c[1])?{lat:+c[1],lon:+c[0]}:null}
function osmPoint(e){const lat=Number(e.lat??e.center?.lat),lon=Number(e.lon??e.center?.lon);return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null}
function osmAddress(t={}){return [t['addr:housenumber'],t['addr:street'],t['addr:suburb']||t['addr:city']||t['addr:town'],t['addr:postcode']].filter(Boolean).join(' ')}
async function fetchTimed(url,opts={},timeout=25000){const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);try{return await fetch(url,{...opts,signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}}

function injectStyle(){if(q('#facilitiesStyleV2'))return;const s=document.createElement('style');s.id='facilitiesStyleV2';s.textContent=`
.facilities-block{margin-top:11px;padding-top:10px;border-top:1px solid #303740}.facilities-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}.facilities-head strong{font-size:10px;color:#f4f6f8}.facilities-head span{font-size:8px;color:#8f9aa5}.facilities-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.facility-toggle{min-height:38px;display:flex;align-items:center;gap:7px;padding:7px 8px;border:1px solid #303740;border-radius:9px;background:#151a20;color:#d7dce2;font-size:9px;font-weight:800;cursor:pointer}.facility-toggle input{accent-color:#f97316}.facility-symbol{width:20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:950;border:1px solid #ffffff55;flex:0 0 auto}.facility-toggle b{margin-left:auto;font-size:8px;color:#8f9aa5;font-variant-numeric:tabular-nums}.facility-toggle b.err{color:#fca5a5}.facility-actions{display:flex;gap:6px;margin-top:7px}.facility-actions button{border:1px solid #37404a;background:#1a2026;color:#cfd6dd;border-radius:8px;padding:6px 8px;font-size:8.5px;font-weight:850;cursor:pointer}.facility-note{font-size:8px;line-height:1.4;color:#7f8a95;margin-top:7px}.facility-marker,.facility-cluster{background:transparent;border:0}.facility-pin{width:26px;height:26px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:950;border:2px solid #fff;box-shadow:0 2px 8px #0008}.facility-cluster>div{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#111820;border:2px solid #f97316;color:#fff;font-size:10px;font-weight:950;box-shadow:0 3px 10px #000a}.facility-popup .fp-type{display:block;margin:3px 0 6px;font-size:9px;font-weight:850;color:#f97316}.facility-popup .fp-meta{font-size:9px;line-height:1.45}.facility-popup .fp-source{margin-top:7px;padding-top:6px;border-top:1px solid #ddd;font-size:8px;line-height:1.4;color:#666}@media(max-width:680px){.facilities-grid{grid-template-columns:1fr}}
`;document.head.appendChild(s)}

function injectUI(){const box=q('.layerbox');if(!box)return false;const old=q('#operationalFacilities');if(old)old.remove();const n=document.createElement('div');n.id='operationalFacilities';n.className='facilities-block';n.innerHTML=`<div class="facilities-head"><div><strong>Operational facilities</strong><span>SWIN only · clustered when zoomed out</span></div></div><div class="facilities-grid">${Object.entries(META).map(([k,m])=>`<label class="facility-toggle"><input type="checkbox" data-facility="${k}"><i class="facility-symbol" style="background:${m.colour};color:${m.text||'#fff'}">${m.short}</i><span>${m.label}</span><b id="facilityCount-${k}">--</b></label>`).join('')}</div><div class="facility-actions"><button type="button" id="facilitiesAll">Show all facilities</button><button type="button" id="facilitiesNone">Clear facilities</button></div><div class="facility-note" id="facilityNote">Fire and emergency hospitals use WA Government spatial services. Police and ambulance use smaller SWIN-zone OpenStreetMap queries. Western Power uses publicly documented work-location addresses. A failed source is shown as ERR rather than silently appearing as zero.</div>`;box.appendChild(n);qa('[data-facility]',n).forEach(c=>{c.checked=!!prefs[c.dataset.facility];c.onchange=async()=>{const k=c.dataset.facility;prefs[k]=c.checked;savePrefs();if(c.checked)await ensure(k,true);draw()}});q('#facilitiesAll',n).onclick=async()=>{Object.keys(prefs).forEach(k=>prefs[k]=true);savePrefs();qa('[data-facility]',n).forEach(x=>x.checked=true);for(const k of Object.keys(prefs))await ensure(k,true);draw()};q('#facilitiesNone',n).onclick=()=>{Object.keys(prefs).forEach(k=>prefs[k]=false);savePrefs();qa('[data-facility]',n).forEach(x=>x.checked=false);draw()};return true}

function setCount(k,state){const n=q('#facilityCount-'+k);if(!n)return;n.classList.toggle('err',state==='ERR');n.textContent=state}
function setLoading(k){setCount(k,'…')}

async function loadFire(){if(validCached('fire'))return cache.fire.items;const r=await fetchTimed(DFES_URL);if(!r.ok)throw Error('DFES '+r.status);const d=await r.json(),types=new Set(['BFB','CFRS','PFRS','VFESU','VFRS']);return setCached('fire',(d.features||[]).map(f=>{const p=pointFeature(f),a=f.properties||{};if(!p||!inSwin(p.lat,p.lon)||!types.has(String(a.type||'').toUpperCase()))return null;return{id:`dfes-${a.objectid||a.displaynam}`,kind:'fire',name:a.displaynam||'DFES station',subtype:a.type||'',lat:p.lat,lon:p.lon,address:'',source:META.fire.source}}).filter(Boolean))}
function edYes(v){const s=String(v??'').trim().toLowerCase();return !!s&&!['no','n','false','0','none','not applicable','n/a'].includes(s)}
async function loadHospital(){if(validCached('hospital'))return cache.hospital.items;const r=await fetchTimed(HEALTH_URL);if(!r.ok)throw Error('Health '+r.status);const d=await r.json();return setCached('hospital',(d.features||[]).map(f=>{const p=pointFeature(f),a=f.properties||{};if(!p||!inSwin(p.lat,p.lon)||!edYes(a.ed_reporti))return null;return{id:`hospital-${a.objectid||a.estab_id||a.establishm}`,kind:'hospital',name:a.establishm||'Hospital',subtype:a.est||a.esc||'Emergency department',lat:p.lat,lon:p.lon,address:[a.address,a.suburb,a.postcode].filter(Boolean).join(', '),phone:a.telephone||'',source:META.hospital.source}}).filter(Boolean))}

async function overpassZone(kind,bbox){const body=kind==='police'?`nwr["amenity"="police"](${bbox});`:`nwr["emergency"="ambulance_station"](${bbox});nwr["amenity"="ambulance_station"](${bbox});`;const query=`[out:json][timeout:18];(${body});out center tags;`;let last;for(const base of OVERPASS){try{const url=base+'?data='+encodeURIComponent(query);const r=await fetchTimed(url,{headers:{Accept:'application/json'}},26000);if(!r.ok)throw Error('HTTP '+r.status);const d=await r.json();return Array.isArray(d.elements)?d.elements:[]}catch(e){last=e}}throw last||Error('mapped facility service unavailable')}
async function loadMapped(kind){if(validCached(kind))return cache[kind].items;const all=[];const seen=new Set();let successes=0;for(const bb of ZONE_BBOXES){try{const rows=await overpassZone(kind,bb);successes++;for(const e of rows){const p=osmPoint(e),t=e.tags||{};if(!p||!inSwin(p.lat,p.lon))continue;const id=`${e.type}-${e.id}`;if(seen.has(id))continue;seen.add(id);all.push({id:`osm-${kind}-${id}`,kind,name:t.name||(kind==='police'?'Police station':'Ambulance station'),subtype:t.operator||(kind==='police'?'Police facility':'Ambulance response location'),lat:p.lat,lon:p.lon,address:osmAddress(t),phone:t.phone||'',source:META[kind].source})}}catch(e){console.warn(`${kind} zone unavailable`,bb,e)}}if(!successes)throw Error(kind+' source unavailable');return setCached(kind,all)}

async function geocode(addr){const u=new URL('https://nominatim.openstreetmap.org/search');u.searchParams.set('q',addr+', Australia');u.searchParams.set('format','jsonv2');u.searchParams.set('limit','1');u.searchParams.set('countrycodes','au');const r=await fetchTimed(u.toString(),{headers:{Accept:'application/json','Accept-Language':'en-AU'}},18000);if(!r.ok)throw Error('geocode '+r.status);const d=await r.json();const x=Array.isArray(d)?d[0]:null;return x?{lat:+x.lat,lon:+x.lon}:null}
async function loadWp(){if(validCached('wp',WP_CACHE_MS))return cache.wp.items;const out=[];for(let i=0;i<WP_PUBLIC.length;i++){const x=WP_PUBLIC[i];try{const p=await geocode(x.address);if(p&&inSwin(p.lat,p.lon))out.push({id:'wp-public-'+i,kind:'wp',name:x.name,subtype:'Western Power public work location',lat:p.lat,lon:p.lon,address:x.address,source:META.wp.source})}catch(e){console.warn('WP geocode failed',x.name,e)}if(i<WP_PUBLIC.length-1)await sleep(1100)}if(!out.length)throw Error('Western Power public locations unavailable');return setCached('wp',out)}

async function ensure(k,force=false){if(facilities[k]?.length&&!force)return facilities[k];setLoading(k);delete errors[k];try{const items=k==='fire'?await loadFire():k==='hospital'?await loadHospital():k==='police'||k==='ambulance'?await loadMapped(k):await loadWp();facilities[k]=items||[];setCount(k,String(facilities[k].length));return facilities[k]}catch(e){errors[k]=String(e?.message||e);console.warn('Facility layer failed',k,e);setCount(k,'ERR');return[]}}

function iconFor(i){const m=META[i.kind];return L.divIcon({className:'facility-marker',html:`<div class="facility-pin" style="background:${m.colour};color:${m.text||'#fff'}">${m.short}</div>`,iconSize:[26,26],iconAnchor:[13,13]})}
function popup(i){const m=META[i.kind];return `<div class="facility-popup"><strong>${esc(i.name)}</strong><span class="fp-type">${esc(m.label)}</span><div class="fp-meta">${i.subtype?esc(i.subtype)+'<br>':''}${i.address?esc(i.address)+'<br>':''}${i.phone?esc(i.phone):''}</div><div class="fp-source">${esc(i.source||m.source)}<br><a href="${m.verify}" target="_blank" rel="noopener">Verify source</a></div></div>`}
function visibleItems(){return Object.keys(prefs).flatMap(k=>prefs[k]?facilities[k]||[]:[])}
function draw(){if(typeof map==='undefined'||!map||typeof L==='undefined')return;if(!layer)layer=L.layerGroup().addTo(map);layer.clearLayers();const items=visibleItems();if(!items.length)return;const z=map.getZoom();if(z>=10){items.forEach(i=>L.marker([i.lat,i.lon],{icon:iconFor(i)}).bindPopup(popup(i)).bindTooltip(i.name).addTo(layer));return}const cell=z<=6?2.2:z===7?1.1:z===8?.55:.28;const groups=new Map();for(const i of items){const key=`${Math.round(i.lat/cell)}:${Math.round(i.lon/cell)}`,g=groups.get(key)||{lat:0,lon:0,n:0,items:[]};g.lat+=i.lat;g.lon+=i.lon;g.n++;g.items.push(i);groups.set(key,g)}for(const g of groups.values()){const lat=g.lat/g.n,lon=g.lon/g.n;if(g.n===1){const i=g.items[0];L.marker([lat,lon],{icon:iconFor(i)}).bindPopup(popup(i)).addTo(layer)}else{const icon=L.divIcon({className:'facility-cluster',html:`<div>${g.n}</div>`,iconSize:[34,34],iconAnchor:[17,17]});L.marker([lat,lon],{icon}).bindTooltip(`${g.n} operational facilities`).on('click',()=>map.setView([lat,lon],Math.min(12,z+2),{animate:true})).addTo(layer)}}}

async function initEnabled(){for(const k of Object.keys(prefs))if(prefs[k])await ensure(k);draw()}
function boot(){if(typeof map==='undefined'||!map||typeof L==='undefined'||!q('.layerbox')){setTimeout(boot,180);return}injectStyle();injectUI();map.on('zoomend',draw);initEnabled();console.info('WAOS operational facilities v2 loaded')}
boot();
})();
