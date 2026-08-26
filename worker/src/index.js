import { DurableObject } from 'cloudflare:workers';
import { parseSyndicationFeed } from './parsers.js';

const BOM_WA_RSS = 'http://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml';
const SNAPSHOT_KEY = 'snapshot-v3';
const LEASE_KEY = 'refresh-lease';
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
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
      'User-Agent': 'WA-Operations-Dashboard/3.0 (personal situational awareness)'
    },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return response.text();
}

function isFresh(snapshot) {
  if (!snapshot?.updatedAt) return false;
  const age = Date.now() - new Date(snapshot.updatedAt).getTime();
  return Number.isFinite(age) && age < FIVE_MINUTES - 5000;
}

export class FeedCoordinator extends DurableObject {
  async current() {
    return (await this.ctx.storage.get(SNAPSHOT_KEY)) || null;
  }

  async refresh({ force = false } = {}) {
    const existing = await this.current();
    if (!force && isFresh(existing)) return existing;

    const now = Date.now();
    const lease = Number((await this.ctx.storage.get(LEASE_KEY)) || 0);
    if (!force && lease && now - lease < FIVE_MINUTES - 5000) {
      return existing || { version: 3, updatedAt: null, refreshing: true, bom: [], emergency: [], sources: {} };
    }

    await this.ctx.storage.put(LEASE_KEY, now);
    const updatedAt = new Date().toISOString();
    const snapshot = {
      version: 3,
      updatedAt,
      bom: existing?.bom || [],
      emergency: existing?.emergency || [],
      sources: {
        bom: { ok: false, count: existing?.bom?.length || 0 },
        emergency: { ok: false, count: existing?.emergency?.length || 0 }
      }
    };

    try {
      const xml = await fetchText(BOM_WA_RSS);
      snapshot.bom = parseSyndicationFeed(xml, {
        source: 'BOM',
        defaultLink: 'https://www.bom.gov.au/wa/warnings/'
      });
      snapshot.sources.bom = { ok: true, count: snapshot.bom.length, fetchedAt: updatedAt };
    } catch (error) {
      snapshot.sources.bom = {
        ok: false,
        count: snapshot.bom.length,
        error: 'fetch_failed',
        message: String(error?.message || error)
      };
    }

    const emergencyUrl = String(this.env.EMERGENCY_WA_RSS_URL || '').trim();
    if (!emergencyUrl) {
      snapshot.sources.emergency = {
        ok: false,
        count: snapshot.emergency.length,
        error: 'not_configured',
        message: 'Emergency WA feed URL has not been configured yet.'
      };
    } else {
      try {
        const xml = await fetchText(emergencyUrl);
        snapshot.emergency = parseSyndicationFeed(xml, {
          source: 'Emergency WA',
          defaultLink: 'https://www.emergency.wa.gov.au/'
        });
        snapshot.sources.emergency = { ok: true, count: snapshot.emergency.length, fetchedAt: updatedAt };
      } catch (error) {
        snapshot.sources.emergency = {
          ok: false,
          count: snapshot.emergency.length,
          error: 'fetch_failed',
          message: String(error?.message || error)
        };
      }
    }

    await this.ctx.storage.put(SNAPSHOT_KEY, snapshot);
    return snapshot;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/refresh') return json(await this.refresh());
    if (url.pathname === '/health') {
      const snapshot = await this.current();
      return json({ ok: true, snapshotReady: Boolean(snapshot), updatedAt: snapshot?.updatedAt || null, sources: snapshot?.sources || null });
    }
    let snapshot = await this.current();
    if (!snapshot || !isFresh(snapshot)) snapshot = await this.refresh();
    return json(snapshot);
  }
}

function coordinator(env) {
  return env.FEED_COORDINATOR.getByName('wa-global');
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
      const data = await response.json();
      return json({ ...data, service: 'WA Operations Dashboard feed service' }, response.status, {
        ...cors,
        'Cache-Control': 'public, max-age=30'
      });
    }

    if (url.pathname === '/api/feeds') {
      const response = await stub.fetch('https://internal/feeds');
      const data = await response.json();
      return json(data, response.status, {
        ...cors,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=60'
      });
    }

    return json({ error: 'not_found' }, 404, cors);
  },

  async scheduled(controller, env, ctx) {
    const stub = coordinator(env);
    ctx.waitUntil(stub.fetch('https://internal/refresh'));
  }
};
