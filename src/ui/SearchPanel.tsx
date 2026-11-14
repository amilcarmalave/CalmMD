import { createEffect, createSignal, For, on, onCleanup, onMount, Show } from 'solid-js';
import { basename, dirname, isWithin } from '../core/paths';
import { groupHits, matchRanges, SEARCH_MAX_HITS, type SearchHit, type SearchOptions } from '../core/search';
import { IconChevron, IconFile } from './sidebarIcons';

/**
 * Search across the open folder (Mod+Shift+F). Results are grouped by file; clicking a line
 * opens the file there. Searches as you type, after a short pause.
 */
export function SearchPanel(props: {
  root: string | null;
  search: (root: string, query: string, opts: SearchOptions) => Promise<SearchHit[]>;
  openHit: (hit: SearchHit) => void;
  openFolder: () => void;
  /** Bumped by the app to focus the box (and optionally prefill it). */
  focusRequest: { n: number; query?: string };
}) {
  const [query, setQuery] = createSignal('');
  const [opts, setOpts] = createSignal<SearchOptions>({ caseSensitive: false, wholeWord: false });
  const [hits, setHits] = createSignal<SearchHit[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({});
  let input!: HTMLInputElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let seq = 0;
  onCleanup(() => clearTimeout(timer));

  const run = () => {
    clearTimeout(timer);
    const q = query();
    const root = props.root;
    if (!q.trim() || !root) {
      setHits([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    const mine = ++seq;
    timer = setTimeout(async () => {
      const result = await props.search(root, q, opts()).catch(() => []);
      if (mine !== seq) return; // a newer search started
      setHits(result);
      setBusy(false);
    }, 220);
  };
  createEffect(on([query, opts, () => props.root], run, { defer: true }));

  onMount(() => input.focus());
  createEffect(
    on(
      () => props.focusRequest.n,
      () => {
        if (props.focusRequest.query) setQuery(props.focusRequest.query);
        queueMicrotask(() => {
          input.focus();
          input.select();
        });
      },
      { defer: true },
    ),
  );

  const groups = () => groupHits(hits());
  const rel = (path: string) => {
    const dir = dirname(path);
    return props.root && isWithin(dir, props.root) ? dir.slice(props.root.length).replace(/^[\\/]/, '') : dir;
  };
  const Highlighted = (p: { text: string }) => {
    const parts = () => {
      const r = matchRanges(p.text, query(), opts());
      const out: { t: string; m: boolean }[] = [];
      let at = 0;
      for (const [a, b] of r) {
        if (a > at) out.push({ t: p.text.slice(at, a), m: false });
        out.push({ t: p.text.slice(a, b), m: true });
        at = b;
      }
      out.push({ t: p.text.slice(at), m: false });
      return out;
    };
    return <For each={parts()}>{(x) => (x.m ? <mark>{x.t}</mark> : x.t)}</For>;
  };

  return (
    <div class="search-panel">
      <div class="search-box">
        <input
          ref={input}
          class="search-input"
          type="search"
          placeholder={props.root ? 'Search in folder' : 'Open a folder to search'}
          disabled={!props.root}
          value={query()}
          spellcheck={false}
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              const first = hits()[0];
              if (first) props.openHit(first);
            } else if (e.key === 'Escape') setQuery('');
          }}
        />
        <button
          class="icon-btn search-opt"
          classList={{ active: opts().caseSensitive }}
          title="Match case"
          aria-pressed={opts().caseSensitive}
          onClick={() => setOpts({ ...opts(), caseSensitive: !opts().caseSensitive })}
        >
          Aa
        </button>
        <button
          class="icon-btn search-opt"
          classList={{ active: opts().wholeWord }}
          title="Whole words"
          aria-pressed={opts().wholeWord}
          onClick={() => setOpts({ ...opts(), wholeWord: !opts().wholeWord })}
        >
          <u>ab</u>
        </button>
      </div>
      <Show
        when={props.root}
        fallback={
          <div class="sidebar-empty">
            <p>Search looks through the Markdown files in the open folder.</p>
            <button class="btn btn-small" onClick={props.openFolder}>
              Open Folder…
            </button>
          </div>
        }
      >
        <div class="search-summary">
          {busy()
            ? 'Searching…'
            : query().trim()
              ? hits().length
                ? `${hits().length >= SEARCH_MAX_HITS ? `${SEARCH_MAX_HITS}+` : hits().length} result${hits().length === 1 ? '' : 's'} in ${groups().length} file${groups().length === 1 ? '' : 's'}`
                : 'No results'
              : ''}
        </div>
        <div class="search-results" role="tree">
          <For each={groups()}>
            {(g) => (
              <div class="search-group">
                <button
                  class="tree-row search-file"
                  title={g.path}
                  onClick={() => setCollapsed({ ...collapsed(), [g.path]: !collapsed()[g.path] })}
                >
                  <span class="tree-twisty" classList={{ open: !collapsed()[g.path] }}>
                    <IconChevron />
                  </span>
                  <span class="tree-icon">
                    <IconFile />
                  </span>
                  <span class="tree-name">{basename(g.path)}</span>
                  <span class="search-dir">{rel(g.path)}</span>
                  <span class="search-count">{g.hits.length}</span>
                </button>
                <Show when={!collapsed()[g.path]}>
                  <For each={g.hits}>
                    {(h) => (
                      <button class="search-hit" title={`Line ${h.line + 1}`} onClick={() => props.openHit(h)}>
                        <Highlighted text={h.text.trim()} />
                      </button>
                    )}
                  </For>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
