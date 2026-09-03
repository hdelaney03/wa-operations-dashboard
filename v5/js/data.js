import {WORKER,PERTH,DELAYED_MS,STALE_MS} from './config.js';
import {fetchTimed,storageGet,storageSet} from './utils.js';

const FEED_CACHE='waosV5FeedCache';
const WEATHER_CODES={0:'Clear',1:'Mostly clear',2:'Partly cloudy',3:'Cloudy',45:'Fog',48:'Fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',80:'Rain showers',81:'Rain showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm with hail',99:'Severe thunderstorm'};
export const weatherLabel=c=>WEATHER_CODES[c]||'Conditions';

export async function loadFeeds(){
  try{
    const r=await fetchTimed(`${WORKER}/api/feeds`,{cache:'no-store'},18000);if(!r.ok)throw new Error(`Feed HTTP ${r.status}`);
    const data=await r.json();if(!data||!data.updatedAt)throw new Error('Invalid feed response');
    storageSet(FEED_CACHE,data);return{data,fallback:false,error:null};
  }catch(error){
    const cached=storageGet(FEED_CACHE,null);if(cached)return{data:cached,fallback:true,error};throw error;
  }
}
export function feedFreshness(updatedAt){
  const age=Date.now()-new Date(updatedAt||0).getTime();
  if(!Number.isFinite(age))return{key:'stale',label:'Unknown feed age',age};
  if(age<DELAYED_MS)return{key:'live',label:`LIVE · ${Math.max(0,Math.round(age/60000))}m`,age};
  if(age<STALE_MS)return{key:'delayed',label:`DELAYED · ${Math.round(age/60000)}m`,age};
  return{key:'stale',label:`STALE · ${Math.round(age/60000)}m`,age};
}
export function weatherUrl(lat,lon,days=7){return`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Australia%2FPerth&forecast_days=${days}`}
export async function loadWeather(lat=PERTH.lat,lon=PERTH.lon,days=7){const r=await fetchTimed(weatherUrl(lat,lon,days),{cache:'no-store'},14000);if(!r.ok)throw new Error(`Weather HTTP ${r.status}`);return r.json()}
export async function searchPlaces(query){
  const u=new URL('https://nominatim.openstreetmap.org/search');u.searchParams.set('q',`${query}, Western Australia, Australia`);u.searchParams.set('format','jsonv2');u.searchParams.set('limit','6');u.searchParams.set('countrycodes','au');u.searchParams.set('addressdetails','1');u.searchParams.set('viewbox','113.7,-27.1,122.5,-35.5');u.searchParams.set('bounded','0');
  const r=await fetchTimed(u.toString(),{headers:{Accept:'application/json','Accept-Language':'en-AU'}},16000);if(!r.ok)throw new Error(`Search HTTP ${r.status}`);return r.json();
}
export async function loadRadarFrame(){
  const r=await fetchTimed('https://api.rainviewer.com/public/weather-maps.json',{cache:'no-store'},12000);if(!r.ok)throw new Error(`Radar HTTP ${r.status}`);const d=await r.json();const frames=d?.radar?.past||[];const f=frames[frames.length-1];if(!f?.path)throw new Error('No radar frame available');return f;
}
