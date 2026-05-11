// ============================================================
// ingest-email.mjs — read newsletter emails from Gmail via IMAP
// ============================================================

import { ImapFlow } from 'imapflow';
import { EMAIL_SENDERS, LOOKBACK_DAYS } from '../roundup-config.mjs';
import { normalizeUrl, createArticle } from './normalize.mjs';

// ------------------------------------------------------------
// HTML link extraction
// ------------------------------------------------------------
function extractLinksFromHtml(html) {
  const links = [];
  // Match <a href="...">text</a>
  const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let url = m[1].trim();
    let text = m[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!text || text.length < 5) continue;
    if (!url.startsWith('http')) continue;

    // Skip common non-article links
    if (/unsubscribe|manage.preferences|email-settings|view.in.browser|mailto:|twitter\.com|x\.com|facebook\.com|linkedin\.com\/share|t\.me\//i.test(url)) continue;
    if (/^(unsubscribe|view in browser|manage preferences|share|tweet|forward)/i.test(text)) continue;

    // Unwrap tracking redirects
    url = unwrapRedirect(url);

    links.push({ url, text });
  }
  return links;
}

function unwrapRedirect(url) {
  try {
    const u = new URL(url);
    // Substack click tracking
    if (u.hostname.includes('substack.com') && u.pathname.includes('/redirect')) {
      const real = u.searchParams.get('url') || u.searchParams.get('r');
      if (real) return real;
    }
    // Mailchimp click tracking
    if (u.hostname.includes('mailchimp.com') || u.hostname.includes('list-manage.com')) {
      const real = u.searchParams.get('u') || u.searchParams.get('url');
      if (real) return real;
    }
    // HubSpot
    if (u.hostname.includes('hubspot') && u.searchParams.has('__hstc')) {
      const real = u.searchParams.get('url');
      if (real) return real;
    }
    // Generic ?url= or ?redirect= pattern
    for (const key of ['url', 'redirect', 'redirect_url', 'target', 'destination']) {
      const val = u.searchParams.get(key);
      if (val && val.startsWith('http')) return val;
    }
  } catch { /* ignore */ }
  return url;
}

// Get surrounding paragraph text for context
function getContext(html, url) {
  // Find the paragraph/cell containing this link
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const contextRe = new RegExp(`<(?:p|td|div|li)[^>]*>[\\s\\S]{0,500}${escaped.slice(0, 40)}[\\s\\S]{0,500}<\\/(?:p|td|div|li)>`, 'i');
  const m = html.match(contextRe);
  if (m) {
    return m[0].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  }
  return '';
}

// ------------------------------------------------------------
// Main export
// ------------------------------------------------------------
export async function ingestEmail() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.log('  Email: skipped (no GMAIL_USER/GMAIL_APP_PASSWORD set)');
    return [];
  }

  if (!EMAIL_SENDERS.length) {
    console.log('  Email: skipped (no EMAIL_SENDERS configured)');
    return [];
  }

  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass },
    logger: false,
  });

  const articles = [];

  try {
    await client.connect();
    await client.mailboxOpen('INBOX');

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000);

    for (const sender of EMAIL_SENDERS) {
      try {
        const messages = await client.search({
          from: sender.from,
          since,
        });

        if (!messages.length) {
          console.log(`  Email ${sender.name}: 0 messages`);
          continue;
        }

        let linkCount = 0;
        for (const uid of messages) {
          const msg = await client.fetchOne(uid, { source: true });
          const raw = msg.source.toString();

          // Extract HTML body (simplified — works for most newsletters)
          const htmlMatch = raw.match(/Content-Type:\s*text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
          if (!htmlMatch) continue;

          let html = htmlMatch[1];
          // Handle base64 encoded content
          if (/Content-Transfer-Encoding:\s*base64/i.test(raw)) {
            try { html = Buffer.from(html.replace(/\s/g, ''), 'base64').toString(); } catch { continue; }
          }
          // Handle quoted-printable
          if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(raw)) {
            html = html.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
              String.fromCharCode(parseInt(hex, 16))
            );
          }

          const links = extractLinksFromHtml(html);
          for (const link of links) {
            const context = getContext(html, link.url);
            articles.push(createArticle({
              title: link.text,
              url: link.url,
              source: sender.name,
              date: since.toISOString(),
              description: context || link.text,
              origin: 'email',
              emailSender: sender.from,
            }));
            linkCount++;
          }
        }
        console.log(`  Email ${sender.name}: ${messages.length} messages, ${linkCount} links`);
      } catch (err) {
        console.error(`  Email ${sender.name}: FAILED — ${err.message}`);
      }
    }

    await client.logout();
  } catch (err) {
    console.error(`  Email: connection failed — ${err.message}`);
    return [];
  }

  return articles;
}
