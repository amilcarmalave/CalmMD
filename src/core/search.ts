/**
 * Search across the open folder. The desktop app walks the folder in Rust (`search_files`) and
 * returns matching lines. This module holds the shared rules: what counts as a match (here for
 * the browser build and tests; mirrored in src-tauri/src/search.rs) and where to highlight.
 */
export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}

export interface SearchHit {
  path: string;
  /** 0-based line. */
  line: number;
  /** The line's text, trimmed to a readable length around the first match. */
  text: string;
}

export const SEARCH_MAX_HITS = 500;
export const SEARCH_MAX_LINE = 240;
const WORD = /[\p{L}\p{N}_]/u;

/** Match ranges of `query` in `text`. */
export function matchRanges(text: string, query: string, opts: SearchOptions): [number, number][] {
  if (!query) return [];
  const hay = opts.caseSensitive ? text : text.toLowerCase();
  const needle = opts.caseSensitive ? query : query.toLowerCase();
  const out: [number, number][] = [];
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + Math.max(1, needle.length))) {
    const end = i + needle.length;
    if (opts.wholeWord && ((i > 0 && WORD.test(text[i - 1])) || (end < text.length && WORD.test(text[end])))) continue;
    out.push([i, end]);
  }
  return out;
}

/** Shortens a long line around its first match, so the match is always visible. */
export function snippet(line: string, first: number): string {
  if (line.length <= SEARCH_MAX_LINE) return line;
  const start = Math.max(0, Math.min(first - 60, line.length - SEARCH_MAX_LINE));
  return (start > 0 ? '…' : '') + line.slice(start, start + SEARCH_MAX_LINE) + (start + SEARCH_MAX_LINE < line.length ? '…' : '');
}

/** Matching lines in one file's text. */
export function searchText(path: string, text: string, query: string, opts: SearchOptions, limit = SEARCH_MAX_HITS): SearchHit[] {
  const out: SearchHit[] = [];
  if (!query.trim()) return out;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const r = matchRanges(lines[i], query, opts);
    if (r.length) out.push({ path, line: i, text: snippet(lines[i], r[0][0]) });
  }
  return out;
}

/** Hits grouped by file, in the order files were found. */
export function groupHits(hits: SearchHit[]): { path: string; hits: SearchHit[] }[] {
  const map = new Map<string, SearchHit[]>();
  for (const h of hits) {
    const list = map.get(h.path) ?? [];
    list.push(h);
    map.set(h.path, list);
  }
  return [...map.entries()].map(([path, list]) => ({ path, hits: list }));
}
