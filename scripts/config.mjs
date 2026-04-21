// ============================================================
// config.mjs — edit this file to change feeds and filters
// ============================================================

// Each feed: { id, name, url, max?, allowPaths? }
//   id          — used as CSS class on source tags in index.html
//   name        — display label (e.g. "[THE BLOCK]" in ticker)
//   url         — RSS feed URL
//   max         — max stories to pull (default: MAX_PER_FEED)
//   allowPaths  — if set, only stories whose link starts with one
//                 of these prefixes are kept
export const FEEDS = [
  { id: 'block',         name: 'THE BLOCK',      url: 'https://www.theblock.co/rss.xml' },
  { id: 'coindesk',      name: 'COINDESK',        url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
    // allowPaths: ['https://www.coindesk.com/policy', 'https://www.coindesk.com/markets'],
  },
  { id: 'cointelegraph', name: 'COINTELEGRAPH',   url: 'https://cointelegraph.com/rss' },
  { id: 'bitcoinmag',   name: 'BITCOIN MAGAZINE', url: 'https://bitcoinmagazine.com/.rss/full/' },
  { id: 'decrypt',       name: 'DECRYPT',          url: 'https://decrypt.co/feed' },
  { id: 'defiant',       name: 'THE DEFIANT',      url: 'https://thedefiant.io/api/feed' },
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
  /\bAI\b/,
  /\bstocks\b/,
  /\bstock price\b/,
  /\bscammer/,
  /\bSTRC\b/,
  /\bMSTR\b/
];

// Default max stories per feed (overridden per-feed with `max`)
export const MAX_PER_FEED = 30;
