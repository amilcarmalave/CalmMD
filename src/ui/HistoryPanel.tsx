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
 * The sidebar's History tab: saved versions of the active file, newest first. Supporters only;
 * everyone else sees what it does and how to get it.
 */
export function HistoryPanel(props: {
  path: string | null;
  isPro: boolean;
  /** Bumped whenever versions change, to reload the list. */
  revision: number;
  list: (path: string) => Promise<Version[]>;
  onSave: () => void;
  onOpen: (v: Version) => void;
  saveOnClose: boolean;
  setSaveOnClose: (on: boolean) => void;
  onSupporter: () => void;
}) {
  const [versions] = createResource(
    () => (props.isPro && props.path ? { path: props.path, rev: props.revision } : null),
    (k) => props.list(k.path).catch(() => []),
  );

  return (
    <div class="history-panel">
      <Show
        when={props.isPro}
        fallback={
          <div class="history-empty">
            <p>
              <strong>File history</strong> keeps earlier versions of each file, saved when you close it or when you ask, so you can
              compare and bring back what you had.
            </p>
            <p class="history-muted">A Supporter extra.</p>
            <button class="btn btn-small btn-primary" onClick={props.onSupporter}>
              Become a Supporter…
            </button>
          </div>
        }
      >
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
              </Show>
            )}
          </Show>
        </Show>
      </Show>
    </div>
  );
}
