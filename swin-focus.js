(function(){
'use strict';

const PREF_KEY='waOpsSwinFocusV1';

/*
  Indicative Western Power / SWIN operational footprint.
  Digitised for WAOS from Western Power's published network-boundary map and
  current published extent (Kalbarri -> Albany/Bremer Bay -> Kalgoorlie).
  It is deliberately labelled indicative and is not a legal/cadastral boundary.
*/
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

let enabled=false;
let focusGroup=null;
let boundaryLayer=null;
let applyingCards=false;

try{enabled=localStorage.getItem(PREF_KEY)==='1'}catch{}

const q=s=>document.querySelector(s);
const qa=s=>[...document.querySelectorAll(s)];
const safe=s=>typeof esc==='function'?esc(s):String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function save(){try{localStorage.setItem(PREF_KEY,enabled?'1':'0')}catch{}}
function srcType(i){
  try{return typeof src==='function'?src(i):''}catch{}
  const s=String(i?.source||'').toLowerCase();
  return s.includes('western')?'wp':s.includes('emergency')?'ewa':s.includes('main roads')?'mr':'bom';
}
function keyFor(i){
  try{return typeof itemKey==='function'?itemKey(i):''}catch{}
  return `${srcType(i)}:${String(i?.id||i?.rawId||i?.title||'item')}`;
}

function pointInRing(lat,lon,ring=SWIN_RING){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const yi=ring[i][0],xi=ring[i][1],yj=ring[j][0],xj=ring[j][1];
    const cross=((yi>lat)!==(yj>lat))&&(lon<(xj-xi)*(lat-yi)/((yj-yi)||1e-12)+xi);
    if(cross)inside=!inside;
  }
  return inside;
}
function orient(a,b,c){return (b.lon-a.lon)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lon-a.lon)}
function onSeg(a,b,c){return Math.min(a.lon,c.lon)-1e-9<=b.lon&&b.lon<=Math.max(a.lon,c.lon)+1e-9&&Math.min(a.lat,c.lat)-1e-9<=b.lat&&b.lat<=Math.max(a.lat,c.lat)+1e-9}
function segmentsIntersect(a,b,c,d){
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b),eps=1e-9;
  if(((o1>eps&&o2<-eps)||(o1<-eps&&o2>eps))&&((o3>eps&&o4<-eps)||(o3<-eps&&o4>eps)))return true;
  if(Math.abs(o1)<=eps&&onSeg(a,c,b))return true;
  if(Math.abs(o2)<=eps&&onSeg(a,d,b))return true;
  if(Math.abs(o3)<=eps&&onSeg(c,a,d))return true;
  if(Math.abs(o4)<=eps&&onSeg(c,b,d))return true;
  return false;
}
const SWIN_EDGES=SWIN_RING.map((p,i)=>[{lat:p[0],lon:p[1]},{lat:SWIN_RING[(i+1)%SWIN_RING.length][0],lon:SWIN_RING[(i+1)%SWIN_RING.length][1]}]);

function geoLines(coords,out=[]){
  if(!Array.isArray(coords))return out;
  if(coords.length>=2&&Number.isFinite(+coords[0])&&Number.isFinite(+coords[1]))return out;
  if(coords.length&&Array.isArray(coords[0])&&coords[0].length>=2&&Number.isFinite(+coords[0][0])&&Number.isFinite(+coords[0][1])){
    out.push(coords.map(p=>({lat:+p[1],lon:+p[0]})));return out;
  }
  coords.forEach(x=>geoLines(x,out));return out;
}
function latLonLines(coords,out=[]){
  if(!Array.isArray(coords))return out;
  if(coords.length&&Array.isArray(coords[0])&&coords[0].length>=2&&Number.isFinite(+coords[0][0])&&Number.isFinite(+coords[0][1])){
    out.push(coords.map(p=>({lat:+p[0],lon:+p[1]})));return out;
  }
  coords.forEach(x=>latLonLines(x,out));return out;
}
function itemLines(i){
  const out=[];
  if(i?.geometry?.coordinates)geoLines(i.geometry.coordinates,out);
  if(Array.isArray(i?.polygons))latLonLines(i.polygons,out);
  if(Array.isArray(i?.polygon))latLonLines([i.polygon],out);
  if(Array.isArray(i?.point)&&i.point.length>=2&&Number.isFinite(+i.point[0])&&Number.isFinite(+i.point[1]))out.push([{lat:+i.point[0],lon:+i.point[1]}]);
  return out;
}
function ringContainsPoint(line,p){
  if(!Array.isArray(line)||line.length<3)return false;
  let inside=false;
  for(let i=0,j=line.length-1;i<line.length;j=i++){
    const a=line[i],b=line[j];
    const cross=((a.lat>p.lat)!==(b.lat>p.lat))&&(p.lon<(b.lon-a.lon)*(p.lat-a.lat)/((b.lat-a.lat)||1e-12)+a.lon);
    if(cross)inside=!inside;
  }
  return inside;
}
function itemIntersectsSwin(i){
  const lines=itemLines(i);
  if(!lines.length)return false;
  for(const line of lines){
    for(const p of line)if(pointInRing(p.lat,p.lon))return true;
    for(let n=0;n<line.length-1;n++)for(const [a,b] of SWIN_EDGES)if(segmentsIntersect(line[n],line[n+1],a,b))return true;
    if(line.length>=3){
      for(const p of SWIN_RING)if(ringContainsPoint(line,{lat:p[0],lon:p[1]}))return true;
    }
  }
  return false;
}

function allItems(){
  if(typeof feedData==='undefined'||!feedData)return[];
  return [...(feedData.bom||[]),...(feedData.emergency||[]),...(feedData.westernPower||[]),...(feedData.mainRoads||[])];
}
function relevantItems(){return allItems().filter(itemIntersectsSwin)}
function relevantKeys(){return new Set(relevantItems().map(keyFor).filter(Boolean))}

function injectStyles(){
  if(q('#swinFocusStyle'))return;
  const s=document.createElement('style');s.id='swinFocusStyle';s.textContent=`
    .swin-toggle{border-color:#6b3a1d!important}.swin-toggle input{accent-color:#f97316}.swin-summary{display:none;margin-top:8px;padding:8px 9px;border:1px solid #61361f;border-radius:9px;background:#17110d;color:#d6d3d1;font-size:9px;line-height:1.45}.swin-summary.show{display:block}.swin-summary strong{color:#fdba74}.swin-summary a{color:#fb923c;text-decoration:none}.swin-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 8px;margin:6px 0}.swin-summary-grid span{color:#a3a3a3}.swin-summary-grid b{color:#f5f5f5}.swin-badge{display:none;align-items:center;gap:5px;border:1px solid #7c3f1d;border-radius:999px;background:#24150d;color:#fdba74;padding:3px 7px;font-size:8px;font-weight:900;white-space:nowrap}.swin-badge.show{display:inline-flex}.swin-badge:before{content:'';width:6px;height:6px;border-radius:50%;background:#f97316;box-shadow:0 0 0 2px #7c2d12}.swin-legend{display:none}.swin-legend.show{display:flex}.swin-source-note{font-size:8px;color:#8f8f8f;margin-top:5px}.swin-filtered{display:none!important}body.swin-focus-on .mapwrap{box-shadow:inset 0 0 0 1px #f9731638}
  `;document.head.appendChild(s);
}

function injectUI(){
  const grid=q('.layergrid');
  if(grid&&!q('#swinFocusToggle')){
    grid.insertAdjacentHTML('beforeend','<label class="layertoggle swin-toggle"><input type="checkbox" id="swinFocusToggle"><i class="layerdot" style="background:#f97316"></i>SWIN focus</label>');
  }
  const presets=q('.layerpresets');
  if(presets&&!q('#swinPreset'))presets.insertAdjacentHTML('beforeend','<button type="button" id="swinPreset" title="Show all operational feeds inside the Western Power SWIN footprint">SWIN</button>');
  const hint=q('.layerhint');
  if(hint&&!q('#swinSummary'))hint.insertAdjacentHTML('afterend','<div class="swin-summary" id="swinSummary"></div>');
  const legend=q('.legend');
  if(legend&&!q('#swinLegend'))legend.insertAdjacentHTML('beforeend','<div class="swin-legend" id="swinLegend"><i class="swatch" style="background:#f97316"></i>Western Power SWIN footprint</div>');
  const card=q('.mapcard');
  if(card&&!q('#swinHeaderBadge'))card.insertAdjacentHTML('beforeend','<b class="swin-badge" id="swinHeaderBadge">SWIN FOCUS</b>');
}

function ensurePanes(){
  if(typeof map==='undefined'||!map||typeof L==='undefined')return false;
  if(!map.getPane('swinMaskPane')){const p=map.createPane('swinMaskPane');p.style.zIndex='590';p.style.pointerEvents='none'}
  if(!map.getPane('swinBoundaryPane')){const p=map.createPane('swinBoundaryPane');p.style.zIndex='610'}
  return true;
}
function buildFocusLayer(){
  if(!ensurePanes())return;
  if(focusGroup)return;
  focusGroup=L.layerGroup();
  const outer=[[-85,-180],[-85,180],[85,180],[85,-180]];
  const mask=L.polygon([outer,SWIN_RING],{pane:'swinMaskPane',stroke:false,fill:true,fillColor:'#050505',fillOpacity:.72,fillRule:'evenodd',interactive:false});
  boundaryLayer=L.polygon(SWIN_RING,{pane:'swinBoundaryPane',color:'#f97316',weight:2.5,opacity:.95,fill:false,dashArray:'9 6'});
  boundaryLayer.bindTooltip('Western Power SWIN operational area — indicative',{sticky:true});
  boundaryLayer.bindPopup('<strong>Western Power SWIN operational area</strong><br>Indicative WAOS footprint based on Western Power\'s published network-boundary map and current stated network extent.<br><br><a href="https://www.westernpower.com.au/4a4272/siteassets/documents/swis-towns-locations.pdf" target="_blank" rel="noopener">Western Power network boundary map</a><br><a href="https://www.erawa.com.au/licensing/electricity-licensing/licence-holders/western-power-edl1-etl2" target="_blank" rel="noopener">ERA licensed-area maps</a>');
  mask.addTo(focusGroup);boundaryLayer.addTo(focusGroup);
}

function counts(){
  const items=relevantItems(),c={bom:0,ewa:0,wpU:0,wpP:0,mr:0,total:items.length};
  for(const i of items){const t=srcType(i);if(t==='bom')c.bom++;else if(t==='ewa')c.ewa++;else if(t==='mr')c.mr++;else if(t==='wp'){let cat='';try{cat=typeof wpCategory==='function'?wpCategory(i):i.outageCategory}catch{cat=i.outageCategory};if(cat==='planned')c.wpP++;else c.wpU++}}
  return c;
}
function updateSummary(){
  const el=q('#swinSummary'),badge=q('#swinHeaderBadge'),legend=q('#swinLegend'),toggle=q('#swinFocusToggle');
  if(toggle)toggle.checked=enabled;
  el?.classList.toggle('show',enabled);badge?.classList.toggle('show',enabled);legend?.classList.toggle('show',enabled);
  document.body.classList.toggle('swin-focus-on',enabled);
  if(!el||!enabled)return;
  const c=counts();
  el.innerHTML=`<strong>SWIN operational view</strong><div class="swin-summary-grid"><span>BOM warnings</span><b>${c.bom}</b><span>Emergency WA</span><b>${c.ewa}</b><span>WP unplanned</span><b>${c.wpU}</b><span>WP planned</span><b>${c.wpP}</b><span>Main Roads</span><b>${c.mr}</b><span>Total matched</span><b>${c.total}</b></div><div class="swin-source-note">Items are included when their mapped point/line/polygon intersects the indicative Western Power SWIN footprint. The boundary is for situational awareness, not legal or connection assessment.</div><div class="swin-source-note"><a href="https://www.westernpower.com.au/4a4272/siteassets/documents/swis-towns-locations.pdf" target="_blank" rel="noopener">Western Power boundary source</a> · <a href="https://www.erawa.com.au/licensing/electricity-licensing/licence-holders/western-power-edl1-etl2" target="_blank" rel="noopener">ERA licensed areas</a></div>`;
}

function applyCardFilter(){
  if(applyingCards)return;applyingCards=true;
  try{
    const list=q('#warnings');if(!list)return;
    const keys=enabled?relevantKeys():null;
    qa('#warnings [data-map-key]').forEach(card=>{
      const key=card.getAttribute('data-map-key');
      card.classList.toggle('swin-filtered',enabled&&key&&!keys.has(key));
    });
  }finally{applyingCards=false}
}
function applyMap(fit=false){
  if(typeof map==='undefined'||!map)return;
  buildFocusLayer();
  if(enabled){if(focusGroup&&!map.hasLayer(focusGroup))focusGroup.addTo(map);if(fit&&boundaryLayer){try{map.fitBounds(boundaryLayer.getBounds(),{padding:[28,28],maxZoom:7,animate:true})}catch{}}}
  else if(focusGroup&&map.hasLayer(focusGroup))map.removeLayer(focusGroup);
}
function apply(fit=false){save();applyMap(fit);applyCardFilter();updateSummary()}
function setEnabled(on,fit=false){enabled=!!on;apply(fit)}

function bind(){
  q('#swinFocusToggle')?.addEventListener('change',e=>setEnabled(e.target.checked,true));
  q('#swinPreset')?.addEventListener('click',()=>{
    try{if(typeof setLayers==='function')setLayers({bom:true,ewa:true,wpUnplanned:true,wpPlanned:true,mr:true})}catch{}
    setEnabled(true,true);
  });
  const list=q('#warnings');
  if(list)new MutationObserver(()=>{applyCardFilter();updateSummary()}).observe(list,{childList:true,subtree:true});
  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-filter]'))setTimeout(applyCardFilter,0);
    if(e.target.closest?.('#refresh'))setTimeout(()=>{applyCardFilter();updateSummary()},500);
  });
  setInterval(()=>{if(enabled){applyCardFilter();updateSummary()}},15000);
}

function init(){
  if(typeof L==='undefined'||typeof map==='undefined'||!map||typeof feedData==='undefined'){setTimeout(init,150);return}
  injectStyles();injectUI();bind();apply(enabled);
  window.WAOSSWIN={ring:SWIN_RING,itemIntersects:itemIntersectsSwin,setEnabled,isEnabled:()=>enabled,refresh:()=>apply(false)};
}
init();
})();
