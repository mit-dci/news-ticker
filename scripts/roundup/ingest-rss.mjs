// ============================================================
// ingest-rss.mjs — fetch articles from RSS/Atom feeds
// Reuses parsing logic from fetch-feeds.mjs (copied here to
// avoid modifying the existing ticker pipeline).
// ============================================================

import { FEEDS, FILTERS } from '../config.mjs';
import { EXTRA_FEEDS, LOOKBACK_DAYS } from '../roundup-config.mjs';
import { normalizeUrl, createArticle } from './normalize.mjs';

// ------------------------------------------------------------
// XML parsing utilities (from fetch-feeds.mjs)
// ------------------------------------------------------------
function decodeEntities(s) {
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = parseInt(n, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  s = s.replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n) => {
    const code = parseInt(n, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  const named = {
    'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'",
    'nbsp': ' ', 'hellip': '…', 'mdash': '—', 'ndash': '–',
    'lsquo': '\u2018', 'rsquo': '\u2019',
    'ldquo': '\u201C', 'rdquo': '\u201D',
    'laquo': '«', 'raquo': '»',
    'copy': '©', 'reg': '®', 'trade': '™',
    'deg': '°', 'para': '¶', 'sect': '§',
    'cent': '¢', 'pound': '£', 'euro': '€', 'yen': '¥'
  };
  s = s.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(named, name) ? named[name] : match
  );
  return s;
}

function extractTag(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  if (!m) return '';
  let inner = m[1].trim();
  const cdata = inner.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) inner = cdata[1];
  return decodeEntities(inner).trim();
}

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function parseFeed(xml, feed, maxItems) {
  const limit = maxItems;
  const items = [];
  const isAtom = /<entry[\s>]/i.test(xml);
  const tag = isAtom ? 'entry' : 'item';
  const itemRe = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');

  let match;
  while ((match = itemRe.exec(xml)) && items.length < limit) {
    const block = match[1];
    const title = stripHtml(extractTag(block, 'title'));
    let link = '';
    if (isAtom) {
      const lm = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      link = lm ? lm[1] : '';
    } else {
      link = extractTag(block, 'link');
    }
    const dateStr = isAtom
      ? (extractTag(block, 'published') || extractTag(block, 'updated'))
      : extractTag(block, 'pubDate');
    const desc = stripHtml(isAtom
      ? (extractTag(block, 'summary') || extractTag(block, 'content'))
      : extractTag(block, 'description'));

    if (!title || !link) continue;
    items.push({ source: feed.name, title, link, desc,
      date: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
    });
  }
  return items;
}

// ------------------------------------------------------------
// Filtering
// ------------------------------------------------------------
const COMPILED_FILTERS = FILTERS
  .map(f => {
    if (f instanceof RegExp) return new RegExp(f.source, f.flags.includes('i') ? f.flags : f.flags + 'i');
    if (typeof f === 'string') return new RegExp(f, 'i');
    return null;
  })
  .filter(Boolean);

function isFilteredOut(item) {
  const hay = (item.title || '') + ' ' + (item.desc || '');
  return COMPILED_FILTERS.some(re => re.test(hay));
}

// ------------------------------------------------------------
// Main export
// ------------------------------------------------------------
export async function ingestRss() {
  const allFeeds = [...FEEDS, ...EXTRA_FEEDS];
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;

  async function fetchOneFeed(feed) {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DCIRoundupBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    return parseFeed(xml, feed, 50);
  }

  const results = await Promise.allSettled(allFeeds.map(fetchOneFeed));
  const articles = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  RSS ${allFeeds[i].name}: ${r.value.length} items`);
      for (const item of r.value) {
        if (new Date(item.date).getTime() < cutoff) continue;
        if (isFilteredOut(item)) continue;
        articles.push(createArticle({
          title: item.title,
          url: item.link,
          source: item.source,
          date: item.date,
          description: item.desc,
          origin: 'rss',
        }));
      }
    } else {
      console.error(`  RSS ${allFeeds[i].name}: FAILED — ${r.reason.message}`);
    }
  });

  return articles;
}
