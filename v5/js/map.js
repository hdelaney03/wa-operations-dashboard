import {PERTH,COLORS,SWIN_RING,ZONES,FACILITY_META} from './config.js';
import {itemKey,wpCategory,roadCategory,roadClosed} from './utils.js';

export function createMapController({onItemClick,onMapClick,onFacilityClick,onZoneChanged}){
  const map=L.map('map',{zoomControl:true,preferCanvas:true,minZoom:5,maxZoom:19,maxBounds:[[-36.2,113.0],[-26.4,122.8]],maxBoundsViscosity:.35}).setView([PERTH.lat,PERTH.lon],8);
  map.zoomControl.setPosition('bottomright');
  const bases={
    street:L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}),
    satellite:L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'}),
    topo:L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',{maxZoom:17,attribution:'© OpenTopoMap contributors'})
  };
  let base=bases.street.addTo(map),zoneLayer=null,radarLayer=null,lastFacilities=[];
  const boundary=L.polygon(SWIN_RING,{color:COLORS.zone,weight:2,dashArray:'7 6',fill:false,interactive:false,pane:'overlayPane'}).addTo(map);
  boundary.bindTooltip('Western Power SWIN operational footprint — indicative',{sticky:true,className:'zone-outline-tooltip'});
  const groups={bom:L.layerGroup().addTo(map),ewa:L.layerGroup().addTo(map),wpUnplanned:L.layerGroup().addTo(map),wpPlanned:L.layerGroup().addTo(map),mr:L.layerGroup().addTo(map),mrRoadworks:L.layerGroup(),facilities:L.layerGroup().addTo(map),selection:L.layerGroup().addTo(map)};
  const layerIndex=new Map();

  function setBasemap(name){if(!bases[name])return;map.removeLayer(base);base=bases[name].addTo(map);base.bringToBack?.()}
  function setZone(id,fit=true){
    const z=ZONES[id]||ZONES.swin;if(zoneLayer){map.removeLayer(zoneLayer);zoneLayer=null}
    if(id!=='swin')zoneLayer=L.rectangle(z.bounds,{color:COLORS.zone,weight:2,dashArray:'6 5',fillColor:COLORS.zone,fillOpacity:.025,interactive:false}).addTo(map);
    if(fit)map.fitBounds(id==='swin'?boundary.getBounds():z.bounds,{padding:[22,22],maxZoom:id==='swin'?7:10,animate:true});
    onZoneChanged?.(id);
  }
  function syncGroup(key,show){const g=groups[key];if(!g)return;if(show&&!map.hasLayer(g))g.addTo(map);if(!show&&map.hasLayer(g))map.removeLayer(g)}
  function clearIncidents(){for(const k of['bom','ewa','wpUnplanned','wpPlanned','mr','mrRoadworks'])groups[k].clearLayers();layerIndex.clear()}
  function bindItem(layer,item){const key=itemKey(item);layer.on('click',e=>{L.DomEvent.stopPropagation(e);onItemClick?.(item,key)});const b=layer.getBounds?.();if(b?.isValid?.())layerIndex.set(key,b);else if(layer.getLatLng){const ll=layer.getLatLng();layerIndex.set(key,L.latLngBounds([ll,ll]))}}
  function addLatLonPolygons(item,target,color){
    let count=0;const polys=Array.isArray(item?.polygons)&&item.polygons.length?item.polygons:(Array.isArray(item?.polygon)?[item.polygon]:[]);
    for(const p of polys){
      const pts=[];const walk=a=>{if(!Array.isArray(a))return;if(a.length>=2&&Number.isFinite(+a[0])&&Number.isFinite(+a[1])){pts.push([+a[0],+a[1]]);return}for(const x of a)walk(x)};walk(p);
      if(pts.length>=3){const l=L.polygon(pts,{color,weight:2,fillColor:color,fillOpacity:.14}).addTo(target);bindItem(l,item);count++}
    }
    if(Array.isArray(item?.point)&&item.point.length>=2){const l=L.circleMarker([+item.point[0],+item.point[1]],{radius:7,color:'#fff',weight:2,fillColor:color,fillOpacity:1}).addTo(target);bindItem(l,item);count++}
    return count;
  }
  function addGeo(item,target,color,weight=3,fill=.12){
    if(!item?.geometry)return 0;
    const layer=L.geoJSON(item.geometry,{style:()=>({color,weight,fillColor:color,fillOpacity:fill,opacity:.92}),pointToLayer:(_f,ll)=>L.circleMarker(ll,{radius:7,color:'#fff',weight:2,fillColor:color,fillOpacity:1})});
    layer.eachLayer(l=>bindItem(l,item));layer.addTo(target);return 1;
  }
  function plotFeeds(feeds,visibility){
    clearIncidents();let plotted=0;
    for(const item of feeds.bom||[])plotted+=addLatLonPolygons(item,groups.bom,COLORS.bom);
    for(const item of feeds.emergency||[])plotted+=addLatLonPolygons(item,groups.ewa,COLORS.ewa);
    for(const item of feeds.westernPower||[]){const cat=wpCategory(item),target=cat==='planned'?groups.wpPlanned:groups.wpUnplanned,color=cat==='planned'?COLORS.wpPlanned:cat==='unplanned'?COLORS.wpUnplanned:COLORS.wpUnknown;plotted+=addGeo(item,target,color,2.5,.16)}
    for(const item of feeds.mainRoads||[]){const cat=roadCategory(item),rw=cat==='roadworks',target=rw?groups.mrRoadworks:groups.mr;const color=COLORS[cat]||COLORS.incident;plotted+=addGeo(item,target,color,roadClosed(item)?4:3,.06)}
    for(const [key,show] of Object.entries(visibility||{}))syncGroup(key,show);
    return plotted;
  }
  function focusItem(key){const b=layerIndex.get(key);if(b?.isValid?.())map.fitBounds(b.pad(.35),{maxZoom:14,animate:true})}
  function setSelection(lat,lon,label='Selected place'){groups.selection.clearLayers();const m=L.marker([lat,lon]).addTo(groups.selection).bindTooltip(label,{direction:'top',offset:[0,-8]});map.setView([lat,lon],Math.max(map.getZoom(),12),{animate:true});return m}
  function clearSelection(){groups.selection.clearLayers()}
  function setRadar(path){if(radarLayer){map.removeLayer(radarLayer);radarLayer=null}if(!path)return;radarLayer=L.tileLayer(`https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`,{opacity:.58,zIndex:290,attribution:'Radar © RainViewer'}).addTo(map)}

  function facilityCellSize(){const z=map.getZoom();if(z<=6)return 1.5;if(z===7)return .9;if(z===8)return .5;if(z===9)return .28;if(z===10)return .15;if(z===11)return .08;return .035}
  function renderFacilities(items=lastFacilities){
    lastFacilities=items;groups.facilities.clearLayers();if(!items.length)return;
    const size=facilityCellSize(),cells=new Map();
    for(const f of items){const key=`${Math.floor(f.lat/size)}:${Math.floor(f.lon/size)}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(f)}
    for(const list of cells.values()){
      if(list.length>1){const lat=list.reduce((a,x)=>a+x.lat,0)/list.length,lon=list.reduce((a,x)=>a+x.lon,0)/list.length;const icon=L.divIcon({className:'facility-div',html:`<div class="facility-cluster">${list.length}</div>`,iconSize:[34,34],iconAnchor:[17,17]});const m=L.marker([lat,lon],{icon}).addTo(groups.facilities);m.on('click',e=>{L.DomEvent.stopPropagation(e);map.fitBounds(L.latLngBounds(list.map(x=>[x.lat,x.lon])).pad(.4),{maxZoom:13})});continue}
      const f=list[0],meta=FACILITY_META[f.kind]||FACILITY_META.fire;const icon=L.divIcon({className:'facility-div',html:`<div class="facility-pin" style="background:${meta.colour};color:${meta.text||'#fff'}">${meta.short}</div>`,iconSize:[27,27],iconAnchor:[13,13]});const m=L.marker([f.lat,f.lon],{icon}).addTo(groups.facilities);m.on('click',e=>{L.DomEvent.stopPropagation(e);onFacilityClick?.(f)})
    }
  }
  map.on('zoomend',()=>renderFacilities());
  map.on('click',e=>onMapClick?.(e.latlng));

  return{map,groups,setBasemap,setZone,plotFeeds,focusItem,setSelection,clearSelection,setRadar,renderFacilities,getBounds:()=>map.getBounds(),fitSwin:()=>setZone('swin',true)};
}
