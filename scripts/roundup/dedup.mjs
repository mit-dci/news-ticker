// ============================================================
// dedup.mjs — deduplicate articles by URL and title similarity
// ============================================================

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has',
  'will', 'been', 'were', 'are', 'was', 'not', 'but', 'what', 'all',
  'can', 'had', 'her', 'his', 'its', 'our', 'than', 'then', 'them',
  'they', 'into', 'some', 'could', 'would', 'about', 'which', 'when',
  'make', 'like', 'just', 'over', 'such', 'take', 'also', 'more',
  'after', 'says', 'said', 'new', 'may', 'could',
]);

function tokenize(text) {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 4 && !STOP_WORDS.has(w))
  );
}

function jaccardSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersection = 0;
  const smaller = setA.size <= setB.size ? setA : setB;
  const larger = setA.size <= setB.size ? setB : setA;
  for (const w of smaller) {
    if (larger.has(w)) intersection++;
  }
  // Use overlap coefficient (intersection / smaller set) rather than
  // strict Jaccard, because headlines about the same event often have
  // very different word counts across outlets.
  return intersection / smaller.size;
}

function pickPrimary(articles) {
  return articles.sort((a, b) => {
    // Prefer articles with longer descriptions (more context for summarization)
    const descDiff = (b.description?.length || 0) - (a.description?.length || 0);
    if (descDiff) return descDiff;
    // Prefer RSS over email (more reliable URLs)
    if (a.origin !== b.origin) return a.origin === 'rss' ? -1 : 1;
    // Prefer earlier publication
    return new Date(a.date) - new Date(b.date);
  })[0];
}

export function deduplicateArticles(articles) {
  // Phase 1: Group by normalized URL
  const byUrl = new Map();
  for (const a of articles) {
    const existing = byUrl.get(a.normalizedUrl);
    if (existing) {
      existing.push(a);
    } else {
      byUrl.set(a.normalizedUrl, [a]);
    }
  }

  // Collapse URL-identical groups into single entries with see_also
  const unique = [];
  for (const group of byUrl.values()) {
    const primary = pickPrimary(group);
    primary.seeAlso = group.filter(a => a !== primary).map(a => ({
      title: `${a.source} - ${a.title}`,
      url: a.url,
    }));
    unique.push(primary);
  }

  // Phase 2: Cluster by title similarity
  const tokenized = unique.map(a => ({ article: a, tokens: tokenize(a.title) }));
  const clusters = [];
  const used = new Set();

  for (let i = 0; i < tokenized.length; i++) {
    if (used.has(i)) continue;
    const cluster = [tokenized[i].article];
    used.add(i);

    for (let j = i + 1; j < tokenized.length; j++) {
      if (used.has(j)) continue;
      const sim = jaccardSimilarity(tokenized[i].tokens, tokenized[j].tokens);
      if (sim >= 0.6) {
        cluster.push(tokenized[j].article);
        used.add(j);
      }
    }

    if (cluster.length === 1) {
      clusters.push(cluster[0]);
    } else {
      const primary = pickPrimary(cluster);
      const others = cluster.filter(a => a !== primary);
      // Merge see_also lists
      const existingSeeAlso = primary.seeAlso || [];
      primary.seeAlso = [
        ...existingSeeAlso,
        ...others.map(a => ({ title: `${a.source} - ${a.title}`, url: a.url })),
        ...others.flatMap(a => a.seeAlso || []),
      ];
      clusters.push(primary);
    }
  }

  return clusters;
}
