(function(){
'use strict';

const ZONES={
  swin:{label:'SWIN',swin:true},
  metro:{label:'Metro',bounds:[[-32.75,115.45],[-31.25,116.35]]},
  southmetro:{label:'South Metro',bounds:[[-32.75,115.50],[-31.90,116.30]]},
  northmetro:{label:'North Metro',bounds:[[-31.95,115.45],[-31.25,116.30]]},
  southcountry:{label:'South Country',bounds:[[-35.30,114.60],[-32.70,120.35]]},
  northcountry:{label:'North Country',bounds:[[-31.30,113.95],[-27.30,119.25]]},
  eastcountry:{label:'East Country',bounds:[[-33.30,116.15],[-30.15,122.25]]}
};

let zoneLayer=null, rebuilding=false;
const q=s=>document.querySelector(s);

function ensurePane(){
  if(typeof map==='undefined'||!map||typeof L==='undefined')return false;
  if(!map.getPane('swinZonePane')){
    const p=map.createPane('swinZonePane');
    p.style.zIndex='605';
    p.style.pointerEvents='none';
  }
  return true;
}

function clearZone(){
  if(zoneLayer&&typeof map!=='undefined'&&map?.hasLayer?.(zoneLayer))map.removeLayer(zoneLayer);
  zoneLayer=null;
}

function markActive(id){
  document.querySelectorAll('[data-waos-zone]').forEach(b=>{
    const active=b.dataset.waosZone===id;
    b.classList.toggle('active',active);
    b.setAttribute('aria-pressed',String(active));
  });
}

function showZone(id){
  if(typeof map==='undefined'||!map||typeof L==='undefined')return;
  const z=ZONES[id]||ZONES.swin;
  clearZone();
  markActive(id in ZONES?id:'swin');

  if(z.swin){
    map.fitBounds([[-35.20,114.00],[-27.40,122.05]],{padding:[24,24],maxZoom:7,animate:true});
    return;
  }

  if(!ensurePane())return;
  zoneLayer=L.rectangle(z.bounds,{
    pane:'swinZonePane',
    color:'#f97316',
    weight:2,
    opacity:.9,
    dashArray:'7 5',
    fillColor:'#f97316',
    fillOpacity:.035,
    interactive:false
  }).addTo(map);
  zoneLayer.bindTooltip(`${z.label} operational view`,{permanent:false,direction:'center',className:'waos-zone-tooltip'});
  map.fitBounds(z.bounds,{padding:[34,34],animate:true});
}

function build(){
  const box=q('.mapbuttons');
  if(!box||typeof map==='undefined'||!map)return false;
  if(box.querySelectorAll('[data-waos-zone]').length===Object.keys(ZONES).length)return true;
  rebuilding=true;
  box.innerHTML=Object.entries(ZONES).map(([id,z])=>`<button type="button" data-waos-zone="${id}" aria-pressed="${id==='swin'?'true':'false'}">${z.label}</button>`).join('');
  box.setAttribute('aria-label','SWIN operational work zones');
  box.querySelectorAll('[data-waos-zone]').forEach(b=>b.addEventListener('click',()=>showZone(b.dataset.waosZone)));
  markActive('swin');
  rebuilding=false;
  return true;
}

function boot(){
  if(!build()){setTimeout(boot,150);return}
  const box=q('.mapbuttons');
  if(box){
    new MutationObserver(()=>{
      if(rebuilding)return;
      if(!box.querySelector('[data-waos-zone]'))setTimeout(build,0);
    }).observe(box,{childList:true});
  }
  setTimeout(build,800);
  setTimeout(build,2200);
  console.info('WAOS SWIN operational zones loaded');
}

boot();
})();
