(function(){
  'use strict';

  /* The main dashboard originally attached click-to-weather to blank map space.
     Keep deliberate layer/card interactions, but blank map clicks do nothing. */
  try{ map?.off?.('click'); }catch{}

  /* Main Roads category presentation. */
  const MR_COLORS={incident:'#2563eb',signal:'#db2777',roadworks:'#0891b2',event:'#7c3aed',closed:'#991b1b',restriction:'#9333ea',condition:'#92400e',detour:'#475569'};
  const mrColour=i=>MR_COLORS[i?.category]||'#2563eb';

  window.mrCard=function(i){
    const place=[i.road,i.suburb].filter(Boolean).join(', ')||i.location||'Location supplied on map';
    const cls=`mr-${esc(i.category||'incident')}`;
    return `<article class="warning mr ${cls} ${hasMapData(i)?'map-focusable':''}" data-map-key="${esc(itemKey(i))}"><div class="mrhead"><span class="mrbadge ${cls}">${esc(i.categoryLabel||'Main Roads')}</span></div><h3>${esc(i.title||'Main Roads travel item')}</h3><p><strong>${esc(place)}</strong></p>${i.trafficImpact?`<p>${esc(i.trafficImpact).slice(0,260)}${i.trafficImpact.length>260?'…':''}</p>`:''}<div class="meta"><span>Main Roads WA${i.region?` · ${esc(i.region)}`:''}</span><span>${esc(fmt(i.updatedAt||i.startTime))}</span></div><a href="${esc(i.link||'https://travelmap.mainroads.wa.gov.au/Home/Map')}" target="_blank" rel="noopener">Open Main Roads Travel Map</a></article>`;
  };

  window.plotMainRoads=function(){
    roadLayer.clearLayers();
    let plotted=0;
    for(const i of feedData.mainRoads||[]){
      if(!i.geometry)continue;
      const color=mrColour(i),place=[i.road,i.suburb].filter(Boolean).join(', ')||i.location||'';
      const popup=`<strong>${esc(i.categoryLabel||'Main Roads')}: ${esc(i.incidentType||i.title||'Travel item')}</strong>${place?`<br>${esc(place)}`:''}${i.trafficImpact?`<br>${esc(i.trafficImpact)}`:''}${i.updatedAt?`<br>Updated: ${esc(fmt(i.updatedAt))}`:''}<br><a href="${esc(i.link||'https://travelmap.mainroads.wa.gov.au/Home/Map')}" target="_blank">Main Roads Travel Map</a>`;
      try{
        const l=L.geoJSON(i.geometry,{style:{color,weight:i.category==='closed'?4:3,fillColor:color,fillOpacity:i.category==='closed'?.24:.18,dashArray:i.category==='detour'?'7 5':undefined},pointToLayer:(_,latlng)=>L.circleMarker(latlng,{radius:i.category==='closed'?8:7,color:'#fff',weight:2,fillColor:color,fillOpacity:1})}).bindPopup(popup).addTo(roadLayer);
        registerMapItem(i,l,popup);plotted++;
      }catch(e){console.warn('Unable to plot Main Roads geometry',e)}
    }
    return plotted;
  };
  if(Array.isArray(feedData?.mainRoads)){renderWarnings();plot()}

  /* Unified sidebar state. */
  const sidebarKey='waOpsUnifiedSidebarV1';
  const body=document.body;
  const sidebarBtn=document.getElementById('rightToggle');
  if(sidebarBtn){
    let collapsed=false;
    try{collapsed=localStorage.getItem(sidebarKey)==='collapsed'}catch{}
    const apply=()=>{
      body.classList.toggle('ops-collapsed',collapsed);
      const arrow=sidebarBtn.querySelector('.toggle-arrow');
      if(arrow)arrow.textContent=collapsed?'‹':'›';
      sidebarBtn.setAttribute('aria-expanded',String(!collapsed));
      sidebarBtn.setAttribute('title',collapsed?'Open operations panel':'Collapse operations panel');
      setTimeout(()=>{try{map?.invalidateSize?.()}catch{}},180);
    };
    sidebarBtn.addEventListener('click',()=>{collapsed=!collapsed;try{localStorage.setItem(sidebarKey,collapsed?'collapsed':'open')}catch{}apply()});
    apply();
  }

  /* Basemap selection and WA place search. */
  let currentBase=null,searchMarker=null,lastSearchAt=0;
  const street=()=>L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'});
  const satellite=()=>L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri — Source: Esri, Vantor, Earthstar Geographics, GIS User Community'});
  const topo=()=>L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap'});
  function setBase(name){
    if(!map)return;
    if(currentBase)map.removeLayer(currentBase);
    currentBase=(name==='satellite'?satellite():name==='topo'?topo():street()).addTo(map);
    currentBase.bringToBack?.();
    document.querySelectorAll('[data-basemap]').forEach(b=>{const on=b.dataset.basemap===name;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
    try{localStorage.setItem('waOpsBasemapV1',name)}catch{}
  }
  function initBase(){
    if(!map)return;
    map.eachLayer(l=>{if(l instanceof L.TileLayer)map.removeLayer(l)});
    let saved='street';try{saved=localStorage.getItem('waOpsBasemapV1')||'street'}catch{}
    setBase(saved);
  }
  document.querySelectorAll('[data-basemap]').forEach(b=>b.addEventListener('click',()=>setBase(b.dataset.basemap)));

  const form=document.getElementById('mapSearch'),input=document.getElementById('mapSearchInput'),status=document.getElementById('mapSearchStatus');
  function showSearchStatus(msg,bad=false){
    if(!status)return;
    status.textContent=msg;status.style.display='block';status.style.background=bad?'#7f1d1dee':'#15191ef2';
    clearTimeout(showSearchStatus.t);showSearchStatus.t=setTimeout(()=>status.style.display='none',5000);
  }
  form?.addEventListener('submit',async e=>{
    e.preventDefault();
    const q=input?.value.trim()||'';
    if(q.length<3){showSearchStatus('Enter at least 3 characters.',true);return}
    const now=Date.now();if(now-lastSearchAt<1100){showSearchStatus('Please wait a moment before searching again.',true);return}lastSearchAt=now;
    showSearchStatus('Searching…');
    try{
      const url=new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q',q+', Western Australia, Australia');url.searchParams.set('format','jsonv2');url.searchParams.set('limit','5');url.searchParams.set('countrycodes','au');url.searchParams.set('addressdetails','1');
      const r=await fetch(url,{headers:{Accept:'application/json','Accept-Language':'en-AU'}});if(!r.ok)throw new Error('Search service returned '+r.status);
      const data=await r.json();const wa=data.find(x=>String(x.display_name||'').toLowerCase().includes('western australia'))||data[0];
      if(!wa){showSearchStatus('No matching WA address or place found.',true);return}
      const lat=Number(wa.lat),lon=Number(wa.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Invalid search result');
      if(searchMarker)map.removeLayer(searchMarker);
      searchMarker=L.marker([lat,lon]).addTo(map).bindPopup(`<strong>${esc(wa.display_name||q)}</strong><br>Search result via OpenStreetMap Nominatim`).openPopup();
      if(Array.isArray(wa.boundingbox)&&wa.boundingbox.length===4){const s=Number(wa.boundingbox[0]),n=Number(wa.boundingbox[1]),w=Number(wa.boundingbox[2]),east=Number(wa.boundingbox[3]);if([s,n,w,east].every(Number.isFinite))map.fitBounds([[s,w],[n,east]],{padding:[40,40],maxZoom:17});else map.setView([lat,lon],16)}else map.setView([lat,lon],16);
      await pointWeather(lat,lon,wa.display_name||q);showSearchStatus('Found: '+(wa.display_name||q));
    }catch(err){console.error(err);showSearchStatus('Address search unavailable right now.',true)}
  });
  setTimeout(initBase,0);

  /* Keep the basemap selector physically beside Leaflet zoom. */
  function groupMapControls(){const base=document.querySelector('.basemap-switcher');const zoom=document.querySelector('.leaflet-control-zoom');const corner=zoom?.parentElement;if(!base||!zoom||!corner)return;if(base.parentElement!==corner)corner.insertBefore(base,zoom)}
  groupMapControls();setTimeout(groupMapControls,250);

  /* Small usability/accessibility improvements. */
  ['mapStatus','warningCount','feedAge'].forEach(id=>document.getElementById(id)?.setAttribute('aria-live','polite'));
  document.getElementById('warnings')?.setAttribute('aria-label','Live incidents and operational items');
  document.getElementById('refresh')?.setAttribute('title','Refresh all live feeds now');
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('title',`Show ${b.textContent.trim()} map view`));
  document.getElementById('locate')?.setAttribute('title','Centre map on my current location');

  function updateFilterAria(){document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.classList.contains('active'))))}
  updateFilterAria();
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{setTimeout(()=>{updateFilterAria();const list=document.getElementById('warnings');if(list)list.scrollTop=0},0)}));

  /* Remember which support panels a user prefers open. */
  const detailsKey='waOpsDetailsStateV1';
  let detailsState={};try{detailsState=JSON.parse(localStorage.getItem(detailsKey)||'{}')||{}}catch{}
  function bindDetails(root=document){
    root.querySelectorAll?.('.ops-panel details.fold').forEach((d,index)=>{
      if(d.dataset.persistBound)return;d.dataset.persistBound='1';
      const summary=d.querySelector(':scope > summary');const name=(summary?.childNodes?.[0]?.textContent||summary?.textContent||`section-${index}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-');
      if(Object.prototype.hasOwnProperty.call(detailsState,name))d.open=!!detailsState[name];
      d.addEventListener('toggle',()=>{detailsState[name]=d.open;try{localStorage.setItem(detailsKey,JSON.stringify(detailsState))}catch{}});
    });
  }
  bindDetails();
  new MutationObserver(()=>bindDetails()).observe(document.querySelector('.ops-panel')||document.body,{childList:true,subtree:true});

  /* Slash is a familiar search shortcut and does not interfere while typing. */
  document.addEventListener('keydown',e=>{
    if(e.key!=='/'||e.ctrlKey||e.metaKey||e.altKey)return;
    const tag=document.activeElement?.tagName;if(tag==='INPUT'||tag==='TEXTAREA'||document.activeElement?.isContentEditable)return;
    e.preventDefault();input?.focus();input?.select();
  });
})();
