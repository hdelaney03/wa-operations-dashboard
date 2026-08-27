(function(){
'use strict';

/* Keep Main Roads roadworks in the feed/cards, but suppress point-based
   roadworks markers on the map to reduce visual clutter. Line/polygon
   roadworks remain visible where the source provides them. */
if(typeof L==='undefined'||typeof roadLayer==='undefined')return;

const COLORS={incident:'#2563eb',signal:'#db2777',roadworks:'#0891b2',event:'#7c3aed',closed:'#991b1b',restriction:'#9333ea',condition:'#92400e',detour:'#475569'};
const colour=i=>COLORS[i?.category]||'#2563eb';
const isPointGeometry=g=>g?.type==='Point'||g?.type==='MultiPoint';

plotMainRoads=function(){
  roadLayer.clearLayers();
  let plotted=0;
  for(const i of feedData.mainRoads||[]){
    if(!i.geometry)continue;
    if(i.category==='roadworks'&&isPointGeometry(i.geometry))continue;

    const color=colour(i);
    const place=[i.road,i.suburb].filter(Boolean).join(', ')||i.location||'';
    const popup=`<strong>${esc(i.categoryLabel||'Main Roads')}: ${esc(i.incidentType||i.title||'Travel item')}</strong>${place?`<br>${esc(place)}`:''}${i.trafficImpact?`<br>${esc(i.trafficImpact)}`:''}${i.updatedAt?`<br>Updated: ${esc(fmt(i.updatedAt))}`:''}<br><a href="${esc(i.link||'https://travelmap.mainroads.wa.gov.au/Home/Map')}" target="_blank">Main Roads Travel Map</a>`;

    try{
      const layer=L.geoJSON(i.geometry,{
        style:{
          color,
          weight:i.category==='closed'?4:3,
          fillColor:color,
          fillOpacity:i.category==='closed'?.24:.18,
          dashArray:i.category==='detour'?'7 5':undefined
        },
        pointToLayer:(_,latlng)=>L.circleMarker(latlng,{
          radius:i.category==='closed'?8:7,
          color:'#fff',
          weight:2,
          fillColor:color,
          fillOpacity:1
        })
      }).bindPopup(popup).addTo(roadLayer);
      registerMapItem(i,layer,popup);
      plotted++;
    }catch(e){
      console.warn('Unable to plot Main Roads geometry',e);
    }
  }
  return plotted;
};

try{plotMainRoads();syncMapLayers?.();}catch(e){console.warn('Unable to refresh Main Roads without roadworks markers',e)}
})();
