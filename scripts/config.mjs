// ============================================================
// config.mjs — edit this file to change feeds and filters
// ============================================================

// Each feed: { id, name, url, max?, maxAgeDays?, priority?, allowPaths? }
//   id          — used as CSS class on source tags in index.html
//   name        — display label (e.g. "[THE BLOCK]" in ticker)
//   url         — RSS or Atom feed URL
//   max         — max stories to pull (default: MAX_PER_FEED)
//   maxAgeDays  — exclude stories older than N days (default: MAX_AGE_DAYS)
//   priority    — integer boost, default 0. Each point adds PRIORITY_BOOST_HOURS
//                 to the story's effective age for sorting purposes, floating
//                 it above same-era stories from lower-priority feeds.
//   allowPaths  — if set, only stories whose link starts with one
//                 of these prefixes are kept
export const FEEDS = [
  { id: 'block', name: 'THE BLOCK', url: 'https://www.theblock.co/rss.xml' },
  {
    id: 'coindesk', name: 'COINDESK', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    // allowPaths: ['https://www.coindesk.com/policy', 'https://www.coindesk.com/markets'],
  },
  { id: 'cointelegraph', name: 'COINTELEGRAPH', url: 'https://cointelegraph.com/rss' },
  { id: 'bitcoinmag', name: 'BITCOIN MAGAZINE', url: 'https://bitcoinmagazine.com/.rss/full/' },
  { id: 'decrypt', name: 'DECRYPT', url: 'https://decrypt.co/feed' },
  { id: 'defiant', name: 'THE DEFIANT', url: 'https://thedefiant.io/api/feed' },
  { id: 'bitcoinops', name: 'BITCOIN OPTECH', url: 'https://bitcoinops.org/feed.xml', priority: 2 },
  { id: 'bcannounce', name: 'BTC CORE ANN', url: 'https://bitcoincore.org/en/announcements.xml', max: 5, maxAgeDays: 30, priority: 6 },
  { id: 'bitcoincore', name: 'BITCOIN CORE', url: 'https://bitcoincore.org/en/rss.xml', max: 5, maxAgeDays: 30, priority: 6 },
];

// Regex filters — any match excludes the story entirely.
// Case-insensitive is applied automatically.
// Accepts RegExp literals or plain strings (compiled as patterns).
//
// Examples:
//   /eth(ereum|erscan)?|weth/  — covers eth-family terms
//   /price prediction/
//   /sponsored|promoted/
export const FILTERS = [
  /\bIPO\b/,
  /\bKalshi\b/,
  /\bTrump\b/,
  /AI\b/,
  /\bstocks\b/,
  /\bstock price\b/,
  /\bscammer/,
  /\bSTRC\b/,
  /\bMSTR\b/
];

// Default max stories per feed (overridden per-feed with `max`)
export const MAX_PER_FEED = 30;

// Exclude stories older than this many days. Set to 0 to disable.
export const MAX_AGE_DAYS = 2;

// Each priority point adds this many hours to a story's effective date for sorting.
export const PRIORITY_BOOST_HOURS = 12;
