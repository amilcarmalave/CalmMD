import { Show, type JSX } from 'solid-js';
import type { DocMeta } from '../app/documents';
import { formatCount, type TextStats } from '../core/stats';

export function saveLabel(doc: DocMeta | undefined): { text: string; tone: 'quiet' | 'busy' | 'warn' } {
  if (!doc) return { text: '', tone: 'quiet' };
  if (doc.conflict) return { text: 'Changed on disk', tone: 'warn' };
  if (doc.status === 'error') return { text: 'Couldn’t save, retrying', tone: 'warn' };
  if (doc.status === 'saving') return { text: 'Saving…', tone: 'busy' };
  if (doc.status === 'dirty') return { text: 'Edited', tone: 'busy' };
  if (!doc.path) return { text: 'Draft', tone: 'quiet' };
  return { text: 'Saved', tone: 'quiet' };
}

const plural = (n: number, one: string, many: string) => `${formatCount(n)} ${n === 1 ? one : many}`;

export function StatusBar(props: {
  doc: DocMeta | undefined;
  stats: TextStats;
  selection: TextStats | null;
  message: { text: string; action?: { label: string; run: () => void } } | null;
  leading?: JSX.Element;
  trailing?: JSX.Element;
}) {
  const label = () => saveLabel(props.doc);
  return (
    <footer class="statusbar">
      <Show when={props.leading}>
        <span class="status-controls status-leading">{props.leading}</span>
      </Show>
      <Show
        when={props.message}
        fallback={
          <span class="status-save" data-tone={label().tone} title={props.doc?.lastError ?? undefined}>
            {label().text}
          </span>
        }
      >
        {(m) => (
          <span class="status-message">
            {m().text}
            <Show when={m().action}>
              {(a) => (
                <button class="status-action" onClick={() => a().run()}>
                  {a().label}
                </button>
              )}
            </Show>
          </span>
        )}
      </Show>
      <span class="status-spacer" />
      <span class="status-counts" aria-live="polite">
        <Show
          when={props.selection}
          fallback={
            <>
              {plural(props.stats.words, 'word', 'words')}
              <span class="sep">·</span>
              {plural(props.stats.chars, 'character', 'characters')}
              <span class="sep">·</span>
              {plural(props.stats.lines, 'line', 'lines')}
            </>
          }
        >
          {(sel) => (
            <span class="status-selection">
              {plural(sel().words, 'word', 'words')}
              <span class="sep">·</span>
              {plural(sel().chars, 'character', 'characters')}
              <span class="sep">·</span>
              {plural(sel().lines, 'line', 'lines')} selected
            </span>
          )}
        </Show>
      </span>
      <Show when={props.trailing}>
        <span class="status-controls">{props.trailing}</span>
      </Show>
    </footer>
  );
}
