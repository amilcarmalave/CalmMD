import type { MarkdownIt, StateBlock, StateCore, Token } from 'markdown-it';
import { frontMatterLinesOf } from '../core/frontMatter';
import { escapeHtml } from './highlight';

/**
 * Front matter (YAML/TOML at the top) becomes a quiet `<pre class="front-matter">` instead of a
 * rule plus a setext heading. Exports hide it (see preview.css).
 */
export function frontMatterPlugin(md: MarkdownIt) {
  md.block.ruler.before(
    'table',
    'front_matter',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      if (startLine !== 0 || state.parentType !== 'root' || state.tShift[0] !== 0) return false;
      const n = frontMatterLinesOf(state.src);
      if (n === 0 || n > endLine) return false;
      if (silent) return true;
      const tok = state.push('front_matter', 'pre', 0);
      tok.block = true;
      tok.map = [0, n];
      tok.markup = state.src.slice(state.bMarks[0], state.eMarks[0]);
      tok.content = n > 2 ? state.src.slice(state.bMarks[1], state.eMarks[n - 2]) : '';
      state.line = n;
      return true;
    },
  );
  md.renderer.rules.front_matter = (tokens, idx, _o, _e, self) =>
    `<pre class="front-matter"${self.renderAttrs(tokens[idx])}><code>${escapeHtml(tokens[idx].content)}</code></pre>\n`;
}

export const CALLOUT_TYPES = ['note', 'tip', 'important', 'warning', 'caution'] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];
/** `[!NOTE]` at the start of a quote's first line (GitHub alerts). */
export const CALLOUT_MARKER = /^\[!(note|tip|important|warning|caution)\]/i;
const TITLES: Record<CalloutType, string> = { note: 'Note', tip: 'Tip', important: 'Important', warning: 'Warning', caution: 'Caution' };
export const calloutTitle = (t: CalloutType) => TITLES[t];

/** GitHub-style alerts: `> [!NOTE]` turns the quote into a titled callout. */
export function calloutPlugin(md: MarkdownIt) {
  md.core.ruler.push('callouts', (state: StateCore) => {
    const t = state.tokens;
    for (let i = 0; i + 2 < t.length; i++) {
      if (t[i].type !== 'blockquote_open' || t[i + 1].type !== 'paragraph_open' || t[i + 2].type !== 'inline') continue;
      const inline = t[i + 2];
      const m = CALLOUT_MARKER.exec(inline.content);
      if (!m || !/^\s|^$/.test(inline.content.slice(m[0].length))) continue;
      const type = m[1].toLowerCase() as CalloutType;
      stripLeading(inline.children ?? [], m[0].length);
      inline.content = inline.content.slice(m[0].length).replace(/^\s+/, '');
      t[i].attrJoin('class', `callout callout-${type}`);
      const title = new state.Token('callout_title', 'p', 0);
      title.block = true;
      title.content = TITLES[type];
      t.splice(i + 1, 0, title);
      // A marker on a line of its own leaves an empty paragraph behind.
      if (!inline.content) {
        t[i + 2].hidden = true;
        t[i + 4].hidden = true;
        inline.children = [];
      }
    }
  });
  md.renderer.rules.callout_title = (tokens, idx) => `<p class="callout-title">${escapeHtml(tokens[idx].content)}</p>\n`;
}

/** Removes `count` characters of leading text from inline children, then a following line break. */
function stripLeading(children: Token[], count: number) {
  let need = count;
  while (need > 0 && children[0]?.type === 'text') {
    const c = children[0];
    if (c.content.length <= need) {
      need -= c.content.length;
      children.shift();
    } else {
      c.content = c.content.slice(need);
      need = 0;
    }
  }
  if (children[0]?.type === 'text') {
    children[0].content = children[0].content.replace(/^[ \t]+/, '');
    if (!children[0].content) children.shift();
  }
  if (children[0]?.type === 'softbreak' || children[0]?.type === 'hardbreak') children.shift();
}

/**
 * Wiki links: `[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]` become `<a href="wiki:…">`. They name
 * a note rather than a path, so clicking resolves them (app/links.ts → core/noteLinks.ts).
 */
export function wikiLinkPlugin(md: MarkdownIt) {
  md.inline.ruler.before('link', 'wikilink', (state, silent) => {
    const src = state.src;
    const start = state.pos;
    if (src.charCodeAt(start) !== 0x5b || src.charCodeAt(start + 1) !== 0x5b) return false;
    const end = src.indexOf(']]', start + 2);
    if (end === -1) return false;
    const inner = src.slice(start + 2, end);
    if (!inner.trim() || /[\[\]\n]/.test(inner)) return false;
    if (!silent) {
      const [left, alias] = inner.split('|');
      const tok = state.push('wikilink', 'a', 0);
      tok.content = (alias ?? left.split('#')[0] ?? left).trim() || left.trim();
      tok.meta = { target: left.trim() };
    }
    state.pos = end + 2;
    return true;
  });
  md.renderer.rules.wikilink = (tokens, idx) => {
    const t = tokens[idx];
    return `<a class="wikilink" href="wiki:${encodeURIComponent(String((t.meta as { target?: string } | null)?.target ?? ''))}">${escapeHtml(t.content)}</a>`;
  };
}
