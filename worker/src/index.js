import { DurableObject } from 'cloudflare:workers';
import { parseSyndicationFeed, parseEmergencyFeed } from './parsers.js';

const BOM_WA_RSS = 'https://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml';
const EMERGENCY_WA_CAP_AU = 'https://api.emergency.wa.gov.au/v1/capau';
const WESTERN_POWER_OUTAGES = 'https://services2.arcgis.com/tBLxde4cxSlNUxsM/arcgis/rest/services/WP_Outage_Prod/FeatureServer/0/query';
const SNAPSHOT_KEY = 'feeds-v7';
const FIVE_MINUTES = 5 * 60 * 1000;

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
      'User-Agent': 'WA-Operations-Dashboard/7.0 (personal situational awareness)'
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
      'User-Agent': 'WA-Operations-Dashboard/7.0 (personal situational awareness)'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.json();
}

function westernPowerUrl() {
  const url = new URL(WESTERN_POWER_OUTAGES);
  url.searchParams.set('where', '1=1');
  url.searchParams.set('outFields', 'OBJECTID,OUTAGETYPE,INCIDENTREF,ENARNUMBER,OUTAGESTARTTIME,ESTIMATEDRESTORATIONTIME,PLANNEDOUTAGE,NOCUSTOMERSIMPACTED,TIMEADDED,AFFECTED_AREA,AFFECTED_AREA_NOCUSTOMERS,Tags');
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'geojson');
  return url.toString();
}

function classifyWesternPower(props = {}) {
  const type = String(props.OUTAGETYPE || '').trim().toUpperCase();

  // Western Power's public outage tracker uses F for planned/future works and U for unplanned outages.
  // Prefer this code over PLANNEDOUTAGE because observed ArcGIS records can contain contradictory text.
  if (type === 'F') return { category: 'planned', planned: true, classificationSource: 'OUTAGETYPE:F' };
  if (type === 'U') return { category: 'unplanned', planned: false, classificationSource: 'OUTAGETYPE:U' };

  const explicit = String(props.PLANNEDOUTAGE ?? '').trim().toLowerCase();
  if (explicit === 'planned' || ['true', 'yes', 'y', '1'].includes(explicit)) {
    return { category: 'planned', planned: true, classificationSource: 'PLANNEDOUTAGE' };
  }
  if (explicit === 'unplanned' || explicit === 'not planned' || ['false', 'no', 'n', '0'].includes(explicit)) {
    return { category: 'unplanned', planned: false, classificationSource: 'PLANNEDOUTAGE' };
  }

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
      version: 7,
      updatedAt,
      bom: existing?.bom || [],
      emergency: existing?.emergency || [],
      westernPower: existing?.westernPower || [],
      sources: {
        bom: { ok: false, count: existing?.bom?.length || 0 },
        emergency: { ok: false, count: existing?.emergency?.length || 0 },
        westernPower: { ok: false, count: existing?.westernPower?.length || 0 }
      }
    };

    try {
      const xml = await fetchText(BOM_WA_RSS);
      snapshot.bom = parseSyndicationFeed(xml, {
        source: 'BOM',
        defaultLink: 'https://www.bom.gov.au/wa/warnings/'
      });
      snapshot.sources.bom = { ok: true, count: snapshot.bom.length, fetchedAt: updatedAt, format: 'RSS' };
    } catch (error) {
      snapshot.sources.bom = {
        ok: false, count: snapshot.bom.length, error: 'fetch_failed',
        message: String(error?.message || error)
      };
    }

    try {
      const xml = await fetchText(EMERGENCY_WA_CAP_AU);
      snapshot.emergency = parseEmergencyFeed(xml, {
        defaultLink: 'https://www.emergency.wa.gov.au/'
      });
      snapshot.sources.emergency = { ok: true, count: snapshot.emergency.length, fetchedAt: updatedAt, format: 'CAP-AU' };
    } catch (error) {
      snapshot.sources.emergency = {
        ok: false, count: snapshot.emergency.length, error: 'fetch_failed',
        message: String(error?.message || error)
      };
    }

    try {
      const geojson = await fetchJson(westernPowerUrl());
      snapshot.westernPower = normalizeWesternPower(geojson);
      const plannedCount = snapshot.westernPower.filter(x => x.outageCategory === 'planned').length;
      const unplannedCount = snapshot.westernPower.filter(x => x.outageCategory === 'unplanned').length;
      const unknownCount = snapshot.westernPower.filter(x => x.outageCategory === 'unknown').length;
      snapshot.sources.westernPower = {
        ok: true,
        count: snapshot.westernPower.length,
        plannedCount,
        unplannedCount,
        unknownCount,
        fetchedAt: updatedAt,
        format: 'ArcGIS GeoJSON'
      };
    } catch (error) {
      snapshot.sources.westernPower = {
        ok: false, count: snapshot.westernPower.length, error: 'fetch_failed',
        message: String(error?.message || error)
      };
    }

    await this.ctx.storage.put(SNAPSHOT_KEY, snapshot);
    return snapshot;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      const snapshot = await this.current();
      return json({
        ok: true,
        snapshotReady: Boolean(snapshot),
        updatedAt: snapshot?.updatedAt || null,
        sources: snapshot?.sources || null
      });
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
      return json({
        ...health,
        service: 'WA Operations Dashboard feed service',
        version: 7,
        endpoints: ['/api/health', '/api/feeds']
      }, 200, { ...cors, 'Cache-Control': 'no-store' });
    }

    if (url.pathname === '/api/feeds') {
      const response = await stub.fetch('https://internal/feeds');
      const snapshot = await response.json();
      return json(snapshot, 200, {
        ...cors,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=60'
      });
    }

    return json({ error: 'not_found' }, 404, cors);
  }
};