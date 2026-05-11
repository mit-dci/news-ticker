// ============================================================
// summarize.mjs — batched Claude API summarization
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import { MODEL, SUMMARIZE_BATCH_SIZE } from '../roundup-config.mjs';

const SYSTEM_PROMPT = `You are summarizing crypto, blockchain, and digital currency news articles for the MIT Digital Currency Initiative's weekly roundup.

For each article, produce 2-4 concise bullet points capturing the key facts. Write in a neutral, informative tone. Focus on:
- What happened or was announced
- Who is involved (companies, regulators, individuals)
- Why it matters (market impact, regulatory significance, precedent)

Do NOT editorialize or speculate. Stick to facts stated in the article.

Respond with a JSON array. Each element: { "url": "...", "summary": ["bullet 1", "bullet 2", ...] }
Return ONLY the JSON array, no other text.`;

export async function summarizeArticles(articles) {
  if (!articles.length) return articles;

  const client = new Anthropic();

  // Split into batches
  const batches = [];
  for (let i = 0; i < articles.length; i += SUMMARIZE_BATCH_SIZE) {
    batches.push(articles.slice(i, i + SUMMARIZE_BATCH_SIZE));
  }

  const CONCURRENCY = 3;
  console.log(`  Summarizing ${articles.length} articles in ${batches.length} batch(es) (${CONCURRENCY} concurrent)...`);

  async function processBatch(batchIdx) {
    const batch = batches[batchIdx];
    const input = batch.map(a => ({
      title: a.title,
      source: a.source,
      url: a.url,
      text: (a.description || '').slice(0, 2000),
    }));

    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [
          { role: 'user', content: `Summarize these articles:\n\n${JSON.stringify(input, null, 2)}` },
        ],
      });

      const text = response.content[0]?.text || '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const summaries = JSON.parse(jsonMatch[0]);
        const byUrl = new Map(summaries.map(s => [s.url, s.summary]));

        for (const article of batch) {
          const bullets = byUrl.get(article.url);
          if (bullets?.length) {
            article.summary = bullets;
          } else {
            article.summary = article.description ? [article.description] : [];
          }
        }
      } else {
        console.error(`  Batch ${batchIdx + 1}: could not parse Claude response`);
        for (const article of batch) {
          article.summary = article.description ? [article.description] : [];
        }
      }

      console.log(`  Batch ${batchIdx + 1}/${batches.length} done`);
    } catch (err) {
      console.error(`  Batch ${batchIdx + 1}: API error — ${err.message}`);
      for (const article of batch) {
        article.summary = article.description ? [article.description] : [];
      }
    }
  }

  // Run batches with limited concurrency
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, batches.length); j++) {
      chunk.push(processBatch(j));
    }
    await Promise.all(chunk);
  }

  return articles;
}
