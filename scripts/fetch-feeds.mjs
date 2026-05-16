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

  // Compile term-based priority patterns
  const compiledTerms = (PRIORITY_TERMS || []).map(t => {
    const re = t.pattern instanceof RegExp
      ? new RegExp(t.pattern.source, t.pattern.flags.includes('i') ? t.pattern.flags : t.pattern.flags + 'i')
      : new RegExp(t.pattern, 'i');
    return { re, boost: t.boost ?? 0 };
  });

  // Tag items that match priority terms and compute per-item term boost
  for (const item of kept) {
    const hay = (item.title || '') + ' ' + (item.desc || '');
    let termBoost = 0;
    for (const t of compiledTerms) {
      if (t.re.test(hay)) { termBoost = Math.max(termBoost, t.boost); item.priorityTerm = true; }
    }
    item.termBoost = termBoost;
  }

  const boostMs = PRIORITY_BOOST_HOURS * 3600000;
  const feedPriority = Object.fromEntries(FEEDS.map(f => [f.id, f.priority ?? 0]));
  kept.sort((a, b) => {
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
    items: kept
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
  console.log(`Wrote ${kept.length} items (${filteredOut} filtered out) to ${OUTPUT_PATH}`);
  if (errors.length) process.exitCode = 0; // partial success is still OK
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
