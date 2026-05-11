// ============================================================
// emit-yaml.mjs — generate YAML roundup in the curated format
// ============================================================

import { ROUNDUP_SECTIONS, AUTHOR } from '../roundup-config.mjs';

function quoteYaml(s) {
  // Always double-quote to handle colons, apostrophes, special chars
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function formatDate(d) {
  const dt = new Date(d);
  return dt.toISOString().slice(0, 10);
}

function formatTitle(date) {
  const dt = new Date(date + 'T12:00:00Z');
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  return `Crypto News Roundup - ${months[dt.getUTCMonth()]} ${dt.getUTCDate()}, ${dt.getUTCFullYear()}`;
}

export function emitYaml(sectionedArticles, date) {
  const dateStr = formatDate(date || new Date());
  const lines = [];

  lines.push(`title: ${quoteYaml(formatTitle(dateStr))}`);
  lines.push(`date: ${dateStr}`);
  lines.push(`author: ${AUTHOR}`);
  lines.push('');
  lines.push('sections:');

  for (const sectionName of ROUNDUP_SECTIONS) {
    const stories = sectionedArticles[sectionName];
    if (!stories?.length) continue;

    lines.push(`  - name: ${sectionName}`);
    lines.push('    stories:');

    for (const story of stories) {
      lines.push(`      - title: ${quoteYaml(story.title)}`);
      lines.push(`        url: ${story.normalizedUrl || story.url}`);
      lines.push(`        source: ${story.source}`);
      if (story.topNews) {
        lines.push('        top_news: true');
      }

      if (story.summary?.length) {
        lines.push('        summary: |');
        for (const bullet of story.summary) {
          lines.push(`          ${bullet}`);
        }
      }

      if (story.seeAlso?.length) {
        lines.push('        see_also:');
        for (const sa of story.seeAlso) {
          lines.push(`          - title: ${quoteYaml(sa.title)}`);
          lines.push(`            url: ${sa.url}`);
        }
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}
