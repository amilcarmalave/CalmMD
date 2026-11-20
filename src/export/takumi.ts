/**
 * Opt-in Takumi PDF renderer.
 *
 * Takumi takes the same self-contained HTML document as the browser print path. It reads inline CSS
 * (including the embedded KaTeX/theme fonts) but ignores scripts, so the browser-only Paged.js
 * polyfill and its `@page` margin boxes are harmless. Page geometry, running bands and metadata are
 * passed as Takumi options instead.
 */
import type { ExportOptions, PdfOptions } from './build';
import { takumiFontWeight } from '../core/rustFlags';
import { escapeHtml } from '../render/highlight';

// Vite resolves this to a local asset. The package's default browser entry uses top-level await,
// which the app's older WebView targets don't support, so initialise the no-init build explicitly.
const wasmUrl = new URL('../../node_modules/takumi-pdf/pkg/takumi_pdf_wasm_bg.wasm', import.meta.url);
type TakumiModule = typeof import('takumi-pdf/no-init');
let initialised: Promise<TakumiModule> | null = null;

async function loadTakumi(): Promise<TakumiModule> {
  initialised ??= Promise.all([
    import('takumi-pdf/no-init'),
    fetch(wasmUrl).then((response) => {
      if (!response.ok) throw new Error(`Could not load the local Takumi PDF engine (${response.status})`);
      return response.arrayBuffer();
    }),
  ]).then(([module, bytes]) => {
    module.initSync({ module: bytes });
    return module;
  });
  return initialised;
}

const PAGE_SIZE = {
  A4: 'a4',
  Letter: 'letter',
  A5: 'a5',
  Legal: 'legal',
} as const;

/** millimetres → CSS px, matching the browser export's margin presets. */
const MARGINS = {
  narrow: { top: 53, right: 53, bottom: 60, left: 53 },
  normal: { top: 83, right: 76, bottom: 91, left: 76 },
  wide: { top: 113, right: 106, bottom: 121, left: 106 },
} as const;

export interface TakumiRenderOptions {
  title: string;
  pdf: PdfOptions;
  /** Suppresses both running bands on page one, like the browser export's cover page. */
  cover?: boolean;
}

/** Wire shape shared by the browser/WASM and native Rust PDF backends. */
export interface TakumiPdfOptions {
  size: 'a4' | 'letter' | 'a5' | 'legal';
  margin: { top: number; right: number; bottom: number; left: number };
  header: string | false;
  footer: string | false;
  pages: { first: { header: false; footer?: false } };
  outline: boolean;
  metadata: { title: string; creator: string };
  lang: string;
  /** Number h2 sections explicitly; Takumi's counter scopes differ from Chromium's. */
  headingNumbers?: boolean;
  /** Numeric CSS font-weight for inherited body text; explicit heading weights still win. */
  fontWeight?: number;
}

/** Pure mapping from CalmMD export preferences to Takumi PDF options. */
export function takumiOptions({ title, pdf, cover }: TakumiRenderOptions): TakumiPdfOptions {
  const small = 'font-family:Inter Variable,sans-serif;font-size:9px;color:#8a8f99;';
  const page = '<span class="pageNumber"></span>';
  const pages = '<span class="totalPages"></span>';
  const reportHeader =
    pdf.header && title && pdf.template === 'report'
      ? `<div style="${small}display:flex;justify-content:space-between;padding:0 76px">${escapeHtml(title)}<span>${page}</span></div>`
      : null;
  const header =
    pdf.header && title && pdf.template !== 'minimal'
      ? reportHeader ?? `<div style="${small}text-align:center">${escapeHtml(title)}</div>`
      : false;
  const footer = !pdf.pageNumbers
    ? false
    : pdf.template === 'report'
      ? `<div style="${small}text-align:right;padding-right:76px">Page ${page} of ${pages}</div>`
      : pdf.template === 'minimal'
        ? `<div style="${small}text-align:right;padding-right:76px">${page}</div>`
        : `<div style="${small}text-align:center">${page} / ${pages}</div>`;
  return {
    size: PAGE_SIZE[pdf.pageSize],
    margin: MARGINS[pdf.margins],
    header,
    footer,
    pages: { first: { header: false, footer: cover ? false : undefined } },
    outline: true,
    metadata: { title, creator: 'CalmMD' },
    lang: 'en',
    headingNumbers: pdf.template === 'academic',
    fontWeight: takumiFontWeight(),
  };
}

/** Applies the same renderer-only adaptations as `core/export/takumi.rs`. */
export function adaptHtmlForTakumi(html: string, options: TakumiPdfOptions): string {
  // Takumi does not support CSS target-counter(); its own hook resolves the target of the
  // enclosing link.
  let out = html.replace(
    '<span class="toc-dots"></span></a>',
    '<span class="toc-dots"></span><span class="targetPageNumber toc-page-number"></span></a>',
  );
  const box = 'position:static;display:inline-block;box-sizing:border-box;width:1.02em;height:1.02em;margin:0 .55em 0 -1.7em;vertical-align:-.12em;border:1px solid #9aa0aa;border-radius:2px;background-color:#fff;background-repeat:no-repeat;background-position:center;background-size:9px 9px';
  const check =
    "data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2012%2012%27%3E%3Cpath%20d=%27M2%206.5L4.8%209.2L10%203.5%27%20fill=%27none%27%20stroke=%27%234d7fbf%27%20stroke-width=%271.8%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27/%3E%3C/svg%3E";
  out = out
    .replace(
      '<input type="checkbox" class="task-checkbox" checked="" disabled="">',
      `<span class="task-checkbox" style="${box};background-image:url(${check})"></span>`,
    )
    .replace(
      '<input type="checkbox" class="task-checkbox" disabled="">',
      `<span class="task-checkbox" style="${box}"></span>`,
    );
  out = out
    .replace('font-family%3D%22Georgia%22', 'font-family%3D%22Literata%20Variable%22')
    .replace("font-family='Georgia'", "font-family='Literata Variable'")
    .replace('font-family="Georgia"', 'font-family="Literata Variable"')
    .replace('↩︎</a>', 'back</a>');
  const weight = Math.min(1000, Math.max(1, options.fontWeight ?? 350));
  out = out.replace(
    '</head>',
    `<style>.md-body { font-weight: ${weight}; }</style></head>`,
  );
  return out;
}

/** Renders the browser-export HTML to PDF bytes with Takumi's local WASM engine. */
export async function renderPdf(
  html: string,
  opts: TakumiRenderOptions | TakumiPdfOptions,
): Promise<Uint8Array> {
  const { render } = await loadTakumi();
  const options = 'size' in opts ? opts : takumiOptions(opts);
  return render(adaptHtmlForTakumi(html, options), options);
}

/** True when the platform can run a Takumi export (the browser/WASM build works everywhere). */
export const takumiAvailable = () => true;

/** Keeps the export options type referenced here so mapping changes are typechecked with it. */
export type TakumiExportOptions = ExportOptions;
