import { createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import type { Version } from '../app/history';
import { diffLines, type DiffLine } from '../core/diff';
import { basename } from '../core/paths';
import { versionTime } from './HistoryPanel';

/** Unchanged runs longer than this fold down to their first and last lines. */
const CONTEXT = 3;

type Row = DiffLine | { kind: 'fold'; count: number };

function foldRows(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < lines.length; ) {
    if (lines[i].kind !== 'same') {
      rows.push(lines[i++]);
      continue;
    }
    let j = i;
    while (j < lines.length && lines[j].kind === 'same') j++;
    const run = lines.slice(i, j);
    const head = i === 0 ? 0 : CONTEXT;
    const tail = j === lines.length ? 0 : CONTEXT;
    if (run.length > head + tail + 1) {
      rows.push(...run.slice(0, head), { kind: 'fold', count: run.length - head - tail }, ...run.slice(run.length - tail));
    } else rows.push(...run);
    i = j;
  }
  return rows;
}

/**
 * One saved version next to the current text: what's only in the version (red) and what was
 * added since (green). Restore brings the version back as an undoable edit.
 */
export function VersionView(props: {
  path: string;
  version: Version;
  versionText: string;
  currentText: string;
  onRestore: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [all, setAll] = createSignal(false);
  const lines = createMemo(() => diffLines(props.versionText, props.currentText));
  const changes = createMemo(() => lines().filter((l) => l.kind !== 'same').length);
  const rows = createMemo<Row[]>(() => (all() ? lines() : foldRows(lines())));

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      props.onClose();
    }
  };
  onMount(() => window.addEventListener('keydown', onKey, true));
  onCleanup(() => window.removeEventListener('keydown', onKey, true));

  return (
    <div class="modal-backdrop quickview-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="quickview version-view" role="dialog" aria-label={`Version of ${basename(props.path)}`}>
        <header class="quickview-head">
          <div class="quickview-title">
            <strong>{props.version.name ?? versionTime(props.version.savedAt)}</strong>
            <span>
              {basename(props.path)}
              {props.version.name ? ` · ${versionTime(props.version.savedAt)}` : ''}
            </span>
          </div>
          <button class="btn btn-small" onClick={props.onDelete}>
            Delete Version
          </button>
          <button class="btn btn-small btn-primary" disabled={changes() === 0} onClick={props.onRestore}>
            Restore This Version
          </button>
          <button class="icon-btn quickview-close" aria-label="Close" title="Close (Esc)" onClick={props.onClose}>
            ✕
          </button>
        </header>
        <div class="version-legend">
          <Show when={changes() > 0} fallback={<span>This version is the same as the current text.</span>}>
            <span class="version-key del">Only in this version</span>
            <span class="version-key add">Added since</span>
            <label class="version-all">
              <input type="checkbox" checked={all()} onChange={(e) => setAll(e.currentTarget.checked)} />
              Show unchanged lines
            </label>
          </Show>
        </div>
        <div class="quickview-body">
          <div class="version-diff">
            <For each={rows()}>
              {(r) =>
                r.kind === 'fold' ? (
                  <button class="version-fold" onClick={() => setAll(true)}>
                    {r.count} unchanged {r.count === 1 ? 'line' : 'lines'}
                  </button>
                ) : (
                  <div class={`version-line ${r.kind}`}>{r.text || ' '}</div>
                )
              }
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
