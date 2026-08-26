export function decodeXml(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

export function stripHtml(value = '') {
  return decodeXml(value)
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeName(name) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstTag(xml, names) {
  for (const name of names) {
    const safe = safeName(name);
    const match = String(xml).match(new RegExp(`<(?:[A-Za-z0-9_-]+:)?${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safe}>`, 'i'));
    if (match) return decodeXml(match[1]).trim();
  }
  return '';
}

function allBlocks(xml, name) {
  const safe = safeName(name);
  return [...String(xml).matchAll(new RegExp(`<(?:[A-Za-z0-9_-]+:)?${safe}\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${safe}>`, 'gi'))].map(m => m[1]);
}

function linkFromItem(xml) {
  const direct = firstTag(xml, ['link']);
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const href = String(xml).match(/<(?:[A-Za-z0-9_-]+:)?link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i);
  return href ? decodeXml(href[1]).trim() : direct;
}

function parsePoint(text) {
  if (!text) return null;
  const nums = text.trim().split(/[\s,]+/).map(Number);
  if (nums.length < 2 || !Number.isFinite(nums[0]) || !Number.isFinite(nums[1])) return null;
  return [nums[0], nums[1]];
}

function parsePolygon(text) {
  if (!text) return null;
  const nums = text.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  if (nums.length < 6 || nums.length % 2) return null;
  const points = [];
  for (let i = 0; i < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
  return points;
}

function parseCapCircle(text) {
  if (!text) return null;
  const first = String(text).trim().split(/\s+/)[0];
  return parsePoint(first);
}

export function parseSyndicationFeed(xml, { source = 'feed', defaultLink = '' } = {}) {
  const items = [...String(xml).matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  return items.map((match, index) => {
    const body = match[2];
    const title = stripHtml(firstTag(body, ['title'])) || `${source} item ${index + 1}`;
    const description = stripHtml(firstTag(body, ['description', 'summary', 'content']));
    const link = linkFromItem(body) || defaultLink;
    const published = firstTag(body, ['pubDate', 'published', 'updated', 'dc:date']);
    const id = firstTag(body, ['guid', 'id']) || link || `${source}-${index}-${title}`;
    const point = parsePoint(firstTag(body, ['georss:point', 'geo:point']));
    const polygon = parsePolygon(firstTag(body, ['georss:polygon']));
    return { id, source, title, description, link, published, point, polygon };
  });
}

export function parseCapAu(xml, { defaultLink = 'https://www.emergency.wa.gov.au/' } = {}) {
  const alerts = allBlocks(xml, 'alert');
  if (!alerts.length) return [];

  return alerts.map((alert, index) => {
    const infos = allBlocks(alert, 'info');
    const info = infos.find(i => /<(?:(?:[A-Za-z0-9_-]+):)?language\b[^>]*>\s*en(?:-|<)/i.test(i)) || infos[0] || alert;
    const areas = allBlocks(info, 'area');
    const areaDescriptions = areas.map(a => stripHtml(firstTag(a, ['areaDesc']))).filter(Boolean);
    const polygons = areas.map(a => parsePolygon(firstTag(a, ['polygon']))).filter(Boolean);
    const circlePoint = areas.map(a => parseCapCircle(firstTag(a, ['circle']))).find(Boolean) || null;

    const event = stripHtml(firstTag(info, ['event']));
    const headline = stripHtml(firstTag(info, ['headline']));
    const title = headline || event || `Emergency WA alert ${index + 1}`;
    const descriptionParts = [
      stripHtml(firstTag(info, ['description'])),
      stripHtml(firstTag(info, ['instruction']))
    ].filter(Boolean);

    const link = firstTag(info, ['web']) || defaultLink;
    const published = firstTag(alert, ['sent']) || firstTag(info, ['effective', 'onset']);
    const id = firstTag(alert, ['identifier']) || `${source}-${index}-${title}`;
    const severity = stripHtml(firstTag(info, ['severity']));
    const urgency = stripHtml(firstTag(info, ['urgency']));
    const certainty = stripHtml(firstTag(info, ['certainty']));
    const status = stripHtml(firstTag(alert, ['status']));
    const area = areaDescriptions.join(' · ');
    const polygon = polygons[0] || null;
    const point = circlePoint || (polygon?.length ? polygon[0] : null);

    return {
      id,
      source: 'Emergency WA',
      title,
      description: descriptionParts.join(' '),
      link,
      published,
      point,
      polygon,
      polygons,
      area,
      severity,
      urgency,
      certainty,
      status
    };
  });
}

export function parseEmergencyFeed(xml, options = {}) {
  const cap = parseCapAu(xml, options);
  if (cap.length) return cap;
  return parseSyndicationFeed(xml, {
    source: 'Emergency WA',
    defaultLink: options.defaultLink || 'https://www.emergency.wa.gov.au/'
  });
}
