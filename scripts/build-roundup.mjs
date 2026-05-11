#!/usr/bin/env node
// ============================================================
// build-roundup.mjs
// Automated news roundup builder for the MIT DCI.
//
// Pipeline: Ingest (RSS + Email) → Deduplicate → Summarize
//           (Claude) → Categorize (Claude) → Emit YAML draft
//
// Usage:
//   node scripts/build-roundup.mjs
//   node scripts/build-roundup.mjs --no-email   # skip email
//   node scripts/build-roundup.mjs --no-state   # ignore processed state
//
// Requires: ANTHROPIC_API_KEY in .env or environment.
// Optional: GMAIL_USER, GMAIL_APP_PASSWORD for email ingestion.
// ============================================================

import { config } from 'dotenv';
config({ override: true });
import fs from 'node:fs/promises';
import path from 'node:path';

import { ingestRss } from './roundup/ingest-rss.mjs';
import { ingestEmail } from './roundup/ingest-email.mjs';
import { deduplicateArticles } from './roundup/dedup.mjs';
import { summarizeArticles } from './roundup/summarize.mjs';
import { categorizeArticles } from './roundup/categorize.mjs';
import { emitYaml } from './roundup/emit-yaml.mjs';
import { loadProcessed, saveProcessed, filterUnprocessed } from './roundup/state.mjs';

const DRAFTS_DIR = path.resolve(process.cwd(), 'curated/drafts');

async function main() {
  const flags = new Set(process.argv.slice(2));

  // Validate
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is required. Set it in .env or your environment.');
    process.exit(1);
  }

  const startTime = Date.now();
  console.log('=== MIT DCI Roundup Builder ===\n');

  // 1. Load processed state
  let processed = new Map();
  if (!flags.has('--no-state')) {
    processed = await loadProcessed();
    console.log(`Loaded ${processed.size} previously processed URLs\n`);
  }

  // 2. Ingest from all sources
  console.log('Ingesting...');
  const [rssArticles, emailArticles] = await Promise.all([
    ingestRss(),
    flags.has('--no-email') ? Promise.resolve([]) : ingestEmail(),
  ]);

  let allArticles = [...rssArticles, ...emailArticles];
  console.log(`\nTotal ingested: ${allArticles.length} (${rssArticles.length} RSS, ${emailArticles.length} email)\n`);

  if (!allArticles.length) {
    console.log('No articles found. Nothing to do.');
    return;
  }

  // 3. Filter out already-processed
  if (!flags.has('--no-state')) {
    const before = allArticles.length;
    allArticles = filterUnprocessed(allArticles, processed);
    const skipped = before - allArticles.length;
    if (skipped) console.log(`Skipped ${skipped} already-processed articles`);
  }

  if (!allArticles.length) {
    console.log('All articles already processed. Nothing new to do.');
    return;
  }

  // 4. Deduplicate
  console.log('Deduplicating...');
  const deduped = deduplicateArticles(allArticles);
  console.log(`After dedup: ${deduped.length} unique stories (from ${allArticles.length})\n`);

  // 5. Summarize with Claude
  console.log('Summarizing...');
  const summarized = await summarizeArticles(deduped);
  console.log('');

  // 6. Categorize with Claude
  console.log('Categorizing...');
  const sectioned = await categorizeArticles(summarized);
  console.log('');

  // 7. Emit YAML
  const today = new Date().toISOString().slice(0, 10);
  const yaml = emitYaml(sectioned, today);

  await fs.mkdir(DRAFTS_DIR, { recursive: true });
  const outPath = path.join(DRAFTS_DIR, `${today}.yaml`);
  await fs.writeFile(outPath, yaml, 'utf8');

  // 8. Update processed state
  if (!flags.has('--no-state')) {
    const newUrls = deduped.map(a => a.normalizedUrl);
    await saveProcessed(processed, newUrls);
  }

  // 9. Summary
  const sectionCounts = Object.entries(sectioned)
    .filter(([, articles]) => articles?.length)
    .map(([name, articles]) => `  ${name}: ${articles.length}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('=== Done ===');
  console.log(`Draft saved to: ${outPath}`);
  console.log(`Total stories: ${Object.values(sectioned).reduce((n, a) => n + (a?.length || 0), 0)}`);
  console.log(sectionCounts.join('\n'));
  console.log(`Time: ${elapsed}s`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review: cat ${outPath}`);
  console.log(`  2. Edit as needed`);
  console.log(`  3. Move to curated/: mv ${outPath} curated/${today}.yaml`);
  console.log(`  4. Build feed: node scripts/build-feed.mjs`);
  console.log(`  5. Commit and push`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
