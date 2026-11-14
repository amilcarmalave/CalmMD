import DOMPurify from 'dompurify';
import markdownit, { type MarkdownIt, type StateCore, type Token } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import mark from 'markdown-it-mark';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import { calloutPlugin, frontMatterPlugin, wikiLinkPlugin } from './extras';
import { parseAltSize } from '../core/imageSize';
import { dirname } from '../core/paths';
import { diagramFor } from './diagrams';
import { embedPageUrl, parseEmbed } from './embeds';
import { escapeHtml, highlightToHtml } from './highlight';
import { mathPlugin, trusted } from './math';

export interface RenderEnv {
  /** Path of the document being rendered, used to resolve relative image paths. */
  docPath: string | null;
  /** Turns an absolute file path into a URL the webview can load. */
  resolveAsset?: (absPath: string) => string;
  /** Called when something loaded asynchronously (such as a code grammar) and a re-render would improve output. */
  onAsyncUpdate?: () => void;
  /** Theme for diagrams. */
  colorScheme?: 'light' | 'dark';
}

/**
 * Source-line attributes: every block token with a source map gets
 * `data-line-start` / `data-line-end` (0-based, end exclusive). The preview's scroll and
 * cursor sync rely on these. Nested blocks (list items, table rows) are included.
 */
function sourceLines(md: MarkdownIt) {
  md.core.ruler.push('source_lines', (state: StateCore) => {
    for (const tok of state.tokens) {
      if (tok.map && tok.block && tok.nesting >= 0 && !tok.hidden) {
        tok.attrSet('data-line-start', String(tok.map[0]));
        tok.attrSet('data-line-end', String(tok.map[1]));
      }
    }
  });
}

/** GitHub-style task lists. The checkboxes carry their source line so they can be toggled from the preview. */
function taskLists(md: MarkdownIt) {
  md.core.ruler.after('inline', 'task_lists', (state: StateCore) => {
    const t = state.tokens;
    for (let i = 2; i < t.length; i++) {
      const inline = t[i];
      if (inline.type !== 'inline' || t[i - 1].type !== 'paragraph_open' || t[i - 2].type !== 'list_item_open') continue;
      const m = /^\[([ xX])\](?=\s|$)/.exec(inline.content);
      const first = inline.children?.[0];
      if (!m || !first || first.type !== 'text' || !first.content.startsWith(m[0])) continue;

      first.content = first.content.slice(3).replace(/^[ \t]/, '');
      const item = t[i - 2];
      const line = item.map?.[0] ?? 0;
      const cb = new state.Token('html_inline', '', 0);
      cb.content = `<input type="checkbox" class="task-checkbox" data-task-line="${line}"${m[1] !== ' ' ? ' checked' : ''}>`;
      inline.children!.unshift(cb);
      item.attrJoin('class', 'task-list-item');
      for (let j = i - 3; j >= 0; j--) {
        const tj = t[j];
        if ((tj.type === 'bullet_list_open' || tj.type === 'ordered_list_open') && tj.level === item.level - 1) {
          tj.attrJoin('class', 'contains-task-list');
          break;
        }
      }
    }
  });
}

/** Stable, GitHub-like heading ids for in-document links and the outline. */
export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-');
}

const PAGE_BREAK = /^(---pagebreak---|\\pagebreak|\\newpage|<!--\s*pagebreak\s*-->)$/i;

/** Page-break markers become `<div class="page-break">`: a faint line on screen, a real break in PDFs. */
function pageBreaks(md: MarkdownIt) {
  md.core.ruler.after('block', 'page_breaks', (state: StateCore) => {
    const t = state.tokens;
    for (let i = 0; i < t.length; i++) {
      const tok = t[i];
      const isPara =
        tok.type === 'paragraph_open' && t[i + 1]?.type === 'inline' && PAGE_BREAK.test(t[i + 1].content.trim()) && t[i + 2]?.type === 'paragraph_close';
      const isHtml = tok.type === 'html_block' && PAGE_BREAK.test(tok.content.trim());
      if (!isPara && !isHtml) continue;
      const pb = new state.Token('page_break', 'div', 0);
      pb.block = true;
      pb.map = tok.map;
      t.splice(i, isPara ? 3 : 1, pb);
    }
  });
  md.renderer.rules.page_break = (tokens, idx, _o, _e, self) =>
    `<div class="page-break"${self.renderAttrs(tokens[idx])} aria-hidden="true"></div>\n`;
}

function headingIds(md: MarkdownIt) {
  md.core.ruler.push('heading_ids', (state: StateCore) => {
    const seen = new Map<string, number>();
    const t = state.tokens;
    for (let i = 0; i < t.length; i++) {
      if (t[i].type !== 'heading_open') continue;
      const text = (t[i + 1]?.children ?? [])
        .filter((c) => c.type === 'text' || c.type === 'code_inline')
        .map((c) => c.content)
        .join('');
      const base = slugify(text) || 'section';
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      t[i].attrSet('id', n === 0 ? base : `${base}-${n}`);
    }
  });
}

const envOf = (env: unknown): RenderEnv => (env ?? { docPath: null }) as RenderEnv;

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export function resolveImageSrc(src: string, env: RenderEnv): string {
  if (!src || SCHEME.test(src) || src.startsWith('//') || src.startsWith('#')) return src;
  if (!env.resolveAsset) return src;
  let rel: string;
  try {
    rel = decodeURI(src);
  } catch {
    rel = src;
  }
  const isAbsolute = rel.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(rel);
  // Untitled documents link their pasted images by absolute path until the first save.
  if (!env.docPath) return isAbsolute ? env.resolveAsset(rel) : src;
  const sep = env.docPath.includes('\\') && !env.docPath.includes('/') ? '\\' : '/';
  const abs = isAbsolute ? rel : dirname(env.docPath) + sep + rel.replace(/^\.[\\/]/, '');
  return env.resolveAsset(abs);
}

function renderers(md: MarkdownIt) {
  const codeBlock = (tok: Token, attrs: string, env: RenderEnv) => {
    const lang = tok.info.trim().split(/\s+/)[0] ?? '';
    if (lang.toLowerCase() === 'mermaid' && tok.type === 'fence') {
      const code = tok.content.replace(/\n$/, '');
      const result = diagramFor(code, env.colorScheme ?? 'light', env.onAsyncUpdate);
      if (result?.svg) return `<div class="mermaid-block"${attrs}>${trusted(env, result.svg)}</div>\n`;
      const source = `<pre class="code-block" data-lang="mermaid"><code>${escapeHtml(code)}</code></pre>`;
      if (result?.error)
        return `<div class="mermaid-block mermaid-error"${attrs}><div class="diagram-error">Diagram error: ${escapeHtml(result.error)}</div>${source}</div>\n`;
      return `<div class="mermaid-block mermaid-pending"${attrs}>${source}</div>\n`;
    }
    const body = highlightToHtml(tok.content.replace(/\n$/, ''), lang, env.onAsyncUpdate);
    const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
    return `<pre class="code-block"${attrs}${langAttr}><code>${body}</code></pre>\n`;
  };
  md.renderer.rules.fence = (tokens, idx, _o, env, self) =>
    codeBlock(tokens[idx], self.renderAttrs(tokens[idx]), envOf(env));
  md.renderer.rules.code_block = (tokens, idx, _o, env, self) =>
    codeBlock(tokens[idx], self.renderAttrs(tokens[idx]), envOf(env));

  // Wrap raw HTML blocks so they get a source-line anchor too.
  md.renderer.rules.html_block = (tokens, idx, _o, _env, self) =>
    `<div class="html-block"${self.renderAttrs(tokens[idx])}>${tokens[idx].content}</div>\n`;

  const image = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const tok = tokens[idx];
    const raw = String(tok.attrGet('src') ?? '');
    const embed = parseEmbed(raw);
    if (embed) {
      const alt = escapeHtml(tok.content || '');
      if (embed.kind === 'video') {
        const src = escapeHtml(resolveImageSrc(raw, envOf(env)));
        return `<span class="embed embed-video"><video controls preload="metadata" src="${src}" title="${alt}"></video></span>`;
      }
      const provider = embed.kind === 'youtube' ? 'YouTube' : 'Vimeo';
      const start = embed.kind === 'youtube' && embed.start ? ` data-embed-start="${embed.start}"` : '';
      return (
        `<span class="embed embed-card" data-embed-kind="${embed.kind}" data-embed-id="${escapeHtml(embed.id)}"${start} data-embed-title="${alt}" data-embed-url="${escapeHtml(embedPageUrl(embed))}">` +
        `<button type="button" class="embed-play" aria-label="Play ${alt || provider + ' video'}">` +
        `<span class="embed-icon" aria-hidden="true"></span>` +
        `<span class="embed-text"><span class="embed-title">${alt || provider + ' video'}</span>` +
        `<span class="embed-provider">${provider} · loads when you click</span></span></button></span>`
      );
    }
    tok.attrSet('src', resolveImageSrc(raw, envOf(env)));
    // Size after a "|" in the alt text (core/imageSize.ts): it becomes width/height, not alt text.
    const size = parseAltSize(tok.content);
    if (size.width) {
      tok.attrSet('width', String(size.width));
      if (size.height) tok.attrSet('height', String(size.height));
      const Text = tok.constructor as new (type: string, tag: string, nesting: number) => Token;
      const alt = new Text('text', '', 0);
      alt.content = size.alt;
      tok.children = [alt];
      tok.content = size.alt;
    }
    // Eager on purpose: lazy images start at zero height and pop in while scrolling, which
    // shifts the layout under the scroll sync. Local images load fast anyway.
    tok.attrSet('decoding', 'async');
    return image(tokens, idx, options, env, self);
  };
}

export function createMarkdown(): MarkdownIt {
  const md = markdownit({ html: true, linkify: true, typographer: false, breaks: false });
  // markdown-it blocks all data: URLs except a few raster image types. Also allow inline SVG
  // images. Scripts inside an <img> SVG never run, and the output is sanitised anyway.
  md.validateLink = (url) => {
    const u = url.trim().toLowerCase();
    if (/^(javascript|vbscript|file):/.test(u)) return false;
    if (u.startsWith('data:')) return /^data:image\/(gif|png|jpeg|webp|avif|svg\+xml)[;,]/.test(u);
    return true;
  };
  md.use(frontMatterPlugin);
  md.use(footnote);
  md.use(mark);
  md.use(sub);
  md.use(sup);
  md.use(mathPlugin);
  md.use(calloutPlugin);
  md.use(wikiLinkPlugin);
  md.use(taskLists);
  md.use(headingIds);
  md.use(pageBreaks);
  md.use(sourceLines);
  md.use(renderers);
  return md;
}

// Like DOMPurify's default, plus Tauri's asset: scheme for local images.
const ALLOWED_URI =
  /^(?:(?:https?|mailto|tel|asset|data|blob|wiki):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

let purifyHooked = false;
function purify(html: string): string {
  if (!purifyHooked) {
    // Links open outside the app (handled by the click handler), never inside the webview.
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && node.getAttribute('href')) node.setAttribute('rel', 'noopener noreferrer');
    });
    purifyHooked = true;
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_URI_REGEXP: ALLOWED_URI,
    // Inline style attributes stay (READMEs use them for image sizing); <style> blocks don't.
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'base', 'meta', 'link'],
    ADD_ATTR: [
      'data-line-start',
      'data-line-end',
      'data-task-line',
      'data-lang',
      'data-trusted',
      'data-embed-kind',
      'data-embed-id',
      'data-embed-start',
      'data-embed-title',
      'data-embed-url',
      'controls',
      'preload',
    ],
  });
}

export interface Renderer {
  render(text: string, env: RenderEnv): string;
}

const nonce = () => Math.random().toString(36).slice(2, 10);

/**
 * Markdown → sanitised HTML. Output we generate ourselves and trust (KaTeX, Mermaid SVG) is kept in
 * numbered slots during sanitising, because DOMPurify would strip MathML and SVG <style>. It's put
 * back afterwards. Slot ids carry a per-render random nonce, so raw HTML in a document can't forge one.
 */
export function createRenderer(): Renderer {
  const md = createMarkdown();
  return {
    render(text, env) {
      const trustedHtml: string[] = [];
      const id = nonce();
      const html = purify(md.render(text, { ...env, trusted: trustedHtml, trustedNonce: id } as unknown as Record<string, unknown>));
      if (!trustedHtml.length) return html;
      const slot = new RegExp(`<span data-trusted="${id}-(\\d+)"></span>`, 'g');
      return html.replace(slot, (_, i) => trustedHtml[Number(i)] ?? '');
    },
  };
}
