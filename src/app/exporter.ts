import { createMarkdownService } from '../core/markdownService';
import { basename, dirname, joinPath, stem } from '../core/paths';
import { pdfEngine, useRustMarkdown } from '../core/rustFlags';
import type { CoverInfo } from '../core/cover';
import { buildBody, buildDocument, DEFAULT_PDF, hasMath, type BaseTheme, type ExportOptions, type PdfOptions } from '../export/build';
import type { Platform, SaveKind } from '../platform/types';

export interface ExportSource {
  text: string;
  path: string | null;
  name: string;
}

export interface ExportPrefs {
  pdf: PdfOptions;
  toc: boolean;
  embedImages: boolean;
  /** Preview style for exports. null = whatever the preview uses. */
  theme: string | null;
  /** A cover page (the fields are filled per document; the author is remembered). */
  cover: boolean;
  coverAuthor: string;
}

export const DEFAULT_EXPORT_PREFS: ExportPrefs = { pdf: DEFAULT_PDF, toc: false, embedImages: true, theme: null, cover: false, coverAuthor: '' };
const KEY = 'export-options';

export function parseExportPrefs(raw: string | null): ExportPrefs {
  try {
    const p = raw ? (JSON.parse(raw) as Partial<ExportPrefs>) : {};
    const pdf = { ...DEFAULT_PDF, ...(p.pdf ?? {}) };
    if (!['A4', 'Letter', 'A5', 'Legal'].includes(pdf.pageSize)) pdf.pageSize = 'A4';
    if (!['narrow', 'normal', 'wide'].includes(pdf.margins)) pdf.margins = 'normal';
    if (!['standard', 'report', 'academic', 'minimal'].includes(pdf.template)) pdf.template = 'standard';
    return {
      pdf,
      toc: typeof p.toc === 'boolean' ? p.toc : false,
      embedImages: typeof p.embedImages === 'boolean' ? p.embedImages : true,
      theme: typeof p.theme === 'string' ? p.theme : null,
      cover: typeof p.cover === 'boolean' ? p.cover : false,
      coverAuthor: typeof p.coverAuthor === 'string' ? p.coverAuthor.slice(0, 200) : '',
    };
  } catch {
    return structuredClone(DEFAULT_EXPORT_PREFS);
  }
}

export interface ExporterDeps {
  platform: Platform;
  /** The active document. */
  current: () => { text: string; path: string | null; name: string } | null;
  /** Resolves a theme id (or null for the preview's) to its base and user CSS. */
  theme: (id: string | null) => { base: BaseTheme; css: string | null };
  notify: (msg: string, action?: { label: string; run: () => void }) => void;
  /** Lets math and diagrams render before export (M8). */
  postProcess?: (root: HTMLElement) => Promise<void>;
}

export type Exporter = ReturnType<typeof createExporter>;

export function createExporter(deps: ExporterDeps) {
  const { platform } = deps;
  const markdown = createMarkdownService(platform);

  async function loadPrefs() {
    return parseExportPrefs(await platform.kvGet(KEY).catch(() => null));
  }
  async function savePrefs(p: ExportPrefs) {
    await platform.kvSet(KEY, JSON.stringify(p));
  }

  /** Defaults the save dialog to the document's folder and name. */
  function suggested(ext: string) {
    const d = deps.current();
    const name = (d?.path ? stem(d.path) : d?.name.replace(/\.md$/i, '')) || 'Untitled';
    return d?.path ? joinPath(dirname(d.path), `${name}.${ext}`) : `${name}.${ext}`;
  }

  async function prepareFor(d: ExportSource, prefs: ExportPrefs, withPaged: boolean, cover: CoverInfo | null) {
    const { base, css } = deps.theme(prefs.theme);
    const title = d.path ? stem(d.path) : d.name;
    // PDF always embeds images, since the browser printing it can't see relative files.
    const opts: ExportOptions = {
      title,
      theme: base,
      userCss: css,
      toc: prefs.toc,
      embedImages: withPaged || prefs.embedImages,
      print: withPaged,
      cover,
    };
    const [{ loadExportAssets }, body] = await Promise.all([
      import('../export/assets'),
      buildBody(d.text, d.path, opts, {
        readImage: (p) => platform.readImageDataUrl(p).catch(() => null),
        postProcess: deps.postProcess,
        renderMarkdown: useRustMarkdown()
          ? async (text, _docPath, theme) =>
              (await markdown.render(text, { highlightCode: true, theme })).html
          : undefined,
      }),
    ]);
    const assets = await loadExportAssets(withPaged, hasMath(body));
    return { opts, body, assets };
  }

  async function prepare(prefs: ExportPrefs, withPaged: boolean, cover: CoverInfo | null) {
    const d = deps.current();
    if (!d) throw new Error('Nothing to export');
    return prepareFor(d, prefs, withPaged, cover);
  }

  const reveal = (path: string) => ({ label: 'Show', run: () => void platform.revealPath(path) });
  const fail = (what: string, e: unknown) => deps.notify(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);

  async function exportHtml(prefs: ExportPrefs, cover: CoverInfo | null = null) {
    const out = await platform.saveFileDialog(suggested('html'), 'html');
    if (!out) return;
    try {
      deps.notify('Exporting HTML…');
      const { opts, body, assets } = await prepare(prefs, false, cover);
      await platform.writeTextFile(out, buildDocument(body, opts, assets));
      deps.notify(`Exported ${basename(out)}`, reveal(out));
    } catch (e) {
      fail('HTML export', e);
    }
  }

  async function exportPdf(prefs: ExportPrefs, cover: CoverInfo | null = null) {
    const out = await platform.saveFileDialog(suggested('pdf'), 'pdf');
    if (!out) return;
    try {
      deps.notify('Exporting PDF…');
      const { opts, body, assets } = await prepare(prefs, true, cover);
      await writePdf(buildDocument(body, opts, assets, prefs.pdf), out, opts.title, prefs.pdf, prefs.cover);
      deps.notify(`Exported ${basename(out)}`, reveal(out));
    } catch (e) {
      if (String(e).includes('NO_BROWSER') && pdfEngine() === 'browser') {
        // Without a Chromium engine, use the system print dialog ("Save as PDF").
        // It has no running headers or page numbers, but the layout and styles are the same.
        const { opts, body, assets } = await prepare(prefs, false, cover);
        opts.print = true;
        printWithDialog(buildDocument(body, opts, { ...assets, pagedJs: undefined }, prefs.pdf));
        deps.notify('Choose “Save as PDF” in the print dialog');
      } else fail('PDF export', e);
    }
  }

  /** Sends the prepared HTML to the selected PDF engine. Takumi runs natively on desktop. */
  async function writePdf(html: string, out: string, title: string, pdf: PdfOptions, cover: boolean) {
    const engine = pdfEngine();
    if (engine === 'takumi') {
      const { takumiOptions } = await import('../export/takumi');
      await platform.takumiPdf(html, out, takumiOptions({ title, pdf, cover }));
      return;
    }
    if (engine === 'ikat') throw new Error('The ikat PDF engine is not implemented yet.');
    await platform.printPdf(html, out);
  }

  /** Fallback: print a self-contained page with the webview's print dialog (no scripts needed). */
  function printWithDialog(html: string) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    frame.srcdoc = html;
    frame.onload = () => {
      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(() => frame.remove(), 60_000);
      }, 300);
    };
    document.body.append(frame);
  }

  /** Headless exports for MCP: the caller supplies the source and the exact output path. */
  async function exportPdfData(doc: ExportSource, out: string, prefs: ExportPrefs = DEFAULT_EXPORT_PREFS, cover: CoverInfo | null = null) {
    const { opts, body, assets } = await prepareFor(doc, prefs, true, cover);
    await writePdf(buildDocument(body, opts, assets, prefs.pdf), out, opts.title, prefs.pdf, prefs.cover);
    return out;
  }

  async function exportHtmlData(doc: ExportSource, out: string, prefs: ExportPrefs = DEFAULT_EXPORT_PREFS, cover: CoverInfo | null = null) {
    const { opts, body, assets } = await prepareFor(doc, prefs, false, cover);
    await platform.writeTextFile(out, buildDocument(body, opts, assets));
    return out;
  }

  async function exportPandoc(kind: Extract<SaveKind, 'docx' | 'odt' | 'epub'>) {
    const d = deps.current();
    if (!d) return;
    const out = await platform.saveFileDialog(suggested(kind), kind);
    if (!out) return;
    try {
      deps.notify(`Exporting with Pandoc…`);
      await platform.pandocConvert(d.text, out, d.path ? dirname(d.path) : null);
      deps.notify(`Exported ${basename(out)}`, reveal(out));
    } catch (e) {
      fail('Pandoc export', e);
    }
  }

  /** Rich HTML on the clipboard (paste into email, docs, CMS), with Markdown as the plain-text fallback. */
  async function copyHtml() {
    const d = deps.current();
    if (!d) return;
    const { base, css } = deps.theme(null);
    const body = await buildBody(d.text, d.path, { title: d.name, theme: base, userCss: css, toc: false, embedImages: false }, {
      readImage: async () => null,
      postProcess: deps.postProcess,
    });
    await platform.writeClipboardHtml(body, d.text);
    deps.notify('Copied as HTML');
  }

  return { loadPrefs, savePrefs, exportHtml, exportPdf, exportPdfData, exportHtmlData, exportPandoc, copyHtml };
}
