import { parseSyndicationFeed } from './parsers.js';

const BOM_WA_RSS = 'https://www.bom.gov.au/fwo/IDZ00060.warnings_wa.xml';
const CACHE_SECONDS = 300;

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
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers
    }
  });
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1',
      'User-Agent': 'WA-Operations-Dashboard/3.1 (personal situational awareness)'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  }

  return response.text();
}

async function buildSnapshot(env) {
  const updatedAt = new Date().toISOString();
  const snapshot = {
    version: 4,
    updatedAt,
    bom: [],
    emergency: [],
    sources: {
      bom: { ok: false, count: 0 },
      emergency: {
        ok: false,
        count: 0,
        error: 'not_configured',
        message: 'Emergency WA feed is not connected yet.'
      }
    }
  };

  try {
    const xml = await fetchText(BOM_WA_RSS);
    snapshot.bom = parseSyndicationFeed(xml, {
      source: 'BOM',
      defaultLink: 'https://www.bom.gov.au/wa/warnings/'
    });
    snapshot.sources.bom = {
      ok: true,
      count: snapshot.bom.length,
      fetchedAt: updatedAt
    };
  } catch (error) {
    snapshot.sources.bom = {
      ok: false,
      count: 0,
      error: 'fetch_failed',
      message: String(error?.message || error)
    };
  }

  return snapshot;
}

async function getCachedSnapshot(env) {
  const cache = caches.default;
  const cacheKey = new Request('https://wa-operations-dashboard.internal/cache/feeds-v4');
  const cached = await cache.match(cacheKey);

  if (cached) {
    return cached.json();
  }

  const snapshot = await buildSnapshot(env);
  const response = json(snapshot, 200, {
    'Cache-Control': `public, max-age=${CACHE_SECONDS}`
  });

  await cache.put(cacheKey, response.clone());
  return snapshot;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'GET') {
      return json({ error: 'method_not_allowed' }, 405, cors);
    }

    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'WA Operations Dashboard feed service',
        version: 4,
        endpoints: ['/api/health', '/api/feeds']
      }, 200, {
        ...cors,
        'Cache-Control': 'no-store'
      });
    }

    if (url.pathname === '/api/feeds') {
      const snapshot = await getCachedSnapshot(env);
      return json(snapshot, 200, {
        ...cors,
        'Cache-Control': 'public, max-age=60'
      });
    }

    return json({ error: 'not_found' }, 404, cors);
  }
};
