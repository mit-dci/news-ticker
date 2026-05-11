// ============================================================
// normalize.mjs — URL normalization and article factory
// ============================================================

import crypto from 'node:crypto';

const TRACKING_PARAMS = /[?&](utm_\w+|_bhlid|_hsenc|_hsmi|guccounter|member|ref|source|medium|campaign|mc_cid|mc_eid|fbclid|gclid|msclkid|oly_enc_id|oly_anon_id|__s|vero_id|_ke|trk|trkCampaign|sc_channel|sc_campaign|sc_content|sc_medium|sc_detail|sc_segment|sc_country|sc_funnel|sc_outcome)=[^&]*/gi;

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Strip tracking params
    let clean = u.origin + u.pathname;
    // Preserve non-tracking query params
    const kept = [];
    for (const [k, v] of u.searchParams) {
      if (!TRACKING_PARAMS.source.includes(k)) kept.push(`${k}=${v}`);
    }
    // Actually re-test each param individually
    const nonTracking = [];
    for (const [k, v] of u.searchParams) {
      if (!/^(utm_\w+|_bhlid|_hsenc|_hsmi|guccounter|member|ref|source|medium|campaign|mc_cid|mc_eid|fbclid|gclid|msclkid|oly_enc_id|oly_anon_id|__s|vero_id|_ke|trk|trkCampaign|sc_\w+)$/i.test(k)) {
        nonTracking.push(`${k}=${v}`);
      }
    }
    if (nonTracking.length) clean += '?' + nonTracking.join('&');
    // Remove www prefix
    clean = clean.replace(/^(https?:\/\/)www\./, '$1');
    // Remove trailing slash
    clean = clean.replace(/\/+$/, '');
    // Lowercase the host portion
    return clean.replace(/^(https?:\/\/[^/]+)/, (m) => m.toLowerCase());
  } catch {
    return url;
  }
}

export function createArticle({ title, url, source, date, description, fullText, origin, emailSender }) {
  const normalized = normalizeUrl(url);
  const id = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  return {
    id,
    title: title?.trim() || '',
    url: url?.trim() || '',
    normalizedUrl: normalized,
    source: source?.trim() || '',
    date: date || new Date().toISOString(),
    description: description?.trim() || '',
    fullText: fullText || null,
    origin: origin || 'rss',
    emailSender: emailSender || null,
  };
}
