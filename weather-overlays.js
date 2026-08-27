(function(){
  const PREF_KEY='waOpsWeatherTrackersV1';
  const RADAR_META='https://api.rainviewer.com/public/weather-maps.json';
  const LIGHTNING_BASE='https://map.blitzortung.org/index.php?interactive=1&NavigationControl=1&FullScreenControl=0&Cookies=0&InfoDiv=1&MenuButtonDiv=1&ScaleControl=1&LinksCheckboxChecked=0&MapStyle=3&MapStyleRangeValue=0&Advertisment=0';
  let frames=[],host='',frameIndex=-1,radarLayer=null,playTimer=null,lastMetaAt=0;
  let prefs={radar:false,opacity:.65};
  try{prefs={...prefs,...JSON.parse(localStorage.getItem(PREF_KEY)||'{}')}}catch{}

  const save=()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify(prefs))}catch{}};
  const byId=id=>document.getElementById(id);
  const perthTime=t=>new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Perth',hour:'numeric',minute:'2-digit',hour12:true}).format(new Date(t*1000));

  function injectStyles(){
    const s=document.createElement('style');
    s.textContent=`
      .weather-trackers{display:grid;gap:9px}.tracker-card{background:#191919;border:1px solid #3a3a3a;border-radius:10px;padding:9px}.tracker-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.tracker-head strong{font-size:11px;color:#f5f5f5}.tracker-status{font-size:8px;color:#a3a3a3}.tracker-toggle{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:800;color:#e5e5e5}.tracker-toggle input{accent-color:#38bdf8}.tracker-controls{display:grid;grid-template-columns:auto auto auto 1fr;gap:5px;align-items:center;margin-top:8px}.tracker-controls button,.lightning-open,.tracker-link{border:1px solid #444;background:#242424;color:#e5e5e5;border-radius:7px;padding:6px 8px;font-size:9px;font-weight:800;cursor:pointer}.tracker-controls button:hover,.lightning-open:hover{border-color:#f97316;color:#fb923c}.tracker-controls button.active{background:#f97316;border-color:#f97316;color:#111}.tracker-time{font-size:9px;color:#d4d4d4;text-align:right}.tracker-opacity{display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:center;margin-top:8px;font-size:8px;color:#a3a3a3}.tracker-opacity input{width:100%;accent-color:#38bdf8}.tracker-note{font-size:8px;line-height:1.4;color:#8f8f8f;margin:7px 0 0}.tracker-source{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:7px}.tracker-source a{font-size:8px;color:#fb923c;text-decoration:none}.radar-layer-label{border-color:#334155!important}.lightning-open{width:100%;margin-top:7px;border-color:#f97316;color:#fdba74}.lightning-panel{position:absolute;inset:0;z-index:950;background:#090909;display:none;flex-direction:column}.lightning-panel.open{display:flex}.lightning-toolbar{min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;background:#111;border-bottom:1px solid #3a3a3a;color:#f5f5f5}.lightning-toolbar strong{font-size:12px}.lightning-toolbar span{display:block;color:#a3a3a3;font-size:8px;margin-top:2px}.lightning-toolbar button{border:1px solid #f97316;background:#202020;color:#fb923c;border-radius:8px;padding:6px 10px;font-weight:900;cursor:pointer}.lightning-frame{width:100%;height:100%;border:0;background:#111}.lightning-disclaimer{position:absolute;z-index:960;left:10px;bottom:10px;max-width:420px;background:#101010e8;border:1px solid #444;border-radius:8px;padding:6px 8px;color:#bdbdbd;font-size:8px;line-height:1.35;pointer-events:none}.radar-chip{position:absolute;z-index:640;left:12px;top:12px;background:#111e;border:1px solid #38bdf8;border-radius:8px;padding:6px 8px;color:#e5e5e5;font-size:9px;display:none}.radar-chip.visible{display:block}.radar-chip strong{color:#7dd3fc}@media(max-width:760px){.tracker-controls{grid-template-columns:auto auto auto 1fr}.lightning-disclaimer{max-width:calc(100% - 20px)}}
    `;
    document.head.appendChild(s);
  }

  function injectUI(){
    const grid=document.querySelector('.layergrid');
    if(grid&&!byId('radarToggle')){
      const label=document.createElement('label');
      label.className='layertoggle radar-layer-label';
      label.innerHTML='<input type="checkbox" id="radarToggle"><i class="layerdot" style="background:#38bdf8"></i>Rain / storm radar';
      grid.appendChild(label);
    }
    const displaySection=document.querySelector('.layergrid')?.closest('.ops-section');
    if(displaySection&&!byId('weatherTrackers')){
      const section=document.createElement('section');
      section.className='ops-section';
      section.id='weatherTrackers';
      section.innerHTML=`<details class="fold" open><summary>Weather trackers <span class="foldhint">radar + lightning</span></summary><div class="foldcontent"><div class="weather-trackers"><div class="tracker-card"><div class="tracker-head"><strong>Rain / storm radar</strong><span class="tracker-status" id="radarStatus">Off</span></div><label class="tracker-toggle"><input type="checkbox" id="radarToggleMirror">Show radar on operations map</label><div class="tracker-controls"><button type="button" id="radarPrev" title="Previous radar frame">‹</button><button type="button" id="radarPlay">Play</button><button type="button" id="radarNext" title="Next radar frame">›</button><span class="tracker-time" id="radarTime">Latest frame</span></div><label class="tracker-opacity"><span>Opacity</span><input type="range" id="radarOpacity" min="25" max="90" value="65"><span id="radarOpacityValue">65%</span></label><div class="tracker-source"><span class="tracker-note">Observed radar frames. BOM warning polygons can stay visible above the radar.</span><a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a></div></div><div class="tracker-card"><div class="tracker-head"><strong>Live lightning tracker</strong><span class="tracker-status">Blitzortung</span></div><p class="tracker-note">Opens the approved embedded Blitzortung live lightning map at your current map location and zoom.</p><button type="button" class="lightning-open" id="lightningOpen">Open lightning tracker</button><div class="tracker-source"><span class="tracker-note">Community lightning network; not an official safety service.</span><a href="https://map.blitzortung.org/" target="_blank" rel="noopener">Blitzortung</a></div></div></div></div></details>`;
      displaySection.insertAdjacentElement('afterend',section);
    }
    const mapWrap=document.querySelector('.mapwrap');
    if(mapWrap&&!byId('lightningPanel')){
      mapWrap.insertAdjacentHTML('beforeend',`<div class="radar-chip" id="radarChip"><strong>RADAR</strong> <span id="radarChipTime">Latest</span></div><div class="lightning-panel" id="lightningPanel" aria-hidden="true"><div class="lightning-toolbar"><div><strong>Live lightning tracker</strong><span>Blitzortung / LightningMaps community network</span></div><button type="button" id="lightningClose">Close</button></div><iframe class="lightning-frame" id="lightningFrame" title="Live lightning tracker" loading="lazy"></iframe><div class="lightning-disclaimer">Lightning locations can contain errors and are not an official hazard-warning service. Use BOM warnings for safety-critical decisions.</div></div>`);
    }
  }

  function ensureRadarPane(){
    if(typeof map==='undefined'||!map)return false;
    if(!map.getPane('weatherRadarPane')){
      const pane=map.createPane('weatherRadarPane');
      pane.style.zIndex='250';
      pane.style.pointerEvents='none';
    }
    return true;
  }

  function updateUI(){
    const main=byId('radarToggle'),mirror=byId('radarToggleMirror');
    if(main)main.checked=!!prefs.radar;if(mirror)mirror.checked=!!prefs.radar;
    const op=Math.round(prefs.opacity*100);if(byId('radarOpacity'))byId('radarOpacity').value=String(op);if(byId('radarOpacityValue'))byId('radarOpacityValue').textContent=op+'%';
    byId('radarChip')?.classList.toggle('visible',!!prefs.radar&&!!radarLayer);
  }

  function frameLabel(frame){
    if(!frame)return 'No frame';
    const latest=frameIndex===frames.length-1;
    return `${latest?'Latest · ':''}${perthTime(frame.time)}`;
  }

  function updateFrameLabels(){
    const f=frames[frameIndex];const label=frameLabel(f);
    if(byId('radarTime'))byId('radarTime').textContent=label;
    if(byId('radarChipTime'))byId('radarChipTime').textContent=label;
  }

  function removeRadar(){
    if(radarLayer&&typeof map!=='undefined'&&map?.hasLayer?.(radarLayer))map.removeLayer(radarLayer);
    radarLayer=null;
    byId('radarChip')?.classList.remove('visible');
  }

  function drawFrame(index){
    if(!prefs.radar||!ensureRadarPane()||!frames.length)return;
    frameIndex=Math.max(0,Math.min(index,frames.length-1));
    const frame=frames[frameIndex];
    if(radarLayer&&map.hasLayer(radarLayer))map.removeLayer(radarLayer);
    const url=`${host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;
    radarLayer=L.tileLayer(url,{pane:'weatherRadarPane',opacity:prefs.opacity,maxNativeZoom:7,maxZoom:19,updateWhenIdle:true,keepBuffer:1,attribution:'Weather radar © RainViewer'}).addTo(map);
    updateFrameLabels();updateUI();
  }

  async function loadRadarMeta(force=false){
    if(!force&&frames.length&&Date.now()-lastMetaAt<240000)return true;
    const status=byId('radarStatus');if(status)status.textContent='Loading…';
    try{
      const r=await fetch(RADAR_META,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const data=await r.json();const incoming=Array.isArray(data?.radar?.past)?data.radar.past:[];
      if(!incoming.length)throw new Error('No radar frames');
      host=data.host||'https://tilecache.rainviewer.com';
      const wasLatest=frameIndex<0||frameIndex===frames.length-1;
      frames=incoming.slice(-12);lastMetaAt=Date.now();
      if(wasLatest||frameIndex<0)frameIndex=frames.length-1;else frameIndex=Math.min(frameIndex,frames.length-1);
      if(status)status.textContent=`${frames.length} frames · updated`;
      if(prefs.radar)drawFrame(frameIndex);
      else updateFrameLabels();
      return true;
    }catch(e){console.warn('Rain radar unavailable',e);if(status)status.textContent='Unavailable';return false}
  }

  async function setRadar(on){
    prefs.radar=!!on;save();updateUI();
    if(!prefs.radar){stopPlay();removeRadar();if(byId('radarStatus'))byId('radarStatus').textContent='Off';return}
    const ok=await loadRadarMeta();if(ok)drawFrame(frameIndex<0?frames.length-1:frameIndex);
  }

  function step(delta){if(!frames.length)return;let n=frameIndex+delta;if(n<0)n=frames.length-1;if(n>=frames.length)n=0;drawFrame(n)}
  function stopPlay(){if(playTimer){clearInterval(playTimer);playTimer=null}const b=byId('radarPlay');if(b){b.textContent='Play';b.classList.remove('active')}}
  async function togglePlay(){
    if(!prefs.radar){await setRadar(true)}
    if(playTimer){stopPlay();return}
    if(frames.length<2)return;
    const b=byId('radarPlay');if(b){b.textContent='Pause';b.classList.add('active')}
    const start=Math.max(0,frames.length-6);if(frameIndex<start)frameIndex=start;
    playTimer=setInterval(()=>{let next=frameIndex+1;if(next>=frames.length)next=start;drawFrame(next)},6000);
  }

  function openLightning(){
    if(typeof map==='undefined'||!map)return;
    const c=map.getCenter(),z=Math.max(3,Math.min(10,map.getZoom()));
    const frame=byId('lightningFrame'),panel=byId('lightningPanel');
    if(frame)frame.src=`${LIGHTNING_BASE}#${z}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`;
    panel?.classList.add('open');panel?.setAttribute('aria-hidden','false');
  }
  function closeLightning(){const panel=byId('lightningPanel'),frame=byId('lightningFrame');panel?.classList.remove('open');panel?.setAttribute('aria-hidden','true');if(frame)frame.src=''}

  function bind(){
    const main=byId('radarToggle'),mirror=byId('radarToggleMirror');
    main?.addEventListener('change',e=>setRadar(e.target.checked));mirror?.addEventListener('change',e=>setRadar(e.target.checked));
    byId('radarPrev')?.addEventListener('click',()=>step(-1));byId('radarNext')?.addEventListener('click',()=>step(1));byId('radarPlay')?.addEventListener('click',togglePlay);
    byId('radarOpacity')?.addEventListener('input',e=>{prefs.opacity=Number(e.target.value)/100;save();if(byId('radarOpacityValue'))byId('radarOpacityValue').textContent=e.target.value+'%';radarLayer?.setOpacity?.(prefs.opacity)});
    byId('lightningOpen')?.addEventListener('click',openLightning);byId('lightningClose')?.addEventListener('click',closeLightning);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&byId('lightningPanel')?.classList.contains('open'))closeLightning()});
    updateUI();if(prefs.radar)setRadar(true);
    setInterval(()=>{if(prefs.radar)loadRadarMeta(true)},300000);
  }

  function init(){
    if(typeof L==='undefined'||typeof map==='undefined'||!map){setTimeout(init,150);return}
    injectStyles();injectUI();bind();
  }
  init();
})();
