import { frontMatterLines } from './frontMatter';

/** A PDF cover page (CalmMD Pro): its own page before the document. */
export interface CoverInfo {
  title: string;
  subtitle: string;
  author: string;
  date: string;
}

/** `key: value` pairs from simple YAML front matter (quotes removed; nested values ignored). */
export function frontMatterFields(markdown: string): Record<string, string> {
  const lines = markdown.split(/\r?\n/);
  const n = frontMatterLines(lines);
  const out: Record<string, string> = {};
  for (const line of lines.slice(1, Math.max(1, n - 1))) {
    const m = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!m || !m[2].trim()) continue;
    out[m[1].toLowerCase()] = m[2].trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

/** The first top-level heading's text (ATX "# Title"), outside front matter. */
function firstH1(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines.slice(frontMatterLines(lines))) {
    const m = /^ {0,3}#\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) return m[1].replace(/[*_`]/g, '').trim();
  }
  return null;
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Cover defaults: front matter first, then the first heading and today's date. */
export function coverFromDoc(markdown: string, fallbackTitle: string, now: Date, author = ''): CoverInfo {
  const f = frontMatterFields(markdown);
  return {
    title: f.title ?? firstH1(markdown) ?? fallbackTitle,
    subtitle: f.subtitle ?? f.description ?? '',
    author: f.author ?? author,
    date: f.date ?? formatDate(now),
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function coverHtml(c: CoverInfo): string {
  // The title is a styled paragraph, not an <h1>, so heading rules (page breaks, the table of
  // contents) never pick it up.
  const line = (cls: string, text: string, extra = '') => (text.trim() ? `<p class="${cls}"${extra}>${esc(text.trim())}</p>` : '');
  return (
    `<section class="cover" aria-label="Cover">` +
    line('cover-title', c.title, ' role="heading" aria-level="1"') +
    line('cover-subtitle', c.subtitle) +
    `<div class="cover-meta">${line('cover-author', c.author)}${line('cover-date', c.date)}</div>` +
    `</section>`
  );
}
