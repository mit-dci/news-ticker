#!/usr/bin/env node
// ============================================================
// build-feed.mjs
// Reads YAML roundup files from curated/, generates feed.xml
// (RSS 2.0) at the repo root. No npm dependencies — uses a
// minimal YAML parser that handles the subset we actually use.
//
// Run locally:   node scripts/build-feed.mjs
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';

const CURATED_DIR = path.resolve(process.cwd(), 'curated');
const OUTPUT_PATH = path.resolve(process.cwd(), 'feed.xml');

const FEED_TITLE = 'MIT DCI – Curated Crypto News';
const FEED_LINK = 'https://mit-dci.github.io/news-ticker/';
const FEED_DESC = 'Weekly curated roundup of cryptocurrency and digital currency news from the MIT Media Lab Digital Currency Initiative.';

// ------------------------------------------------------------
// Minimal YAML parser
// Handles: scalars, quoted strings, block scalars (|), lists
// of objects with nested keys, and see_also sub-lists.
// This is NOT a general-purpose YAML parser — it covers exactly
// the subset used in the curated roundup files.
// ------------------------------------------------------------
function parseYaml(text) {
  const lines = text.split('\n');
  const result = {};
  let i = 0;

  function indentOf(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  function parseValue(val) {
    if (val === '' || val === '~' || val === 'null') return null;
    if (val === 'true') return true;
    if (val === 'false') return false;
    // Remove surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      return val.slice(1, -1);
    }
    // Number
    if (/^-?\d+(\.\d+)?$/.test(val)) return Number(val);
    return val;
  }

  function readBlockScalar(baseIndent) {
    const contentLines = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '') {
        contentLines.push('');
        i++;
        continue;
      }
      if (indentOf(line) <= baseIndent) break;
      contentLines.push(line.trim());
      i++;
    }
    // Trim trailing empty lines
    while (contentLines.length && contentLines[contentLines.length - 1] === '') {
      contentLines.pop();
    }
    return contentLines.join('\n');
  }

  function parseList(baseIndent) {
    const arr = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === '' || line.trim().startsWith('#')) { i++; continue; }
      const ci = indentOf(line);
      if (ci < baseIndent) break;
      if (ci > baseIndent && !line.trimStart().startsWith('-')) { i++; continue; }
      if (!line.trimStart().startsWith('-')) break;

      const content = line.trimStart().slice(1).trim();
      // Is this a "- key: value" (object item) or "- plain string"?
      const kvMatch = content.match(/^(\w[\w_]*)\s*:\s*(.*)/);
      if (kvMatch) {
        // Object item
        const obj = {};
        obj[kvMatch[1]] = kvMatch[2] === '|'
          ? (i++, readBlockScalar(ci + 2))
          : parseValue(kvMatch[2]);
        i++;
        // Read additional keys at deeper indent
        while (i < lines.length) {
          const nline = lines[i];
          if (nline.trim() === '' || nline.trim().startsWith('#')) { i++; continue; }
          const ni = indentOf(nline);
          if (ni <= ci) break;
          const nkv = nline.trim().match(/^(\w[\w_]*)\s*:\s*(.*)/);
          if (nkv) {
            if (nkv[2] === '' || nkv[2] === '|') {
              // Could be a block scalar or a nested list
              i++;
              if (i < lines.length && lines[i].trimStart().startsWith('-')) {
                obj[nkv[1]] = parseList(indentOf(lines[i]));
              } else if (nkv[2] === '|') {
                obj[nkv[1]] = readBlockScalar(ni);
              } else {
                obj[nkv[1]] = null;
              }
            } else {
              obj[nkv[1]] = parseValue(nkv[2]);
              i++;
            }
          } else if (nline.trimStart().startsWith('-')) {
            break;
          } else {
            i++;
          }
        }
        arr.push(obj);
      } else {
        // Plain string item
        arr.push(parseValue(content));
        i++;
      }
    }
    return arr;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '' || line.trim().startsWith('#') || line.trim() === '---') {
      i++;
      continue;
    }
    const kv = line.match(/^(\w[\w_]*)\s*:\s*(.*)/);
    if (kv) {
      const key = kv[1];
      const val = kv[2];
      if (val === '' || val === '|') {
        i++;
        if (i < lines.length && lines[i].trimStart().startsWith('-')) {
          result[key] = parseList(indentOf(lines[i]));
        } else if (val === '|') {
          result[key] = readBlockScalar(indentOf(line) + 2);
        } else {
          result[key] = null;
        }
      } else {
        result[key] = parseValue(val);
        i++;
      }
    } else {
      i++;
    }
  }

  return result;
}

// ------------------------------------------------------------
// HTML rendering for a single roundup
// ------------------------------------------------------------
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRoundup(data) {
  const parts = [];
  if (data.author) {
    parts.push(`<p><strong>Prepared by ${escapeXml(data.author)}</strong></p>`);
  }

  for (const section of (data.sections || [])) {
    parts.push(`<h2>${escapeXml(section.name)}</h2>`);
    parts.push('<ul>');
    for (const story of (section.stories || [])) {
      parts.push('<li>');
      parts.push(`<strong><a href="${escapeXml(story.url)}">${escapeXml(story.source)} - ${escapeXml(story.title)}</a></strong>`);
      if (story.summary) {
        parts.push('<ul>');
        for (const line of story.summary.split('\n').filter(l => l.trim())) {
          parts.push(`<li>${escapeXml(line.trim())}</li>`);
        }
        parts.push('</ul>');
      }
      if (story.see_also?.length) {
        parts.push('<p><em>See Also:</em></p><ul>');
        for (const sa of story.see_also) {
          parts.push(`<li><a href="${escapeXml(sa.url)}">${escapeXml(sa.title)}</a></li>`);
        }
        parts.push('</ul>');
      }
      parts.push('</li>');
    }
    parts.push('</ul>');
  }

  return parts.join('\n');
}

// ------------------------------------------------------------
// RSS generation
// ------------------------------------------------------------
function buildRss(roundups) {
  // Sort newest first
  roundups.sort((a, b) => new Date(b.date) - new Date(a.date));

  const items = roundups.map(r => {
    const pubDate = new Date(r.date + 'T12:00:00Z').toUTCString();
    const storyCount = (r.sections || []).reduce((n, s) => n + (s.stories || []).length, 0);
    const html = renderRoundup(r);
    const guid = `mit-dci-roundup-${r.date}`;

    return `    <item>
      <title>${escapeXml(r.title)}</title>
      <link>${escapeXml(FEED_LINK)}</link>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(`${storyCount} stories across ${(r.sections || []).length} categories.`)}</description>
      <content:encoded><![CDATA[${html}]]></content:encoded>
    </item>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:content="http://purl.org/rss/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(FEED_TITLE)}</title>
    <link>${escapeXml(FEED_LINK)}</link>
    <description>${escapeXml(FEED_DESC)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(FEED_LINK + 'feed.xml')}" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>
`;
}

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  let files;
  try {
    files = await fs.readdir(CURATED_DIR);
  } catch {
    console.log('No curated/ directory found. Creating empty feed.');
    await fs.writeFile(OUTPUT_PATH, buildRss([]), 'utf8');
    return;
  }

  const yamlFiles = files
    .filter(f => (f.endsWith('.yaml') || f.endsWith('.yml')) && !f.startsWith('_'))
    .sort();

  if (!yamlFiles.length) {
    console.log('No YAML files found in curated/. Creating empty feed.');
    await fs.writeFile(OUTPUT_PATH, buildRss([]), 'utf8');
    return;
  }

  const roundups = [];
  for (const file of yamlFiles) {
    try {
      const raw = await fs.readFile(path.join(CURATED_DIR, file), 'utf8');
      const data = parseYaml(raw);
      if (!data.title || !data.date) {
        console.warn(`  Skipping ${file}: missing title or date`);
        continue;
      }
      roundups.push(data);
      const storyCount = (data.sections || []).reduce((n, s) => n + (s.stories || []).length, 0);
      console.log(`  ${file}: ${storyCount} stories in ${(data.sections || []).length} sections`);
    } catch (err) {
      console.error(`  Error parsing ${file}: ${err.message}`);
    }
  }

  await fs.writeFile(OUTPUT_PATH, buildRss(roundups), 'utf8');
  console.log(`Wrote feed.xml with ${roundups.length} roundup(s)`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
