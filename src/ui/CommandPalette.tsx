import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { fuzzyFilter, type FuzzyMatch } from '../core/fuzzy';

export interface PaletteItem {
  id: string;
  label: string;
  /** Secondary text (category, folder). */
  detail?: string;
  /** Right-aligned hint, such as a shortcut. */
  hint?: string;
  run: () => unknown;
  /** Mod+Enter (for example "open in a new window"). */
  altRun?: () => unknown;
}

export interface PaletteSource {
  /** Text shown when this source is active and the query is empty. */
  placeholder: string;
  items: (query: string) => PaletteItem[];
  /** If set, the source handles the query itself (no fuzzy filtering). */
  raw?: boolean;
  empty?: string;
}

/** Prefixes switch sources, like VS Code: ">" commands, ":" line, "@" headings, none = files. */
export type PalettePrefix = '>' | ':' | '@' | '#' | '';

export function CommandPalette(props: {
  initial: string;
  sources: Record<PalettePrefix, PaletteSource>;
  onClose: () => void;
}) {
  const [query, setQuery] = createSignal(props.initial);
  const [index, setIndex] = createSignal(0);
  let input!: HTMLInputElement;
  let list!: HTMLDivElement;

  const prefix = createMemo<PalettePrefix>(() => {
    const c = query()[0];
    return c === '>' || c === ':' || c === '@' || c === '#' ? c : '';
  });
  const term = () => query().slice(prefix().length);
  const source = () => props.sources[prefix()];

  const results = createMemo((): { item: PaletteItem; match: FuzzyMatch | null }[] => {
    const src = source();
    const items = src.items(term());
    if (src.raw) return items.map((item) => ({ item, match: null }));
    return fuzzyFilter(term(), items, (i) => i.label).slice(0, 200);
  });

  createEffect(() => {
    results();
    setIndex(0);
  });
  createEffect(() => {
    const i = index();
    list?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  const choose = (i: number, alt = false) => {
    const r = results()[i];
    if (!r) return;
    props.onClose();
    void (alt && r.item.altRun ? r.item.altRun() : r.item.run());
  };

  const onKey = (e: KeyboardEvent) => {
    const n = results().length;
    if (e.key === 'ArrowDown') setIndex((i) => (n ? (i + 1) % n : 0));
    else if (e.key === 'ArrowUp') setIndex((i) => (n ? (i - 1 + n) % n : 0));
    else if (e.key === 'PageDown') setIndex((i) => Math.min(n - 1, i + 8));
    else if (e.key === 'PageUp') setIndex((i) => Math.max(0, i - 8));
    else if (e.key === 'Enter') choose(index(), e.metaKey || e.ctrlKey);
    else if (e.key === 'Escape') props.onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  onMount(() => {
    input.focus();
    input.setSelectionRange(query().length, query().length);
    const onDown = (e: MouseEvent) => !(e.target as Element).closest('.palette') && props.onClose();
    window.addEventListener('mousedown', onDown, true);
    onCleanup(() => window.removeEventListener('mousedown', onDown, true));
  });

  return (
    <div class="palette-layer">
      <div class="palette" role="dialog" aria-label="Command palette">
        <input
          ref={input}
          class="palette-input"
          value={query()}
          placeholder={source().placeholder}
          spellcheck={false}
          autocomplete="off"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={`palette-${index()}`}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={onKey}
        />
        <div class="palette-list" id="palette-list" role="listbox" ref={list}>
          <For each={results()}>
            {(r, i) => (
              <div
                id={`palette-${i()}`}
                role="option"
                aria-selected={i() === index()}
                class="palette-item"
                classList={{ active: i() === index() }}
                data-i={i()}
                onMouseMove={() => setIndex(i())}
                onClick={(e) => choose(i(), e.metaKey || e.ctrlKey)}
              >
                <span class="palette-label">{highlight(r.item.label, r.match)}</span>
                <Show when={r.item.detail}>
                  <span class="palette-detail">{r.item.detail}</span>
                </Show>
                <Show when={r.item.hint}>
                  <kbd class="palette-hint">{r.item.hint}</kbd>
                </Show>
              </div>
            )}
          </For>
          <Show when={results().length === 0}>
            <div class="palette-empty">{source().empty ?? 'No matches'}</div>
          </Show>
        </div>
        <div class="palette-foot">
          <span>
            <kbd>&gt;</kbd> commands
          </span>
          <span>
            <kbd>:</kbd> line
          </span>
          <span>
            <kbd>@</kbd> heading
          </span>
          <span>
            <kbd>#</kbd> space
          </span>
          <Show when={prefix() === '#'}>
            <span>
              <kbd>Ctrl/⌘ ↵</kbd> new window
            </span>
          </Show>
          <span>
            <kbd>↵</kbd> open
          </span>
        </div>
      </div>
    </div>
  );
}

function highlight(text: string, match: FuzzyMatch | null): JSX.Element {
  if (!match || match.positions.length === 0) return text;
  const set = new Set(match.positions);
  const parts: JSX.Element[] = [];
  let run = '';
  let inMatch = false;
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m !== inMatch && run) {
      parts.push(inMatch ? <mark>{run}</mark> : run);
      run = '';
    }
    inMatch = m;
    run += text[i];
  }
  if (run) parts.push(inMatch ? <mark>{run}</mark> : run);
  return <>{parts}</>;
}
