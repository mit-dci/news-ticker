// ============================================================
// state.mjs — track processed articles across runs
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';

const STATE_PATH = path.resolve(process.cwd(), 'curated/drafts/.processed.json');
const MAX_AGE_DAYS = 14;

export async function loadProcessed() {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const data = JSON.parse(raw);
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

export async function saveProcessed(existing, newUrls) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const merged = new Map(existing);

  // Add new entries
  const now = Date.now();
  for (const url of newUrls) {
    merged.set(url, now);
  }

  // Prune old entries
  for (const [url, ts] of merged) {
    if (ts < cutoff) merged.delete(url);
  }

  const obj = Object.fromEntries(merged);
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function filterUnprocessed(articles, processed) {
  return articles.filter(a => !processed.has(a.normalizedUrl));
}
