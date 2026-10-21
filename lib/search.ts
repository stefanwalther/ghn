export interface Ranked<T> {
  item: T;
  score: number;
}

function normalize(s: string): string {
  return s.toLowerCase();
}

/**
 * Subsequence fuzzy score. Returns -1 when `query` is not a subsequence
 * of `target`. Higher is better.
 *
 * Scoring favours contiguous runs, word boundaries (after space, /, -,
 * _, ., #) and prefix matches. Case-insensitive.
 */
export function fuzzyScore(query: string, target: string): number {
  const q = normalize(query.trim());
  const t = normalize(target);
  if (!q) return 0;
  if (!t) return -1;
  if (t.includes(q)) {
    // Contiguous substring: strong signal, earlier + longer coverage wins.
    const idx = t.indexOf(q);
    return 200 - idx + q.length * 4;
  }
  let score = 0;
  let ti = 0;
  let consecutive = 0;
  let matched = 0;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    const found = t.indexOf(ch, ti);
    if (found === -1) return -1;
    const boundary =
      found === 0 || /[\s/_.\-#:()]/.test(t[found - 1] ?? "");
    if (found === ti) {
      consecutive += 1;
      score += 6 + consecutive * 4 + (boundary ? 4 : 0);
    } else {
      consecutive = 0;
      score += (boundary ? 5 : 1) - Math.min(6, found - ti);
    }
    matched += 1;
    ti = found + 1;
  }
  if (matched !== q.length) return -1;
  // Prefer shorter targets when scores tie.
  score -= Math.min(12, Math.max(0, t.length - q.length) * 0.2);
  return score;
}

/**
 * Multi-token match: every whitespace-separated token must fuzzy-match
 * at least one haystack. Scores sum the best haystack per token.
 */
export function multiScore(query: string, haystacks: string[]): number {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const token of tokens) {
    let best = -1;
    for (const hay of haystacks) {
      const s = fuzzyScore(token, hay);
      if (s > best) best = s;
    }
    if (best < 0) return -1;
    total += best;
  }
  return total;
}

export function rankSearch<T>(
  query: string,
  items: T[],
  haystacks: (item: T) => string[],
  limit = 50
): Ranked<T>[] {
  const q = query.trim();
  if (!q) return items.slice(0, limit).map((item) => ({ item, score: 0 }));
  const out: Ranked<T>[] = [];
  for (const item of items) {
    const score = multiScore(q, haystacks(item));
    if (score >= 0) out.push({ item, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
