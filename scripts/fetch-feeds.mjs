#!/usr/bin/env node
// ============================================================
// fetch-feeds.mjs
// Pulls RSS from configured sources, applies filters, writes
// stories.json at the repo root. Runs in Node 20+ (uses built-in
// fetch). No npm dependencies.
//
// Run locally:   node scripts/fetch-feeds.mjs
// In CI:         see .github/workflows/update-feeds.yml
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import { FEEDS, FILTERS, PRIORITY_TERMS, MAX_PER_FEED, MAX_AGE_DAYS, PRIORITY_BOOST_HOURS } from './config.mjs';
const OUTPUT_PATH = path.resolve(process.cwd(), 'stories.json');

// ------------------------------------------------------------
// DEDUP — cluster stories covering the same event
// ------------------------------------------------------------
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has',
  'will', 'been', 'were', 'are', 'was', 'not', 'but', 'what', 'all',
  'can', 'had', 'her', 'his', 'its', 'our', 'than', 'then', 'them',
  'they', 'into', 'some', 'could', 'would', 'about', 'which', 'when',
  'make', 'like', 'just', 'over', 'such', 'take', 'also', 'more',
  'after', 'says', 'said', 'new', 'may',
]);

function tokenize(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
  );
}

function similarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;
  for (const w of smaller) if (larger.has(w)) intersection++;
  return intersection / smaller.size; // overlap coefficient
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('utm_source');
    u.searchParams.delete('utm_medium');
    u.searchParams.delete('utm_campaign');
    u.searchParams.delete('utm_content');
    u.searchParams.delete('utm_term');
    u.searchParams.delete('ref');
    let h = u.hostname.replace(/^www\./, '');
    return `${h}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch { return url; }
}

function dedup(items) {
  // Phase 1: exact URL matches
  const byUrl = new Map();
  for (const item of items) {
    const key = normalizeUrl(item.link);
    const existing = byUrl.get(key);
    if (existing) {
      existing.push(item);
    } else {
      byUrl.set(key, [item]);
    }
  }

  const unique = [];
  for (const group of byUrl.values()) {
    const primary = group.sort((a, b) => (b.desc?.length || 0) - (a.desc?.length || 0))[0];
    primary.alsoAt = group.filter(g => g !== primary).map(g => ({ source: g.sourceName, sourceId: g.source, url: g.link }));
    unique.push(primary);
  }

  // Phase 2: title similarity clustering
  const tokenized = unique.map(a => ({ item: a, tokens: tokenize(a.title) }));
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(i)) continue;
    const cluster = [i];
    used.add(i);

    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(j)) continue;
      if (similarity(tokenized[i].tokens, tokenized[j].tokens) >= 0.6) {
        cluster.push(j);
        used.add(j);
      }
    }

    if (cluster.length === 1) {
      clusters.push(tokenized[i].item);
    } else {
      // Pick primary: prefer longest description, then earliest date
      const group = cluster.map(idx => tokenized[idx].item);
      group.sort((a, b) => {
        const d = (b.desc?.length || 0) - (a.desc?.length || 0);
        if (d) return d;
        return new Date(a.date) - new Date(b.date);
      });
      const primary = group[0];
      const others = group.slice(1);
      primary.alsoAt = [
        ...(primary.alsoAt || []),
        ...others.map(o => ({ source: o.sourceName, sourceId: o.source, url: o.link })),
        ...others.flatMap(o => o.alsoAt || []),
      ];
      clusters.push(primary);
    }
  }

  return clusters;
}

// ------------------------------------------------------------
// FILTERS
// ------------------------------------------------------------
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
  const ageCap = feed.maxAgeDays ?? MAX_AGE_DAYS;
  if (ageCap) {
    const ageDays = (Date.now() - new Date(item.date).getTime()) / 86400000;
    if (ageDays > ageCap) return true;
  }
  if (feed.allowPaths?.length && !feed.allowPaths.some(p => item.link.startsWith(p))) return true;
  const hay = (item.title || '') + ' ' + (item.desc || '');
  if (feed.requireMatch && !feed.requireMatch.test(hay)) return true;
  if (!COMPILED_FILTERS.length) return false;
  return COMPILED_FILTERS.some(re => re.test(hay));
}

// ------------------------------------------------------------
// Minimal RSS parser. RSS 2.0 is extremely predictable: a list
// of <item> elements with <title>, <link>, <pubDate>, <description>.
// Regex-based to keep this script dependency-free.
// ------------------------------------------------------------
function decodeEntities(s) {
  // Numeric entities: &#1234; and &#x4A; (decimal and hex).
  // These cover all the smart quotes, dashes, ellipses, accented
  // characters, emoji, etc. that news sites actually use.
  s = s.replace(/&#(\d+);/g, (_, n) => {
    const code = parseInt(n, 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });
  s = s.replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n) => {
    const code = parseInt(n, 16);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _;
  });

  // Common named entities. This is not exhaustive; anything exotic that
  // isn't here will survive as the raw entity, which is rare in practice
  // for news feeds.
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
  s = s.replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(named, name) ? named[name] : match;
  });

  return s;
}

function extractTag(block, tag) {
  // Handle <tag>...</tag> and <tag><![CDATA[...]]></tag>
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

function parseFeed(xml, feed) {
  const limit = feed.max ?? MAX_PER_FEED;
  const items = [];

  // Detect Atom vs RSS. Atom uses <entry>, RSS uses <item>.
  const isAtom = /<entry[\s>]/i.test(xml);
  const tag = isAtom ? 'entry' : 'item';
  const itemRe = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');

  let match;
  while ((match = itemRe.exec(xml)) && items.length < limit) {
    const block = match[1];
    const title = stripHtml(extractTag(block, 'title'));

    // Atom: <link href="..."/> — RSS: <link>url</link>
    let link = '';
    if (isAtom) {
      const lm = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      link = lm ? lm[1] : '';
    } else {
      link = extractTag(block, 'link');
    }

    // Atom: <published> or <updated> — RSS: <pubDate>
    const dateStr = isAtom
      ? (extractTag(block, 'published') || extractTag(block, 'updated'))
      : extractTag(block, 'pubDate');

    // Atom: <summary> or <content> — RSS: <description>
    const desc = stripHtml(isAtom
      ? (extractTag(block, 'summary') || extractTag(block, 'content'))
      : extractTag(block, 'description'));

    if (!title || !link) continue;
    items.push({
      source: feed.id,
      sourceName: feed.name,
      title,
      link,
      desc,
      date: dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
    });
  }
  return items;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: {
      // Some CDNs 403 on "node"-looking UAs. Pretend to be a browser.
      'User-Agent': 'Mozilla/5.0 (compatible; CryptoWireBot/1.0; +https://github.com/)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*'
    }
  });
  if (!res.ok) throw new Error(`${feed.name}: HTTP ${res.status}`);
  const xml = await res.text();
  return parseFeed(xml, feed);
}

async function main() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));
  const collected = [];
  const errors = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      console.log(`  ${FEEDS[i].name}: ${r.value.length} items`);
      collected.push(...r.value);
    } else {
      errors.push(`${FEEDS[i].name}: ${r.reason.message}`);
      console.error(`  ${FEEDS[i].name}: FAILED — ${r.reason.message}`);
    }
  });

  const before = collected.length;
  const kept = collected.filter(i => !isFilteredOut(i, FEEDS.find(f => f.id === i.source)));
  const filteredOut = before - kept.length;

  // Deduplicate stories covering the same event
  const deduped = dedup(kept);
  const dupsMerged = kept.length - deduped.length;
  if (dupsMerged) console.log(`  Dedup: merged ${dupsMerged} duplicate(s), ${deduped.length} unique stories remain`);

  // Compile term-based priority patterns
  const compiledTerms = (PRIORITY_TERMS || []).map(t => {
    const re = t.pattern instanceof RegExp
      ? new RegExp(t.pattern.source, t.pattern.flags.includes('i') ? t.pattern.flags : t.pattern.flags + 'i')
      : new RegExp(t.pattern, 'i');
    return { re, boost: t.boost ?? 0 };
  });

  // Tag items that match priority terms and compute per-item term boost
  for (const item of deduped) {
    const hay = (item.title || '') + ' ' + (item.desc || '');
    let termBoost = 0;
    for (const t of compiledTerms) {
      if (t.re.test(hay)) { termBoost = Math.max(termBoost, t.boost); item.priorityTerm = true; }
    }
    item.termBoost = termBoost;
  }

  const boostMs = PRIORITY_BOOST_HOURS * 3600000;
  const feedPriority = Object.fromEntries(FEEDS.map(f => [f.id, f.priority ?? 0]));
  deduped.sort((a, b) => {
    const effA = new Date(a.date).getTime() + (feedPriority[a.source] + (a.termBoost || 0)) * boostMs;
    const effB = new Date(b.date).getTime() + (feedPriority[b.source] + (b.termBoost || 0)) * boostMs;
    return effB - effA;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceCount: FEEDS.length,
    successCount: FEEDS.length - errors.length,
    filteredOut,
    errors,
    dupsMerged,
    items: deduped
  };

  // If every feed failed AND we have an existing stories.json, don't
  // overwrite it with an empty file -- better to keep stale data than
  // nothing. This makes the page resilient to upstream outages.
  if (errors.length === FEEDS.length) {
    try {
      await fs.access(OUTPUT_PATH);
      console.error('All feeds failed. Keeping existing stories.json.');
      process.exitCode = 1;
      return;
    } catch { /* no existing file — fall through and write the empty payload */ }
  }

  await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${deduped.length} items (${filteredOut} filtered out, ${dupsMerged} dupes merged) to ${OUTPUT_PATH}`);
  if (errors.length) process.exitCode = 0; // partial success is still OK
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
