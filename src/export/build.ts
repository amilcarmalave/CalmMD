import { resolveLocalPath } from '../app/links';
import { coverHtml, type CoverInfo } from '../core/cover';
import { createRenderer } from '../render/markdown';
import { prerenderDiagrams } from '../render/diagrams';
import { embedPlayerUrl } from '../render/embeds';
import { escapeHtml, preloadLanguages } from '../render/highlight';

export type BaseTheme = 'paper' | 'studio' | 'typewriter' | 'github' | 'clear';
export type PageSize = 'A4' | 'Letter' | 'A5' | 'Legal';
export type Margins = 'narrow' | 'normal' | 'wide';

export interface ExportOptions {
  title: string;
  theme: BaseTheme;
  /** CSS of a user theme, appended after the built-in styles. */
  userCss: string | null;
  toc: boolean;
  /** Inline local images as data: URLs, so the file stands alone. */
  embedImages: boolean;
  /** Printing (PDF): videos become links instead of players. */
  print?: boolean;
  /** CalmMD Pro: a cover page before everything else. */
  cover?: CoverInfo | null;
}

export interface PdfOptions {
  pageSize: PageSize;
  margins: Margins;
  /** Document title in the page header (not on the first page). */
  header: boolean;
  /** "3 / 12" in the footer. */
  pageNumbers: boolean;
  /** Start every top-level heading on a new page. */
  breakBeforeH1: boolean;
  /** Page design. "standard" is free; the others are Supporter extras. */
  template: PdfTemplate;
}

export type PdfTemplate = 'standard' | 'report' | 'academic' | 'minimal';
export const PDF_TEMPLATES: { id: PdfTemplate; label: string; hint: string; pro: boolean }[] = [
  { id: 'standard', label: 'Standard', hint: 'Your document style, title header, centred page numbers', pro: false },
  { id: 'report', label: 'Report', hint: 'Accent headings, title and page in the header', pro: true },
  { id: 'academic', label: 'Academic', hint: 'Justified serif text, numbered sections', pro: true },
  { id: 'minimal', label: 'Minimal', hint: 'Airy sans-serif, page numbers only', pro: true },
];

export const DEFAULT_PDF: PdfOptions = { pageSize: 'A4', margins: 'normal', header: true, pageNumbers: true, breakBeforeH1: false, template: 'standard' };

/** Template styles for the page content (they go with the theme CSS, outside Paged.js). */
export const TEMPLATE_CSS: Record<PdfTemplate, string> = {
  standard: '',
  report: `
.md-body h1 { padding: 0.15em 0 0.15em 0.6em; border-left: 5px solid var(--accent); }
.md-body h2 { padding-bottom: 0.25em; border-bottom: 2px solid color-mix(in srgb, var(--accent) 60%, transparent); }
.md-body table { width: 100%; }
.md-body th { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.md-body tbody tr:nth-child(2n) { background: var(--surface); }
.md-body .cover-title { border-left: 8px solid var(--accent); padding-left: 0.4em; }
`,
  academic: `
.md-body { --md-font: var(--font-serif); --md-heading-font: var(--font-serif); --md-leading: 1.55; counter-reset: h2; }
.md-body p, .md-body li { text-align: justify; hyphens: auto; }
.md-body > h1:first-of-type { text-align: center; font-size: 1.8em; margin-bottom: 1.2em; }
.md-body h2 { counter-increment: h2; counter-reset: h3; font-size: 1.25em; }
.md-body h2::before { content: counter(h2) ". "; }
.md-body h3 { counter-increment: h3; font-size: 1.08em; }
.md-body h3::before { content: counter(h2) "." counter(h3) " "; }
.md-body blockquote { font-style: normal; border-left-width: 2px; }
.md-body .cover { text-align: center; }
`,
  minimal: `
.md-body { --md-font: var(--font-ui); --md-heading-font: var(--font-ui); --md-leading: 1.6; }
.md-body h1, .md-body h2, .md-body h3 { font-weight: 600; letter-spacing: -0.01em; }
.md-body h2 { border: 0; }
.md-body hr { width: 100%; background: var(--hairline); }
.md-body pre, .md-body :not(pre) > code { border: 0; }
`,
};

export interface ExportAssets {
  /** tokens.css + preview.css. */
  baseCss: string;
  /** @font-face rules with embedded fonts. */
  fontCss: string;
  /** Paged.js polyfill source (PDF only). */
  pagedJs?: string;
  /** KaTeX CSS with embedded fonts (only when the document has math). */
  katexCss?: string;
}

/** Whether rendered body HTML needs the KaTeX stylesheet. */
export const hasMath = (body: string) => body.includes('class="katex');

export interface BodyDeps {
  /** Loads a local image as a data: URL (null if it can't be read). */
  readImage: (absPath: string) => Promise<string | null>;
  /** Hook for blocks that render asynchronously (math, diagrams). */
  postProcess?: (root: HTMLElement) => Promise<void>;
}

const renderer = createRenderer();
const isRemote = (src: string) => /^(https?:|data:|blob:)/i.test(src);

/** Renders the document body for export: clean HTML, embedded images, optional TOC. */
export async function buildBody(markdown: string, docPath: string | null, opts: ExportOptions, deps: BodyDeps): Promise<string> {
  // Code grammars and diagrams load or render asynchronously in the app. Exports need them ready.
  await Promise.all([preloadLanguages(markdown), prerenderDiagrams(markdown, 'light').catch(() => undefined)]);
  // No resolveAsset: image sources stay as written, and we embed them below.
  const html = renderer.render(markdown, { docPath, colorScheme: 'light' });
  const root = document.createElement('div');
  root.innerHTML = html;

  if (deps.postProcess) await deps.postProcess(root);

  for (const el of root.querySelectorAll('[data-line-start],[data-line-end],[data-cursor],[data-task-line]')) {
    el.removeAttribute('data-line-start');
    el.removeAttribute('data-line-end');
    el.removeAttribute('data-cursor');
    el.removeAttribute('data-task-line');
  }
  for (const box of root.querySelectorAll<HTMLInputElement>('input.task-checkbox')) box.setAttribute('disabled', '');
  // [[Wiki links]] only resolve inside CalmMD: exports keep their text.
  for (const a of root.querySelectorAll('a[href^="wiki:"]')) {
    const span = root.ownerDocument.createElement('span');
    span.className = 'wikilink';
    span.textContent = a.textContent;
    a.replaceWith(span);
  }

  if (opts.embedImages) {
    await Promise.all(
      [...root.querySelectorAll('img')].map(async (img) => {
        const src = img.getAttribute('src') ?? '';
        if (!src || isRemote(src)) return;
        const abs = resolveLocalPath(src, docPath);
        if (!abs) return;
        const data = await deps.readImage(abs).catch(() => null);
        if (data) img.setAttribute('src', data);
      }),
    );
  }
  for (const img of root.querySelectorAll('img')) img.removeAttribute('loading');

  // Video embeds: a real player in HTML, a link in print.
  for (const card of root.querySelectorAll<HTMLElement>('.embed-card')) {
    const url = card.dataset.embedUrl ?? '';
    const title = card.dataset.embedTitle || 'Video';
    if (opts.print) {
      card.outerHTML = `<a class="embed-link" href="${escapeHtml(url)}">▶ ${escapeHtml(title)} <span>${escapeHtml(url)}</span></a>`;
    } else {
      const kind = card.dataset.embedKind as 'youtube' | 'vimeo';
      const id = card.dataset.embedId!;
      const src = embedPlayerUrl(kind === 'youtube' ? { kind, id, start: Number(card.dataset.embedStart ?? 0) } : { kind, id }, false);
      card.outerHTML = `<span class="embed"><iframe class="embed-frame" src="${escapeHtml(src)}" title="${escapeHtml(title)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></span>`;
    }
  }
  if (opts.print) {
    for (const v of root.querySelectorAll('video')) {
      const src = v.getAttribute('src') ?? '';
      v.closest('.embed')!.outerHTML = `<a class="embed-link" href="${escapeHtml(src)}">▶ Video <span>${escapeHtml(src)}</span></a>`;
    }
  }

  if (opts.toc) {
    const heads = [...root.querySelectorAll<HTMLHeadingElement>('h1[id],h2[id],h3[id]')];
    if (heads.length) {
      const items = heads
        .map((h) => {
          const level = Number(h.tagName[1]);
          return `<li class="toc-${level}"><a href="#${escapeHtml(h.id)}"><span class="toc-text">${escapeHtml(h.textContent ?? '')}</span><span class="toc-dots"></span></a></li>`;
        })
        .join('');
      root.insertAdjacentHTML('afterbegin', `<nav class="toc" aria-label="Contents"><h2>Contents</h2><ol>${items}</ol></nav>`);
    }
  }
  if (opts.cover) root.insertAdjacentHTML('afterbegin', coverHtml(opts.cover));
  return root.innerHTML;
}

const cssString = (s: string) => '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ') + '"';

const MARGINS: Record<Margins, string> = {
  narrow: '14mm 14mm 16mm',
  normal: '22mm 20mm 24mm',
  wide: '30mm 28mm 32mm',
};
const PRINT_SIZE: Record<BaseTheme, string> = { paper: '11pt', studio: '10.5pt', typewriter: '10pt', github: '10.5pt', clear: '10.5pt' };

/** Styles for standalone viewing (both HTML and PDF). */
const EXPORT_CSS = `
html, body { margin: 0; background: var(--preview-bg, var(--bg)); }
body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.md-body { padding: 56px 32px 96px; }
.md-body .page-break { border: 0; margin: 0; }
.md-body .page-break::after { display: none; }
.md-body nav.toc .toc-dots { display: none; }
.md-body .task-checkbox { cursor: default; }
.md-body .front-matter { display: none; }
.md-body .cover { margin: 0 0 3em; padding: 2.5em 0 2em; border-bottom: 1px solid var(--hairline-strong); }
.md-body .cover-title { margin: 0 0 0.3em; font-family: var(--md-heading-font); font-size: 2.6em; font-weight: 700; line-height: 1.15; color: var(--fg-strong); letter-spacing: -0.015em; }
.md-body .cover-subtitle { margin: 0 0 1.6em; font-size: 1.3em; color: var(--fg-muted); }
.md-body .cover-meta p { margin: 0.2em 0; color: var(--fg-muted); font-family: var(--font-ui); font-size: 0.9em; }
.md-body .embed-link { display: block; padding: 10px 14px; border: 1px solid var(--hairline-strong); border-radius: 8px; color: var(--fg-strong); text-decoration: none; margin: 0 0 var(--md-gap); }
.md-body .embed-link span { display: block; font: 9pt var(--font-ui); color: var(--fg-faint); overflow-wrap: anywhere; }
`;

export function pdfCss(opts: ExportOptions, pdf: PdfOptions): string {
  const box = 'font-family: var(--font-ui); font-size: 8.5pt; color: #8a8f99;';
  const t = pdf.template ?? 'standard';
  const title = pdf.header && opts.title ? cssString(opts.title) : null;
  // Where the running title and page number go depends on the template.
  const header =
    t === 'minimal' || !title
      ? ''
      : t === 'report'
        ? `@top-left { content: ${title}; ${box} } @top-right { content: counter(page); ${box} }`
        : `@top-center { content: ${title}; ${box} }`;
  const footer = !pdf.pageNumbers
    ? ''
    : t === 'report'
      ? `@bottom-right { content: "Page " counter(page) " of " counter(pages); ${box} }`
      : t === 'minimal'
        ? `@bottom-right { content: counter(page); ${box} }`
        : `@bottom-center { content: counter(page) " / " counter(pages); ${box} }`;
  return `
@page { size: ${pdf.pageSize}; margin: ${MARGINS[pdf.margins]}; ${header} ${footer} }
@page :first { @top-center { content: none; } @top-left { content: none; } @top-right { content: none; } }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: var(--preview-bg, #fff); }
.md-body { max-width: none; margin: 0; padding: 0; orphans: 3; widows: 3; }
.md-body h1, .md-body h2, .md-body h3, .md-body h4, .md-body h5, .md-body h6 { break-after: avoid; }
.md-body img, .md-body tr, .md-body blockquote, .md-body figure, .md-body .katex-display, .md-body .mermaid { break-inside: avoid; }
.md-body pre, .md-body pre code { white-space: pre-wrap; overflow-wrap: anywhere; }
.md-body pre { overflow: visible; }
.md-body pre[data-lang]::after { display: none; }
.md-body table { display: table; width: 100%; max-width: 100%; }
.md-body img { max-height: 230mm; }
.md-body a { text-decoration: none; }
.md-body .page-break { break-after: page; }
.md-body nav.toc { break-after: page; }
.md-body .cover { page: cover; break-after: page; border: 0; margin: 0; padding: 62mm 0 0; }
@page cover { @top-center { content: none; } @top-left { content: none; } @top-right { content: none; } @bottom-center { content: none; } @bottom-right { content: none; } }
.md-body nav.toc a { display: flex; align-items: baseline; gap: 0.4em; }
.md-body nav.toc .toc-dots { display: block; flex: 1; border-bottom: 1px dotted var(--fg-faint); }
.md-body nav.toc a::after { content: target-counter(attr(href url), page); font-variant-numeric: tabular-nums; }
${pdf.breakBeforeH1 ? '.md-body h1 { break-before: page; } .md-body > h1:first-child, .md-body nav.toc + h1 { break-before: auto; }' : ''}
`;
}

const safeCss = (css: string) => css.replace(/<\/style/gi, '<\\/style');

/**
 * A complete, self-contained HTML document. With `pdf`, it's set up for Paged.js printing.
 *
 * Paged.js re-parses stylesheets and silently drops custom property declarations (`--md-font: …`),
 * which would strip every theme value. So for PDF, the theme (fonts, variables, user CSS) goes in a
 * `<style data-pagedjs-ignore>` that Paged.js leaves alone but the page still applies. Only the
 * paged-media rules (`@page`, breaks, target-counter) go through Paged.js.
 */
export function buildDocument(body: string, opts: ExportOptions, assets: ExportAssets, pdf?: PdfOptions): string {
  const themeCss = [
    assets.fontCss,
    hasMath(body) ? (assets.katexCss ?? '') : '',
    assets.baseCss,
    EXPORT_CSS,
    pdf ? `.md-body { --md-size: ${PRINT_SIZE[opts.theme]}; }` : '',
    pdf ? TEMPLATE_CSS[pdf.template ?? 'standard'] : '',
    opts.userCss ?? '',
  ].join('\n');
  const styles = pdf
    ? `<style data-pagedjs-ignore>\n${safeCss(themeCss)}\n</style>\n<style>\n${safeCss(pdfCss(opts, pdf))}\n</style>`
    : `<style>\n${safeCss(themeCss)}\n</style>`;
  // The PDF engine waits for window.__calmmdDone: set once Paged.js has paginated and fonts have loaded.
  const paged =
    pdf && assets.pagedJs
      ? `<script>window.PagedConfig = { auto: true, after: function () { document.fonts.ready.then(function () { window.__calmmdDone = true; }); } };</script>\n<script>${assets.pagedJs.replace(/<\/script/gi, '<\\/script')}</script>`
      : pdf
        ? `<script>window.addEventListener('load', function () { document.fonts.ready.then(function () { window.__calmmdDone = true; }); });</script>`
        : '';
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="CalmMD">
<title>${escapeHtml(opts.title)}</title>
${styles}
${paged}
</head>
<body>
<article class="md-body" data-preview-theme="${opts.theme}">
${body}
</article>
</body>
</html>
`;
}
