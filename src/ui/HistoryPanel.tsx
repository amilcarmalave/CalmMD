import { createResource, For, Show } from 'solid-js';
import type { Version } from '../app/history';
import { basename } from '../core/paths';

/** When a version was saved, in words: "Today 14:05", "Yesterday 09:12", "3 Mar 2026 18:40". */
export function versionTime(t: number, now = Date.now()): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(new Date(now)) - day(d)) / 86_400_000);
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Yesterday ${time}`;
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
}

/**
 * The sidebar's History tab: saved versions of the active file, newest first.
 */
export function HistoryPanel(props: {
  path: string | null;
  /** Bumped whenever versions change, to reload the list. */
  revision: number;
  list: (path: string) => Promise<Version[]>;
  onSave: () => void;
  onOpen: (v: Version) => void;
  saveOnClose: boolean;
  /** How much history is stored across all files. */
  usage: () => Promise<{ files: number; versions: number; chars: number }>;
  onClearFile: () => void;
  onClearAll: () => void;
  setSaveOnClose: (on: boolean) => void;
}) {
  const [usage] = createResource(
    () => props.revision + 1,
    () => props.usage().catch(() => null),
  );
  const [versions] = createResource(
    () => (props.path ? { path: props.path, rev: props.revision } : null),
    (k) => props.list(k.path).catch(() => []),
  );

  return (
    <div class="history-panel">
      <Show
        when={props.path}
        fallback={
          <div class="history-empty">
            <p class="history-muted">Save this document to a file to keep its history.</p>
          </div>
        }
      >
        <div class="history-head">
          <span class="history-file" title={props.path!}>
            {basename(props.path!)}
          </span>
          <button class="btn btn-small" onClick={props.onSave}>
            Save Version…
          </button>
        </div>
        <label class="history-option">
          <input type="checkbox" checked={props.saveOnClose} onChange={(e) => props.setSaveOnClose(e.currentTarget.checked)} />
          Save a version when I close a changed file
        </label>
        <Show when={versions()} fallback={<p class="history-muted history-pad">Loading…</p>}>
          {(list) => (
            <Show
              when={list().length > 0}
              fallback={
                <p class="history-muted history-pad">
                  No versions yet. {props.saveOnClose ? 'One is saved when you close this file after changing it, or use Save Version.' : 'Use Save Version to keep one.'}
                </p>
              }
            >
              <ul class="history-list" role="list">
                <For each={list()}>
                  {(v) => (
                    <li>
                      <button class="history-row" onClick={() => props.onOpen(v)} title="Compare with the current text">
                        <span class="history-name">{v.name ?? versionTime(v.savedAt)}</span>
                        <span class="history-meta">
                          {v.name ? `${versionTime(v.savedAt)} · ` : ''}
                          {v.size.toLocaleString()} characters
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
              <button class="history-clear" onClick={props.onClearFile}>
                Delete this file’s history…
              </button>
            </Show>
          )}
        </Show>
        <Show when={usage()?.versions}>
          <p class="history-muted history-usage">
            All file history: {usage()!.versions.toLocaleString()} {usage()!.versions === 1 ? 'version' : 'versions'} of {usage()!.files.toLocaleString()}{' '}
            {usage()!.files === 1 ? 'file' : 'files'}, about {sizeText(usage()!.chars)}.{' '}
            <button class="history-clear inline" onClick={props.onClearAll}>
              Clear all…
            </button>
          </p>
        </Show>
      </Show>
    </div>
  );
}

/** Characters of text as storage, roughly (UTF-16 in the app's store). */
function sizeText(chars: number): string {
  const bytes = chars * 2;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
