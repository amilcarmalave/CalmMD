import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { createStore, unwrap } from 'solid-js/store';
import type { ExportPrefs } from '../app/exporter';
import type { CoverInfo } from '../core/cover';
import { PDF_TEMPLATES, type Margins, type PageSize, type PdfTemplate } from '../export/build';

export function ExportDialog(props: {
  kind: 'pdf' | 'html';
  prefs: ExportPrefs;
  themes: { id: string; label: string }[];
  previewThemeLabel: string;
  engine: string | null;
  /** Cover page fields, filled from the document (front matter, first heading, today). */
  coverDefaults: CoverInfo;
  onExport: (prefs: ExportPrefs, cover: CoverInfo | null) => void;
  onClose: () => void;
}) {
  const [p, setP] = createStore<ExportPrefs>(structuredClone(unwrap(props.prefs)));
  const [cover, setCover] = createStore<CoverInfo>({ ...props.coverDefaults, author: props.coverDefaults.author || props.prefs.coverAuthor });
  const [busy, setBusy] = createSignal(false);
  let first!: HTMLSelectElement;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      props.onClose();
    }
  };
  onMount(() => {
    first?.focus();
    window.addEventListener('keydown', onKey, true);
  });
  onCleanup(() => window.removeEventListener('keydown', onKey, true));

  const sizes: PageSize[] = ['A4', 'Letter', 'A5', 'Legal'];
  const margins: Margins[] = ['narrow', 'normal', 'wide'];

  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <form
        class="modal modal-wide export-dialog"
        role="dialog"
        aria-labelledby="export-title"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          const prefs = structuredClone(unwrap(p));
          if (prefs.cover) prefs.coverAuthor = cover.author;
          props.onExport(prefs, prefs.cover ? structuredClone(unwrap(cover)) : null);
        }}
      >
        <h2 id="export-title">{props.kind === 'pdf' ? 'Export as PDF' : 'Export as HTML'}</h2>
        <div class="form-grid">
          <label for="ex-style">Style</label>
          <select id="ex-style" ref={first} value={p.theme ?? ''} onChange={(e) => setP('theme', e.currentTarget.value || null)}>
            <option value="">Same as preview ({props.previewThemeLabel})</option>
            <For each={props.themes}>{(t) => <option value={t.id}>{t.label}</option>}</For>
          </select>

          <Show when={props.kind === 'pdf'}>
            <label for="ex-template">Template</label>
            <select
              id="ex-template"
              value={p.pdf.template}
              onChange={(e) => setP('pdf', 'template', e.currentTarget.value as PdfTemplate)}
            >
              <For each={PDF_TEMPLATES}>
                {(t) => (
                  <option value={t.id} title={t.hint}>
                    {t.label}
                  </option>
                )}
              </For>
            </select>
            <label for="ex-size">Page size</label>
            <select id="ex-size" value={p.pdf.pageSize} onChange={(e) => setP('pdf', 'pageSize', e.currentTarget.value as PageSize)}>
              <For each={sizes}>{(s) => <option value={s}>{s}</option>}</For>
            </select>
            <label for="ex-margins">Margins</label>
            <select id="ex-margins" value={p.pdf.margins} onChange={(e) => setP('pdf', 'margins', e.currentTarget.value as Margins)}>
              <For each={margins}>{(m) => <option value={m}>{m[0].toUpperCase() + m.slice(1)}</option>}</For>
            </select>
          </Show>
        </div>

        <div class="check-list">
          <Show when={props.kind === 'pdf'}>
            <label class="check-row">
              <input type="checkbox" checked={p.pdf.header} onChange={(e) => setP('pdf', 'header', e.currentTarget.checked)} />
              Document title in the page header
            </label>
            <label class="check-row">
              <input type="checkbox" checked={p.pdf.pageNumbers} onChange={(e) => setP('pdf', 'pageNumbers', e.currentTarget.checked)} />
              Page numbers
            </label>
            <label class="check-row">
              <input type="checkbox" checked={p.pdf.breakBeforeH1} onChange={(e) => setP('pdf', 'breakBeforeH1', e.currentTarget.checked)} />
              Start each top-level heading on a new page
            </label>
          </Show>
          <label class="check-row">
            <input type="checkbox" checked={p.cover} onChange={(e) => setP('cover', e.currentTarget.checked)} />
            Cover page
          </label>
          <Show when={p.cover}>
            <div class="form-grid cover-fields">
              <label for="cv-title">Title</label>
              <input id="cv-title" class="modal-input" value={cover.title} onInput={(e) => setCover('title', e.currentTarget.value)} />
              <label for="cv-sub">Subtitle</label>
              <input id="cv-sub" class="modal-input" value={cover.subtitle} placeholder="Optional" onInput={(e) => setCover('subtitle', e.currentTarget.value)} />
              <label for="cv-author">Author</label>
              <input id="cv-author" class="modal-input" value={cover.author} placeholder="Optional" onInput={(e) => setCover('author', e.currentTarget.value)} />
              <label for="cv-date">Date</label>
              <input id="cv-date" class="modal-input" value={cover.date} onInput={(e) => setCover('date', e.currentTarget.value)} />
            </div>
          </Show>
          <label class="check-row">
            <input type="checkbox" checked={p.toc} onChange={(e) => setP('toc', e.currentTarget.checked)} />
            Table of contents{props.kind === 'pdf' ? ' (with page numbers)' : ''}
          </label>
          <Show when={props.kind === 'html'}>
            <label class="check-row">
              <input type="checkbox" checked={p.embedImages} onChange={(e) => setP('embedImages', e.currentTarget.checked)} />
              Embed images (one self-contained file)
            </label>
          </Show>
        </div>

        <Show when={props.kind === 'pdf'}>
          <p class="export-note">
            {props.engine
              ? `Rendered with ${props.engine}. Use “---pagebreak---” on its own line for manual page breaks.`
              : 'No Chrome, Edge or Chromium was found, so the system print dialog will open. Choose “Save as PDF” there. Running headers and page numbers need one of those browsers.'}
          </p>
        </Show>

        <div class="modal-actions">
          <button type="button" class="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary" disabled={busy()}>
            Export…
          </button>
        </div>
      </form>
    </div>
  );
}
