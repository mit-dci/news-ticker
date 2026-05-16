// ============================================================
// config.mjs — edit this file to change feeds and filters
// ============================================================

// Each feed: { id, name, url, max?, maxAgeDays?, priority?, allowPaths?, requireMatch? }
//   id           — used as CSS class on source tags in index.html
//   name         — display label (e.g. "[THE BLOCK]" in ticker)
//   url          — RSS or Atom feed URL
//   max          — max stories to pull (default: MAX_PER_FEED)
//   maxAgeDays   — exclude stories older than N days (default: MAX_AGE_DAYS)
//   priority     — integer boost, default 0. Each point adds PRIORITY_BOOST_HOURS
//                  to the story's effective age for sorting purposes, floating
//                  it above same-era stories from lower-priority feeds.
//   allowPaths   — if set, only stories whose link starts with one
//                  of these prefixes are kept
//   requireMatch — if set, only stories whose title+description matches
//                  this regex are kept (useful for broad feeds)
// Require-match filter for broad feeds — only keep stories mentioning
// crypto/blockchain/fintech terms. Case-insensitive.
const CRYPTO_MATCH = /\b(crypto|bitcoin|BTC|blockchain|stablecoin|CBDC|central bank digital|digital currency|digital asset|tokeniz|DeFi|decentralized finance|fintech|web3|ethereum|ETH|Tether|USDC|USDT|Ripple|XRP|Coinbase|Binance|mining|Lightning Network|smart contract|digital dollar|digital euro|digital yuan|e-CNY)\b/i;

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
  { id: 'coincenter', name: 'COIN CENTER', url: 'https://coincenter.org/feed/', priority: 2 },
  { id: 'fed', name: 'FEDERAL RESERVE', url: 'https://www.federalreserve.gov/feeds/speeches.xml', requireMatch: CRYPTO_MATCH },
  { id: 'techcrunch', name: 'TECHCRUNCH', url: 'https://techcrunch.com/category/cryptocurrency/feed/' },
  { id: 'bis', name: 'BIS', url: 'https://www.bis.org/doclist/bis_fsi_publs.rss', requireMatch: CRYPTO_MATCH },
  { id: 'pymnts', name: 'PYMNTS', url: 'https://www.pymnts.com/feed/', requireMatch: CRYPTO_MATCH },
  { id: 'finextra', name: 'FINEXTRA', url: 'https://www.finextra.com/rss/headlines.aspx', requireMatch: CRYPTO_MATCH },
  { id: 'ft', name: 'FINANCIAL TIMES', url: 'https://www.ft.com/markets?format=rss', requireMatch: CRYPTO_MATCH },
  { id: 'economist', name: 'THE ECONOMIST', url: 'https://www.economist.com/finance-and-economics/rss.xml', requireMatch: CRYPTO_MATCH },
  { id: 'wsj', name: 'WALL STREET JOURNAL', url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', requireMatch: CRYPTO_MATCH },
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
  /\bMSTR\b/,
  /GPT/,
  /\bPAC\b/,
  /\bCoinDesk 20\b/,
  /\bprice\b.{0,30}\b(drops?|rises?|falls?|gains?|surges?|dips?|crash|climbs?|declines?|slips?|jumps?|rall(y|ies)|tanks?|soars?|plunges?|sinks?|pumps?|slides?)/,
  /\b(drops?|rises?|falls?|gains?|surges?|crash|climbs?|declines?|slips?|jumps?|rall(y|ies)|tanks?|soars?|plunges?|sinks?|pumps?|slides?)\b.{0,20}\d+%/,
  /\bprice (prediction|analysis|target|forecast)/,
];

// Term-based priority boost — stories matching these patterns get a boost
// just like feed-level priority. Each point adds PRIORITY_BOOST_HOURS to
// the story's effective age. Matched stories are also visually highlighted.
//   pattern — RegExp or string (case-insensitive)
//   boost   — integer priority points (same scale as feed priority)
export const PRIORITY_TERMS = [
  { pattern: /quantum/i, boost: 3 },
];

// Default max stories per feed (overridden per-feed with `max`)
export const MAX_PER_FEED = 30;

// Exclude stories older than this many days. Set to 0 to disable.
export const MAX_AGE_DAYS = 2;

// Each priority point adds this many hours to a story's effective date for sorting.
export const PRIORITY_BOOST_HOURS = 12;
