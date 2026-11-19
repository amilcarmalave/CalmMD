/**
 * Opt-in Takumi PDF renderer.
 *
 * Takumi takes the same self-contained HTML document as the browser print path. It reads inline CSS
 * (including the embedded KaTeX/theme fonts) but ignores scripts, so the browser-only Paged.js
 * polyfill and its `@page` margin boxes are harmless. Page geometry, running bands and metadata are
 * passed as Takumi options instead.
 */
import type { ExportOptions, PdfOptions } from './build';
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

/** Pure mapping from CalmMD export preferences to Takumi PDF options. */
export function takumiOptions({ title, pdf, cover }: TakumiRenderOptions) {
  const small = 'font-family:Inter Variable,sans-serif;font-size:9px;color:#8a8f99;';
  const header =
    pdf.header && title && pdf.template !== 'minimal'
      ? `<div style="${small}text-align:center">${escapeHtml(title)}</div>`
      : false;
  const page = '<span class="pageNumber"></span>';
  const pages = '<span class="totalPages"></span>';
  const footer = !pdf.pageNumbers
    ? false
    : pdf.template === 'report'
      ? `<div style="${small}text-align:right">Page ${page} of ${pages}</div>`
      : pdf.template === 'minimal'
        ? `<div style="${small}text-align:right">${page}</div>`
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
  };
}

/** Renders the browser-export HTML to PDF bytes with Takumi's local WASM engine. */
export async function renderPdf(html: string, opts: TakumiRenderOptions): Promise<Uint8Array> {
  const { render } = await loadTakumi();
  return render(html, takumiOptions(opts));
}

/** True when the platform can run a Takumi export (the browser/WASM build works everywhere). */
export const takumiAvailable = () => true;

/** Keeps the export options type referenced here so mapping changes are typechecked with it. */
export type TakumiExportOptions = ExportOptions;
