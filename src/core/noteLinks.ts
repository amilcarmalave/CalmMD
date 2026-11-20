import { relativePath, markdownUrl, findImageLinks, resolveLink } from './assets';
import { basename, dirname, isMarkdownPath, isWithin, samePath, stem } from './paths';

/**
 * Links between notes, without a vault. Two forms:
 *
 * - Standard relative links, `[Title](../notes/Title.md)`, which CalmMD inserts (the `[[` picker),
 *   because they work everywhere: GitHub, other editors, a shared folder.
 * - Wiki links, `[[Title]]`, `[[Title|alias]]`, `[[Title#Heading]]`, as written by other tools.
 *   They name a note, not a path, so they're resolved: the linking note's own folder first, then
 *   the open folder (closest match wins). Outside any folder they can't be resolved.
 */
export interface WikiTarget {
  /** The note name or path as written, without ".md". */
  name: string;
  heading?: string;
  alias?: string;
}

export function parseWiki(inner: string): WikiTarget | null {
  const [left, alias] = inner.split('|');
  const [rawName, heading] = left.split('#');
  const name = rawName.trim().replace(/\.(md|markdown)$/i, '');
  if (!name && !heading) return null;
  return { name, heading: heading?.trim() || undefined, alias: alias?.trim() || undefined };
}

/** `[[…]]` occurrences in a line of text. */
export const WIKI_RE = /\[\[([^\[\]\n|#]*(?:#[^\[\]\n|]*)?(?:\|[^\[\]\n]*)?)\]\]/g;

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
const depth = (p: string) => norm(p).split('/').length;

/**
 * The file a wiki link names, from the note at `fromDoc`, among `files` (the open folder's
 * Markdown files). Null if none matches.
 */
export function resolveWiki(name: string, fromDoc: string | null, files: string[]): string | null {
  if (!name) return fromDoc;
  const want = norm(name);
  const hasPath = want.includes('/');
  const candidates = files.filter((f) => {
    if (!isMarkdownPath(f)) return false;
    const n = norm(f).replace(/\.(md|markdown|mdown|mkd|mdx)$/, '');
    return hasPath ? n.endsWith('/' + want) || n === want : stem(f).toLowerCase() === want;
  });
  if (!candidates.length) return null;
  const here = fromDoc ? dirname(fromDoc) : null;
  // Same folder first; then the one closest to the linking note; then the shortest path.
  const score = (f: string) => {
    if (here && samePath(dirname(f), here)) return -1;
    if (here && isWithin(f, here)) return depth(f) - depth(here);
    return 1000 + depth(f);
  };
  return [...candidates].sort((a, b) => score(a) - score(b) || a.length - b.length || a.localeCompare(b))[0];
}

/** The standard Markdown link CalmMD inserts for a note picked in the `[[` picker. */
export function noteLink(fromDoc: string | null, target: string): string {
  const title = stem(target);
  if (!fromDoc) return `[[${title}]]`; // untitled: no folder to be relative to yet
  const rel = relativePath(dirname(fromDoc), target);
  return rel ? `[${title}](${markdownUrl(rel)})` : `[[${title}]]`;
}

export interface Backlink {
  path: string;
  /** 0-based line of the link. */
  line: number;
  text: string;
}

const MD_LINK = /(?<!!)\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]+)/g;

/**
 * Lines in `text` (the note at `fromPath`) that link to `target`, by relative link or wiki link.
 * `files` is used to resolve wiki links the same way clicking them does.
 */
export function linksTo(text: string, fromPath: string, target: string, files: string[]): Backlink[] {
  if (samePath(fromPath, target)) return [];
  const out: Backlink[] = [];
  const targetStem = stem(target).toLowerCase();
  const lines = text.split(/\r?\n/);
  const images = new Set(findImageLinks(text).map((l) => l.url));
  lines.forEach((line, i) => {
    let hit = false;
    for (const m of line.matchAll(MD_LINK)) {
      const raw = m[1].startsWith('<') ? m[1].slice(1, -1) : m[1];
      if (images.has(raw)) continue;
      const abs = resolveLink(raw.split('#')[0], dirname(fromPath));
      if (abs && samePath(abs, target)) hit = true;
    }
    if (!hit && line.toLowerCase().includes(targetStem)) {
      for (const m of line.matchAll(WIKI_RE)) {
        const w = parseWiki(m[1]);
        if (w && w.name && resolveWiki(w.name, fromPath, files) && samePath(resolveWiki(w.name, fromPath, files)!, target)) hit = true;
      }
    }
    if (hit) out.push({ path: fromPath, line: i, text: line.trim() });
  });
  return out;
}

export const noteTitle = (path: string) => stem(basename(path));

interface Edit {
  from: number;
  to: number;
  text: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Rewrites links in `text` (the note at `fromDoc`) that point at `from` so they point at `to`.
 * Code fences, indented code and inline code are left alone. `files` is the same list used to
 * resolve wiki links when clicking them.
 */
export function rewriteLinks(text: string, fromDoc: string, from: string, to: string, files: string[]): string {
  const edits: Edit[] = [];
  const wikiRe = new RegExp(WIKI_RE.source, 'g');
  const mdLinkRe = /(?<!!)\[([^\]]*)\]\(\s*(<[^>]*>|[^\s)]+)([^)]*)\)/g;
  let pos = 0;
  let fence: string | null = null;
  const dir = dirname(fromDoc);

  for (const line of text.split('\n')) {
    const start = pos;
    pos += line.length + 1;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(f[0].length).trim()) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (/^( {4}|\t)/.test(line)) continue;
    // Inline code keeps its literal text. Replace it with spaces so link regexes can't match there.
    const masked = line.replace(/(`+)[^`]*?\1/g, (m) => ' '.repeat(m.length));

    for (const m of masked.matchAll(wikiRe)) {
      const w = parseWiki(m[1]);
      if (!w?.name) continue;
      const target = resolveWiki(w.name, fromDoc, files);
      if (!target || !samePath(target, from)) continue;
      const next = `[[${stem(to)}${w.heading ? `#${w.heading}` : ''}${w.alias ? `|${w.alias}` : ''}]]`;
      edits.push({ from: start + m.index, to: start + m.index + m[0].length, text: next });
    }

    for (const m of masked.matchAll(mdLinkRe)) {
      const raw = m[2].startsWith('<') ? m[2].slice(1, -1) : m[2];
      const [pathPart, ...anchorParts] = raw.split('#');
      const target = resolveLink(pathPart, dir);
      if (!target || !samePath(target, from)) continue;
      const rel = relativePath(dir, to);
      if (rel === null) continue; // across drives: can't express as a relative link
      const anchor = anchorParts.length ? '#' + anchorParts.join('#') : '';
      const angled = m[2].startsWith('<');
      const url = angled ? `<${markdownUrl(rel)}${anchor}>` : `${markdownUrl(rel)}${anchor}`;
      edits.push({ from: start + m.index, to: start + m.index + m[0].length, text: `[${m[1]}](${url}${m[3]})` });
    }
  }

  let out = text;
  for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return out;
}
