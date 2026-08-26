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

function firstTag(xml, names) {
  for (const name of names) {
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = xml.match(new RegExp(`<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safe}>`, 'i'));
    if (match) return decodeXml(match[1]).trim();
  }
  return '';
}

function linkFromItem(xml) {
  const direct = firstTag(xml, ['link']);
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const href = xml.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?\s*>/i);
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
