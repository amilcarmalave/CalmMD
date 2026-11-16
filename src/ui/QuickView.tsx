import { createResource, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { fileKind, formatBytes, parseDelimited, QUICK_VIEW_MAX_BYTES } from '../core/fileKinds';
import { basename, dirname } from '../core/paths';
import { highlightFileToHtml } from '../render/highlight';

/**
 * Read-only Quick view for files that aren't notes: images, PDFs, text and code, CSV/TSV tables,
 * and a details card for everything else. Escape or the backdrop closes it.
 */
export function QuickView(props: {
  path: string;
  assetUrl: (path: string) => string;
  readText: (path: string) => Promise<string>;
  stat: (path: string) => Promise<{ size: number; mtimeMs: number } | null>;
  openWithDefault: (path: string) => void;
  reveal: (path: string) => void;
  revealLabel: string;
  onClose: () => void;
  /** Shown in a tab (no backdrop, no close button, keys left alone) instead of as a peek. */
  embedded?: boolean;
}) {
  const kind = fileKind(props.path);
  const [zoom, setZoom] = createSignal(false);
  const [tick, setTick] = createSignal(0);
  const [info] = createResource(() => props.stat(props.path).catch(() => null));
  const [text] = createResource(async () => {
    if (kind !== 'text' && kind !== 'table') return null;
    const s = await props.stat(props.path).catch(() => null);
    if (s && s.size > QUICK_VIEW_MAX_BYTES) return { error: 'This file is too large to preview.' };
    try {
      return { text: await props.readText(props.path) };
    } catch {
      return { error: 'This file isn’t text that can be previewed.' };
    }
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || (e.key === ' ' && !(e.target as HTMLElement).closest('input,textarea'))) {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    }
  };
  onMount(() => !props.embedded && window.addEventListener('keydown', onKey, true));
  onCleanup(() => window.removeEventListener('keydown', onKey, true));

  const table = () => {
    const t = text();
    if (!t || !('text' in t) || !t.text) return null;
    return parseDelimited(t.text, /\.tsv$/i.test(props.path) ? '\t' : ',');
  };

  const panel = () => (
      <div class="quickview" classList={{ embedded: !!props.embedded }} role={props.embedded ? 'region' : 'dialog'} aria-label={`${props.embedded ? '' : 'Quick view: '}${basename(props.path)}`}>
        <header class="quickview-head">
          <div class="quickview-title">
            <strong>{basename(props.path)}</strong>
            <span>
              {dirname(props.path)}
              {info() ? ` · ${formatBytes(info()!.size)}` : ''}
            </span>
          </div>
          <Show when={kind === 'image'}>
            <button class="btn btn-small" onClick={() => setZoom(!zoom())}>
              {zoom() ? 'Fit' : 'Actual size'}
            </button>
          </Show>
          <button class="btn btn-small" onClick={() => props.openWithDefault(props.path)}>
            Open with Default App
          </button>
          <button class="btn btn-small" onClick={() => props.reveal(props.path)}>
            {props.revealLabel}
          </button>
          <Show when={!props.embedded}>
            <button class="icon-btn quickview-close" aria-label="Close" title="Close (Esc)" onClick={props.onClose}>
              ✕
            </button>
          </Show>
        </header>
        <div class="quickview-body" classList={{ [`qv-${kind}`]: true }}>
          <Show when={kind === 'image'}>
            <div class="qv-image-wrap" classList={{ zoom: zoom() }}>
              <img src={props.assetUrl(props.path)} alt={basename(props.path)} onClick={() => setZoom(!zoom())} />
            </div>
          </Show>
          <Show when={kind === 'pdf'}>
            <iframe class="qv-pdf" src={props.assetUrl(props.path)} title={basename(props.path)} />
          </Show>
          <Show when={kind === 'text'}>
            <Show when={text()} fallback={<p class="qv-note">Loading…</p>}>
              {(t) =>
                'error' in t() ? (
                  <p class="qv-note">{(t() as { error: string }).error}</p>
                ) : (
                  // Same grammars and colours as code blocks; re-renders once a grammar has loaded.
                  <div class="md-body qv-code-wrap">
                    <pre class="qv-code">
                      <code innerHTML={(tick(), highlightFileToHtml((t() as { text: string }).text, props.path, () => setTick((n) => n + 1)))} />
                    </pre>
                  </div>
                )
              }
            </Show>
          </Show>
          <Show when={kind === 'table'}>
            <Show when={table()} fallback={<p class="qv-note">{text() && 'error' in text()! ? (text() as { error: string }).error : 'Loading…'}</p>}>
              {(t) => (
                <div class="qv-table-wrap md-body">
                  <table>
                    <thead>
                      <tr>
                        <For each={t().rows[0] ?? []}>{(h) => <th>{h}</th>}</For>
                      </tr>
                    </thead>
                    <tbody>
                      <For each={t().rows.slice(1)}>{(r) => <tr><For each={r}>{(c) => <td>{c}</td>}</For></tr>}</For>
                    </tbody>
                  </table>
                  <Show when={t().truncated}>
                    <p class="qv-note">Showing the first {t().rows.length} rows.</p>
                  </Show>
                </div>
              )}
            </Show>
          </Show>
          <Show when={kind === 'other'}>
            <div class="qv-card">
              <p>
                <strong>{basename(props.path)}</strong>
              </p>
              <p class="qv-note">
                {info() ? `${formatBytes(info()!.size)} · changed ${new Date(info()!.mtimeMs).toLocaleString()}` : ''}
              </p>
              <p class="qv-note">CalmMD can’t show this kind of file. Open it with its own app instead.</p>
            </div>
          </Show>
        </div>
      </div>
  );
  return (
    <Show when={!props.embedded} fallback={panel()}>
      <div class="modal-backdrop quickview-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
        {panel()}
      </div>
    </Show>
  );
}
