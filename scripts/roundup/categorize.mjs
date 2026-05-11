// ============================================================
// categorize.mjs — Claude-powered section assignment + ranking
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { MODEL, ROUNDUP_SECTIONS, MAX_ROUNDUP_ARTICLES } from '../roundup-config.mjs';

const SYSTEM_PROMPT = `You are categorizing crypto, blockchain, and digital currency news articles for the MIT Digital Currency Initiative's weekly roundup.

Assign each article to exactly ONE section from this list:
${ROUNDUP_SECTIONS.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Guidelines for categorization:
- "US": US-specific regulatory, legal, policy, or market developments.
- "International Organizations": News about international bodies (IMF, BIS, FATF, World Bank, UN, G20, etc.) and their crypto/digital currency policies.
- "Company Updates": Product launches, partnerships, acquisitions, company-specific news.
- "Top Thought Pieces / Interviews": Analysis, opinion, research papers, reports, long-form journalism, podcasts, interviews. NOT breaking news.
- "Europe / Canada / UK": Regulatory, legal, or policy developments from EU, UK, Canada, Switzerland, etc.
- "LATAM": Latin America — Brazil, Argentina, Mexico, El Salvador, etc.
- "MENA": Middle East and North Africa — UAE, Saudi Arabia, Israel, Turkey, etc.
- "Africa": Sub-Saharan Africa — Nigeria, Kenya, South Africa, etc.
- "China + HK": Mainland China and Hong Kong developments.
- "India": India-specific developments.
- "Asia Pacific": Japan, South Korea, Singapore, Australia, Southeast Asia, etc.

Also rate each article's importance on a 1-10 scale:
- 9-10: Major market-moving or precedent-setting events
- 7-8: Significant developments worth highlighting
- 5-6: Notable but routine industry news
- 1-4: Minor updates or niche interest

Articles scoring 7+ will be tagged as "Top News" in addition to their section.

Respond with a JSON array. Each element: { "url": "...", "section": "Section Name", "importance": N }
Return ONLY the JSON array, no other text.`;

export async function categorizeArticles(articles) {
  if (!articles.length) return {};

  const client = new Anthropic();

  const input = articles.map(a => ({
    title: a.title,
    source: a.source,
    url: a.url,
    summary: a.summary || [],
  }));

  // Split into chunks if too many articles for one call
  const CHUNK_SIZE = 40;
  const chunks = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE) {
    chunks.push(input.slice(i, i + CHUNK_SIZE));
  }

  const allAssignments = [];

  async function categorizeChunk(ci) {
    try {
      console.log(`  Categorizing chunk ${ci + 1}/${chunks.length} (${chunks[ci].length} articles)...`);
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: `Categorize these articles:\n\n${JSON.stringify(chunks[ci], null, 2)}` },
        ],
      });

      const text = response.content[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        console.log(`  Chunk ${ci + 1}/${chunks.length} done`);
        return JSON.parse(jsonMatch[0]);
      } else {
        console.error(`  Chunk ${ci + 1}: could not parse response`);
        return [];
      }
    } catch (err) {
      console.error(`  Chunk ${ci + 1}: API error — ${err.message}`);
      return [];
    }
  }

  const results = await Promise.all(chunks.map((_, ci) => categorizeChunk(ci)));
  for (const r of results) allAssignments.push(...r);

  // Build assignment lookup
  const assignmentByUrl = new Map(allAssignments.map(a => [a.url, a]));

  // Sort by importance (highest first) and cap at MAX_ROUNDUP_ARTICLES
  const scored = articles
    .map(a => {
      const assignment = assignmentByUrl.get(a.url);
      return {
        ...a,
        section: assignment?.section || 'Company Updates',
        importance: assignment?.importance || 5,
      };
    })
    .sort((a, b) => b.importance - a.importance)
    .slice(0, MAX_ROUNDUP_ARTICLES);

  // Tag high-importance stories as Top News (in addition to their section)
  for (const a of scored) {
    a.topNews = a.importance >= 7;
  }

  // Group by section in the configured order
  const grouped = {};
  for (const section of ROUNDUP_SECTIONS) {
    grouped[section] = scored.filter(a => a.section === section);
  }

  // Put uncategorized articles into Company Updates
  const knownSections = new Set(ROUNDUP_SECTIONS);
  const uncategorized = scored.filter(a => !knownSections.has(a.section));
  if (uncategorized.length) {
    grouped['Company Updates'] = [...(grouped['Company Updates'] || []), ...uncategorized];
  }

  return grouped;
}
