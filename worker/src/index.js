import { DurableObject } from 'cloudflare:workers';
import { parseSyndicationFeed, parseEmergencyFeed } from './parsers.js';

const BOM_WA_RSS = 'https://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml';
const EMERGENCY_WA_CAP_AU = 'https://api.emergency.wa.gov.au/v1/capau';
const WESTERN_POWER_OUTAGES = 'https://services2.arcgis.com/tBLxde4cxSlNUxsM/arcgis/rest/services/WP_Outage_Prod/FeatureServer/0/query';
const MAIN_ROADS_TRAVEL_MAP = 'https://gisservices.mainroads.wa.gov.au/arcgis/rest/services/Apps/TravelMap/MapServer';
const SNAPSHOT_KEY = 'feeds-v8';
const FIVE_MINUTES = 5 * 60 * 1000;

const MAIN_ROADS_LAYERS = [
  { id: 0, category: 'incident', label: 'Road incident' },
  { id: 1, category: 'signal', label: 'Traffic signal outage' },
  { id: 2, category: 'roadworks', label: 'Roadworks' },
  { id: 3, category: 'event', label: 'Road event' },
  { id: 6, category: 'closed', label: 'Road closed' },
  { id: 7, category: 'closed', label: 'Road closed' },
  { id: 9, category: 'restriction', label: 'Vehicle restriction' },
  { id: 10, category: 'restriction', label: 'Vehicle restriction' },
  { id: 12, category: 'condition', label: 'Road condition' },
  { id: 13, category: 'condition', label: 'Road condition' },
  { id: 15, category: 'detour', label: 'Detour' },
  { id: 16, category: 'detour', label: 'Detour' }
];

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '*');
  return {
    'Access-Control-Allow-Origin': allowed === '*' || !origin || origin === allowed ? (allowed === '*' ? '*' : origin) : allowed,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Accept',
    'Vary': 'Origin'
  };
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/cap+xml, application/xml, application/rss+xml, application/atom+xml, text/xml;q=0.9, */*;q=0.1',
      'User-Agent': 'WA-Operations-Dashboard/8.0 (personal situational awareness)'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.text();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/geo+json, application/json;q=0.9, */*;q=0.1',
      'User-Agent': 'WA-Operations-Dashboard/8.0 (personal situational awareness)'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

function arcgisQuery(base, outFields = '*') {
  const url = new URL(base);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', outFields);
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'geojson');
  return url.toString();
}

function westernPowerUrl() {
  return arcgisQuery(WESTERN_POWER_OUTAGES, 'OBJECTID,OUTAGETYPE,INCIDENTREF,ENARNUMBER,OUTAGESTARTTIME,ESTIMATEDRESTORATIONTIME,PLANNEDOUTAGE,NOCUSTOMERSIMPACTED,TIMEADDED,AFFECTED_AREA,AFFECTED_AREA_NOCUSTOMERS,Tags');
}

function classifyWesternPower(props = {}) {
  const type = String(props.OUTAGETYPE || '').trim().toUpperCase();
  if (type === 'F') return { category: 'planned', planned: true, classificationSource: 'OUTAGETYPE:F' };
  if (type === 'U') return { category: 'unplanned', planned: false, classificationSource: 'OUTAGETYPE:U' };
  const explicit = String(props.PLANNEDOUTAGE ?? '').trim().toLowerCase();
  if (explicit === 'planned' || ['true','yes','y','1'].includes(explicit)) return { category: 'planned', planned: true, classificationSource: 'PLANNEDOUTAGE' };
  if (explicit === 'unplanned' || explicit === 'not planned' || ['false','no','n','0'].includes(explicit)) return { category: 'unplanned', planned: false, classificationSource: 'PLANNEDOUTAGE' };
  return { category: 'unknown', planned: null, classificationSource: 'unknown' };
}

function normalizeWesternPower(geojson) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  return features.map((feature, index) => {
    const p = feature?.properties || {};
    const classification = classifyWesternPower(p);
    const area = String(p.AFFECTED_AREA || '').trim();
    const incident = String(p.INCIDENTREF || '').trim();
    const enar = String(p.ENARNUMBER || '').trim();
    const objectId = p.OBJECTID ?? index + 1;
    const label = classification.category === 'planned' ? 'Planned' : classification.category === 'unplanned' ? 'Unplanned' : 'Unknown type';
    return {
      id: incident || enar || `wp-${objectId}`,
      source: 'Western Power',
      title: `${label} outage${area ? ` – ${area}` : ''}`,
      outageType: String(p.OUTAGETYPE || '').trim(),
      rawPlannedOutage: String(p.PLANNEDOUTAGE ?? '').trim(),
      outageCategory: classification.category,
      planned: classification.planned,
      classificationSource: classification.classificationSource,
      incidentRef: incident,
      enarNumber: enar,
      outageStartTime: p.OUTAGESTARTTIME || null,
      estimatedRestorationTime: p.ESTIMATEDRESTORATIONTIME || null,
      customersImpacted: Number.isFinite(Number(p.NOCUSTOMERSIMPACTED)) ? Number(p.NOCUSTOMERSIMPACTED) : null,
      affectedArea: area,
      affectedAreaNoCustomers: String(p.AFFECTED_AREA_NOCUSTOMERS || '').trim(),
      timeAdded: p.TIMEADDED || null,
      tags: String(p.Tags || '').trim(),
      geometry: feature?.geometry || null,
      link: 'https://www.westernpower.com.au/faults-outages/power-outages/'
    };
  });
}

function value(p, names) {
  for (const name of names) {
    const v = p?.[name];
    if (v !== null && v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function geometryRank(g) {
  return { Point: 1, MultiPoint: 1, LineString: 3, MultiLineString: 4, Polygon: 4, MultiPolygon: 5 }[g?.type] || 0;
}

function normalizeMainRoadsFeature(feature, layer, index) {
  const p = feature?.properties || {};
  const rawId = value(p, ['Id','ID','OBJECTID']) || index + 1;
  const road = value(p, ['Road','ROAD','ROAD_NAME','LocalRoadName']);
  const suburb = value(p, ['Suburb','SUBURB']);
  const location = value(p, ['Location','Intersection','Description','EventName','EventDescription']) || [road, suburb].filter(Boolean).join(', ');
  const incidentType = value(p, ['IncidentType','ClosureType','WorkType','EventType','SignalFault','SignalStatus']);
  const trafficImpact = value(p, ['TrafficImpact','TrafficCondition','Description','EventDescription','SignalStatus']);
  const title = incidentType ? `${layer.label}: ${incidentType}` : layer.label;
  return {
    id: `mr-${layer.category}-${rawId}`,
    rawId: String(rawId),
    source: 'Main Roads WA',
    category: layer.category,
    categoryLabel: layer.label,
    title,
    location,
    road,
    suburb,
    region: value(p, ['Region','REGION']),
    trafficImpact,
    incidentType,
    incidentLevel: value(p, ['IncidentLevel']),
    startTime: value(p, ['DateStarted','DateTimeStart','EntryDate']),
    endTime: value(p, ['EstimatedCompletionDate','DateTimeEnd']),
    updatedAt: value(p, ['UpdateDateTime','EntryDate']),
    geometry: feature?.geometry || null,
    link: 'https://travelmap.mainroads.wa.gov.au/Home/Map'
  };
}

function mergeMainRoads(items) {
  const merged = new Map();
  for (const item of items) {
    const key = `${item.category}:${item.rawId}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, item);
      continue;
    }
    const geometry = geometryRank(item.geometry) > geometryRank(previous.geometry) ? item.geometry : previous.geometry;
    merged.set(key, {
      ...previous,
      ...Object.fromEntries(Object.entries(item).filter(([,v]) => v !== null && v !== undefined && v !== '')),
      geometry
    });
  }
  return [...merged.values()];
}

async function fetchMainRoads() {
  const results = await Promise.allSettled(MAIN_ROADS_LAYERS.map(async layer => {
    const geojson = await fetchJson(arcgisQuery(`${MAIN_ROADS_TRAVEL_MAP}/${layer.id}/query`));
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    return features.map((feature, index) => normalizeMainRoadsFeature(feature, layer, index));
  }));
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  const failedLayers = results.filter(result => result.status === 'rejected').length;
  if (!items.length && failedLayers === MAIN_ROADS_LAYERS.length) throw new Error('All Main Roads Travel Map layers failed');
  return { items: mergeMainRoads(items), failedLayers };
}

function isFresh(snapshot) {
  if (!snapshot?.updatedAt) return false;
  const timestamp = new Date(snapshot.updatedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp < FIVE_MINUTES;
}

export class FeedCoordinator extends DurableObject {
  async current() {
    return (await this.ctx.storage.get(SNAPSHOT_KEY)) || null;
  }

  async refresh() {
    const existing = await this.current();
    if (isFresh(existing)) return existing;
    const updatedAt = new Date().toISOString();
    const snapshot = {
      version: 8,
      updatedAt,
      bom: existing?.bom || [],
      emergency: existing?.emergency || [],
      westernPower: existing?.westernPower || [],
      mainRoads: existing?.mainRoads || [],
      sources: {
        bom: { ok: false, count: existing?.bom?.length || 0 },
        emergency: { ok: false, count: existing?.emergency?.length || 0 },
        westernPower: { ok: false, count: existing?.westernPower?.length || 0 },
        mainRoads: { ok: false, count: existing?.mainRoads?.length || 0 }
      }
    };

    try {
      const xml = await fetchText(BOM_WA_RSS);
      snapshot.bom = parseSyndicationFeed(xml, { source: 'BOM', defaultLink: 'https://www.bom.gov.au/wa/warnings/' });
      snapshot.sources.bom = { ok: true, count: snapshot.bom.length, fetchedAt: updatedAt, format: 'RSS' };
    } catch (error) {
      snapshot.sources.bom = { ok: false, count: snapshot.bom.length, error: 'fetch_failed', message: String(error?.message || error) };
    }

    try {
      const xml = await fetchText(EMERGENCY_WA_CAP_AU);
      snapshot.emergency = parseEmergencyFeed(xml, { defaultLink: 'https://www.emergency.wa.gov.au/' });
      snapshot.sources.emergency = { ok: true, count: snapshot.emergency.length, fetchedAt: updatedAt, format: 'CAP-AU' };
    } catch (error) {
      snapshot.sources.emergency = { ok: false, count: snapshot.emergency.length, error: 'fetch_failed', message: String(error?.message || error) };
    }

    try {
      const geojson = await fetchJson(westernPowerUrl());
      snapshot.westernPower = normalizeWesternPower(geojson);
      const plannedCount = snapshot.westernPower.filter(x => x.outageCategory === 'planned').length;
      const unplannedCount = snapshot.westernPower.filter(x => x.outageCategory === 'unplanned').length;
      const unknownCount = snapshot.westernPower.filter(x => x.outageCategory === 'unknown').length;
      snapshot.sources.westernPower = { ok: true, count: snapshot.westernPower.length, plannedCount, unplannedCount, unknownCount, fetchedAt: updatedAt, format: 'ArcGIS GeoJSON' };
    } catch (error) {
      snapshot.sources.westernPower = { ok: false, count: snapshot.westernPower.length, error: 'fetch_failed', message: String(error?.message || error) };
    }

    try {
      const result = await fetchMainRoads();
      snapshot.mainRoads = result.items;
      snapshot.sources.mainRoads = { ok: true, count: snapshot.mainRoads.length, failedLayers: result.failedLayers, fetchedAt: updatedAt, format: 'Main Roads ArcGIS GeoJSON' };
    } catch (error) {
      snapshot.sources.mainRoads = { ok: false, count: snapshot.mainRoads.length, error: 'fetch_failed', message: String(error?.message || error) };
    }

    await this.ctx.storage.put(SNAPSHOT_KEY, snapshot);
    return snapshot;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const snapshot = await this.current();
      return json({ ok: true, snapshotReady: Boolean(snapshot), updatedAt: snapshot?.updatedAt || null, sources: snapshot?.sources || null });
    }
    let snapshot = await this.current();
    if (!isFresh(snapshot)) snapshot = await this.refresh();
    return json(snapshot);
  }
}

function coordinator(env) {
  const id = env.FEED_COORDINATOR.idFromName('wa-global-feeds');
  return env.FEED_COORDINATOR.get(id);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors);
    const url = new URL(request.url);
    const stub = coordinator(env);
    if (url.pathname === '/' || url.pathname === '/api/health') {
      const response = await stub.fetch('https://internal/health');
      const health = await response.json();
      return json({ ...health, service: 'WA Operations Dashboard feed service', version: 8, endpoints: ['/api/health', '/api/feeds'] }, 200, { ...cors, 'Cache-Control': 'no-store' });
    }
    if (url.pathname === '/api/feeds') {
      const response = await stub.fetch('https://internal/feeds');
      const snapshot = await response.json();
      return json(snapshot, 200, { ...cors, 'Cache-Control': 'public, max-age=60, stale-while-revalidate=60' });
    }
    return json({ error: 'not_found' }, 404, cors);
  }
};