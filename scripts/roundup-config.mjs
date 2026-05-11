// ============================================================
// roundup-config.mjs — configuration for the weekly roundup builder
// ============================================================

export { FEEDS, FILTERS } from './config.mjs';

// Additional feeds to pull for the curated roundup (not used by the ticker).
export const EXTRA_FEEDS = [
  { id: 'pymnts', name: 'PYMNTS', url: 'https://www.pymnts.com/feed/' },
  { id: 'finextra', name: 'FINEXTRA', url: 'https://www.finextra.com/rss/headlines.aspx' },
];

// Gmail senders to pull newsletters from.
// The agent reads all emails from these senders in the last LOOKBACK_DAYS.
export const EMAIL_SENDERS = [
  // Add your newsletter sender addresses here, e.g.:
  // { name: 'The Block Daily', from: 'daily@theblock.co' },
  // { name: 'Bankless', from: 'newsletter@bankless.com' },
  // { name: 'This Week in Fintech', from: 'newsletters@thisweekinfintech.com' },
];

// How many days back to look for articles (RSS and email).
export const LOOKBACK_DAYS = 7;

// Sections for the roundup, in display order.
export const ROUNDUP_SECTIONS = [
  'US',
  'International Organizations',
  'Company Updates',
  'Top Thought Pieces / Interviews',
  'Europe / Canada / UK',
  'LATAM',
  'MENA',
  'Africa',
  'China + HK',
  'India',
  'Asia Pacific',
];

// Author credited on the roundup.
export const AUTHOR = 'William Peracchio';

// Claude model for summarization and categorization.
export const MODEL = 'claude-sonnet-4-6';

// Max articles to include in the final roundup.
export const MAX_ROUNDUP_ARTICLES = 60;

// Batch size for summarization API calls.
export const SUMMARIZE_BATCH_SIZE = 10;
