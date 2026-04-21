#!/usr/bin/env node
// preview-feeds.mjs
// Fetches and displays feed contents to stdout. No file writes.
// Run: node scripts/preview-feeds.mjs [--raw] [--filtered]
//
//   (no flags)     show items that would be kept in stories.json
//   --filtered     show only items that would be filtered out
//   --raw          show all items before filtering, labeled
//   --all          show kept + filtered, labeled

import { FEEDS, FILTERS, MAX_PER_FEED, MAX_AGE_DAYS, PRIORITY_BOOST_HOURS } from './config.mjs';

// ---- same compile/test logic as fetch-feeds.mjs ----
const COMPILED_FILTERS = FILTERS
  .map(f => {
    try {
      if (f instanceof RegExp) return new RegExp(f.source, f.flags.includes('i') ? f.flags : f.flags + 'i');
      if (typeof f === 'string') return new RegExp(f, 'i');
    } catch (e) {
      console.warn('Ignoring invalid filter:', f, e.message);
    }
    return null;
  })
  .filter(Boolean);

function isFilteredOut(item, feed) {
  const ageCap = feed?.maxAgeDays ?? MAX_AGE_DAYS;
  if (ageCap) {
    const ageDays = (Date.now() - new Date(item.date).getTime()) / 86400000;
    if (ageDays > ageCap) return true;
  }
  if (feed?.allowPaths?.length && !feed.allowPaths.some(p => item.link.startsWith(p))) return true;
  if (!COMPILED_FILTERS.length) return false;
  const hay = (item.title || '') + ' ' + (item.desc || '');
  return COMPILED_FILTERS.some(re => re.test(hay));
}

// ---- same XML parsing logic as fetch-feeds.mjs ----
function decodeEntities(s) {
  s = s.replace(/&#(\d+);/g, (_, n) => { const c = parseInt(n, 10); return Number.isFinite(c) ? String.fromCodePoint(c) : _; });
  s = s.replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n) => { const c = parseInt(n, 16); return Number.isFinite(c) ? String.fromCodePoint(c) : _; });
  const named = {
    'amp':'&','lt':'<','gt':'>','quot':'"','apos':"'",
    'nbsp':' ','hellip':'…','mdash':'—','ndash':'–',
    'lsquo':'\u2018','rsquo':'\u2019','ldquo':'\u201C','rdquo':'\u201D',
    'laquo':'«','raquo':'»','copy':'©','reg':'®','trade':'™',
    'deg':'°','para':'¶','sect':'§','cent':'¢','pound':'£','euro':'€','yen':'¥'
  };
  s = s.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(named, name) ? named[name] : m);
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

function stripHtml(s) { return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }

function parseFeed(xml, feed) {
  const limit = feed.max ?? MAX_PER_FEED;
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
    items.push({ source: feed.id, sourceName: feed.name, title, link, desc,
      date: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString() });
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CryptoWireBot/1.0; +https://github.com/)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(await res.text(), feed);
}

// ---- display ----
const RESET = '\x1b[0m', BOLD = '\x1b[1m', DIM = '\x1b[2m',
      RED = '\x1b[31m', YELLOW = '\x1b[33m', CYAN = '\x1b[36m', GREEN = '\x1b[32m';

function printItem(item, tag) {
  const label = tag === 'FILTERED'
    ? `${RED}[FILTERED]${RESET}`
    : tag === 'KEPT'
    ? `${GREEN}[KEPT]${RESET}    `
    : '';
  const prefix = label ? label + ' ' : '';
  console.log(`${prefix}${BOLD}${item.title}${RESET}`);
  console.log(`  ${DIM}${item.sourceName}  •  ${item.date.replace('T', ' ').replace('.000Z', ' UTC')}${RESET}`);
  console.log(`  ${CYAN}${item.link}${RESET}`);
  if (item.desc) {
    const snippet = item.desc.length > 140 ? item.desc.slice(0, 140) + '…' : item.desc;
    console.log(`  ${DIM}${snippet}${RESET}`);
  }
  console.log();
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const showRaw      = args.has('--raw');
  const showFiltered = args.has('--filtered');
  const showAll      = args.has('--all');

  console.log(`${BOLD}Fetching ${FEEDS.length} feed(s)…${RESET}\n`);

  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const all = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`${GREEN}✓${RESET} ${FEEDS[i].name}: ${r.value.length} items`);
      all.push(...r.value);
    } else {
      console.error(`${RED}✗${RESET} ${FEEDS[i].name}: ${r.reason.message}`);
    }
  });

  const boostMs = PRIORITY_BOOST_HOURS * 3600000;
  const feedPriority = Object.fromEntries(FEEDS.map(f => [f.id, f.priority ?? 0]));
  all.sort((a, b) => {
    const effA = new Date(a.date).getTime() + feedPriority[a.source] * boostMs;
    const effB = new Date(b.date).getTime() + feedPriority[b.source] * boostMs;
    return effB - effA;
  });

  const kept     = all.filter(i => !isFilteredOut(i, FEEDS.find(f => f.id === i.source)));
  const filtered = all.filter(i =>  isFilteredOut(i, FEEDS.find(f => f.id === i.source)));

  console.log(`\n${DIM}${all.length} total  •  ${kept.length} kept  •  ${filtered.length} filtered out${RESET}`);
  if (COMPILED_FILTERS.length) {
    console.log(`${DIM}Active filters: ${FILTERS.map(f => f.toString()).join(', ')}${RESET}`);
  }
  console.log();

  if (showRaw || showAll) {
    all.forEach(i => printItem(i, showAll ? (isFilteredOut(i, FEEDS.find(f => f.id === i.source)) ? 'FILTERED' : 'KEPT') : null));
  } else if (showFiltered) {
    if (!filtered.length) console.log(`${DIM}No items matched the filters.${RESET}\n`);
    else filtered.forEach(i => printItem(i, 'FILTERED'));
  } else {
    kept.forEach(i => printItem(i));
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
