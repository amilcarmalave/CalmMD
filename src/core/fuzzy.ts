export interface FuzzyMatch {
  score: number;
  /** Indices of matched characters in the target, for highlighting. */
  positions: number[];
}

const isBoundary = (s: string, i: number) => {
  if (i === 0) return true;
  const prev = s[i - 1];
  const cur = s[i];
  return /[\s\-_/.:\\(]/.test(prev) || (prev === prev.toLowerCase() && cur !== cur.toLowerCase());
};

/**
 * Subsequence fuzzy match, ranking the matches people expect first:
 * - consecutive characters and word starts score high ("tsb" → "Toggle Side Bar"),
 * - a prefix match scores highest,
 * - shorter targets win ties.
 * Returns null if `query` isn't a subsequence of `target`. Case-insensitive.
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const t = target.toLowerCase();

  // Fast path: a contiguous substring is usually what the user means.
  const sub = t.indexOf(q);
  if (sub !== -1) {
    const positions = Array.from({ length: q.length }, (_, i) => sub + i);
    let score = 100 + q.length * 10 - target.length * 0.1;
    if (sub === 0) score += 60;
    else if (isBoundary(target, sub)) score += 35;
    return { score, positions };
  }

  // Greedy subsequence that prefers word boundaries: for each query char, take the next boundary
  // occurrence if one comes before the next plain occurrence's run would.
  const positions: number[] = [];
  let ti = 0;
  let score = 0;
  let prev = -2;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    // Look for a boundary occurrence first, unless we're continuing a run.
    if (prev + 1 < t.length && t[prev + 1] === ch && prev >= 0) found = prev + 1;
    else {
      for (let j = ti; j < t.length; j++) {
        if (t[j] === ch && isBoundary(target, j)) {
          found = j;
          break;
        }
      }
      if (found === -1) found = t.indexOf(ch, ti);
    }
    if (found === -1) return null;
    positions.push(found);
    if (found === prev + 1) score += 8;
    if (isBoundary(target, found)) score += 10;
    score -= Math.min(found - ti, 10) * 0.5;
    prev = found;
    ti = found + 1;
  }
  score -= target.length * 0.1;
  return { score, positions };
}

/** Filters and sorts items by fuzzy score (stable for equal scores). */
export function fuzzyFilter<T>(query: string, items: T[], text: (item: T) => string): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch; i: number }[] = [];
  items.forEach((item, i) => {
    const match = fuzzyMatch(query, text(item));
    if (match) out.push({ item, match, i });
  });
  if (query.trim()) out.sort((a, b) => b.match.score - a.match.score || a.i - b.i);
  return out;
}
