import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

/**
 * Paste from a web page, Word or Google Docs as Markdown: headings, bold, links, lists, tables and
 * code survive. Paste as Plain Text (Ctrl/Cmd+Shift+V) keeps just the text.
 */
let service: TurndownService | null = null;
function converter(): TurndownService {
  if (service) return service;
  const t = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
    strongDelimiter: '**',
    hr: '---',
  });
  t.use(gfm);
  t.remove(['script', 'style', 'meta', 'title', 'head']);
  // Pasted images that are embedded data (screenshots inside HTML) would bloat the note: drop them.
  t.addRule('dataImages', { filter: (n) => n.nodeName === 'IMG' && /^data:/i.test(n.getAttribute('src') ?? ''), replacement: () => '' });
  service = t;
  return t;
}

/** Pasted HTML that has structure worth keeping (not just styled plain text, like code editors copy). */
export function worthConverting(html: string): boolean {
  if (!html || html.length > 2_000_000) return false;
  return /<(a\s[^>]*href|strong|b|em|i|h[1-6]|ul|ol|li|table|blockquote|pre|code|img\s|s|del|strike)\b/i.test(html);
}

export function htmlToMarkdown(html: string): string {
  // Office wraps content in comments and fragments; the converter ignores those.
  const md = converter().turndown(html.replace(/<!--(StartFragment|EndFragment)-->/g, ''));
  return md
    .replace(/^(\s*)([-*+]|\d+[.)])\s{2,}/gm, '$1$2 ') // "-   item" → "- item"
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
