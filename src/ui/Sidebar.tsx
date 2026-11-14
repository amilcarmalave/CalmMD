import { createEffect, createSignal, For, onMount, Show, type JSX } from 'solid-js';
import type { Explorer, Favorite } from '../app/explorer';
import type { SidebarView } from '../app/session';
import type { Backlink } from '../core/noteLinks';
import type { Heading } from '../core/outline';
import { basename, dirname, isWithin, samePath, stem } from '../core/paths';
import type { DirEntry } from '../platform/types';
import type { MenuItem } from './ContextMenu';
import { IconCaret, IconUp } from './icons';
import { IconChevron, IconFile, IconFolder, IconPlusFile, IconPlusFolder, IconStar } from './sidebarIcons';

export interface SidebarProps {
  view: SidebarView;
  setView: (v: SidebarView) => void;
  width: number;
  explorer: Explorer;
  activePath: string | null;
  openFile: (path: string) => void;
  /** Read-only preview of any file (Space). */
  quickView: (path: string) => void;
  openMenu: (e: MouseEvent, items: MenuItem[]) => void;
  revealLabel: string;
  reveal: (path: string) => void;
  copyPath: (path: string) => void;
  headings: Heading[];
  activeHeading: number;
  onHeading: (h: Heading) => void;
  /** Opens a menu under an element. */
  openMenuAt: (x: number, y: number, items: MenuItem[]) => void;
  /** The Space this window holds, if any. */
  spaceName: string | null;
  /** Everything the Space switcher offers (switch, save, rename, …). */
  spaceMenu: () => MenuItem[];
  recentSpaces: { id: string; name: string }[];
  onOpenSpace: (id: string) => void;
  /** Notes linking to the active one; null when there's nothing to scan (no folder or untitled). */
  backlinks: Backlink[] | null;
  onBacklink: (b: Backlink) => void;
  /** The Search tab's content (built by the app, which owns the search). */
  searchPanel: JSX.Element;
  /** The History tab's content (versions of the active file). */
  historyPanel: JSX.Element;
}

/** Opens a menu just below the element that was clicked. */
const menuBelow = (props: SidebarProps, e: MouseEvent, items: MenuItem[]) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  props.openMenuAt(r.left, r.bottom + 4, items);
};

export function Sidebar(props: SidebarProps) {
  return (
    <aside class="sidebar" style={{ width: `${props.width}px` }} aria-label="Sidebar">
      <button
        class="space-switcher"
        classList={{ loose: !props.spaceName }}
        title={props.spaceName ? 'Switch or manage Spaces' : 'Spaces remember a folder, its tabs and the layout'}
        onClick={(e) => menuBelow(props, e, props.spaceMenu())}
        onContextMenu={(e) => props.openMenu(e, props.spaceMenu())}
      >
        <span class="space-dot" />
        <span class="space-label">{props.spaceName ?? 'No Space'}</span>
        <span class="space-caret">
          <IconCaret />
        </span>
      </button>
      <div class="sidebar-head">
        <div class="segmented segmented-text" role="tablist">
          <button role="tab" aria-selected={props.view === 'files'} classList={{ active: props.view === 'files' }} onClick={() => props.setView('files')}>
            Files
          </button>
          <button role="tab" aria-selected={props.view === 'outline'} classList={{ active: props.view === 'outline' }} onClick={() => props.setView('outline')}>
            Outline
          </button>
          <button role="tab" aria-selected={props.view === 'search'} classList={{ active: props.view === 'search' }} onClick={() => props.setView('search')}>
            Search
          </button>
          <button role="tab" aria-selected={props.view === 'history'} classList={{ active: props.view === 'history' }} onClick={() => props.setView('history')}>
            History
          </button>
        </div>
      </div>
      <div class="sidebar-body">
        {/* Kept mounted (hidden) so the query and results survive switching tabs. */}
        <div class="search-host" classList={{ hidden: props.view !== 'search' }}>
          {props.searchPanel}
        </div>
        <Show when={props.view === 'files'}>
          <Files {...props} />
        </Show>
        <Show when={props.view === 'outline'}>
          <Outline {...props} />
        </Show>
        <Show when={props.view === 'history'}>{props.historyPanel}</Show>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- Files

function Files(props: SidebarProps) {
  const ex = props.explorer;
  const st = ex.state;

  const itemMenu = (path: string, isDir: boolean): MenuItem[] => {
    const parent = isDir ? path : path.replace(/[\\/][^\\/]*$/, '');
    return [
      ...(isDir
        ? [
            { label: 'New File', action: () => ex.setEditing({ kind: 'new-file', dir: path }) },
            { label: 'New Folder', action: () => ex.setEditing({ kind: 'new-folder', dir: path }) },
            'separator' as const,
            { label: 'Open as Root Folder', action: () => ex.setRoot(path) },
          ]
        : [{ label: 'Open', action: () => props.openFile(path) }, { label: 'Quick View', hint: 'Space', action: () => props.quickView(path) }, { label: 'New File Here', action: () => ex.setEditing({ kind: 'new-file', dir: parent }) }, 'separator' as const]),
      { label: ex.isFavorite(path) ? 'Remove from Favorites' : 'Add to Favorites', action: () => ex.toggleFavorite(path, isDir) },
      { label: 'Rename…', hint: 'F2', action: () => ex.setEditing({ kind: 'rename', path, isDir }) },
      { label: props.revealLabel, action: () => props.reveal(path) },
      { label: 'Copy Path', action: () => props.copyPath(path) },
      'separator',
      { label: 'Move to Trash', danger: true, action: () => ex.trash(path, isDir) },
    ];
  };

  const [favOpen, setFavOpen] = createSignal(true);

  /** The folder switcher: open another folder, recent folders, go up, close. */
  const folderMenu = (): MenuItem[] => {
    const root = st.root;
    const recent = st.recent.filter((p) => !root || !samePath(p, root));
    const parent = root ? dirname(root) : '';
    return [
      { label: 'Open Folder…', action: () => ex.openFolderDialog() },
      ...(recent.length
        ? [
            { heading: 'Recent folders' } as MenuItem,
            ...recent.slice(0, 8).map((p): MenuItem => ({ label: basename(p) || p, detail: dirname(p), action: () => ex.setRoot(p) })),
          ]
        : []),
      ...(root
        ? [
            'separator' as const,
            ...(parent && !samePath(parent, root) ? [{ label: `Go Up to “${basename(parent) || parent}”`, action: () => ex.openParent() }] : []),
            { label: ex.isFavorite(root) ? 'Remove from Favorites' : 'Add to Favorites', action: () => ex.toggleFavorite(root, true) },
            { label: props.revealLabel, action: () => props.reveal(root) },
            { label: st.showAllFiles ? 'Show Notes Only' : 'Show All Files', action: () => ex.setShowAllFiles(!st.showAllFiles) },
            { label: 'Refresh', action: () => ex.refresh() },
            'separator' as const,
            { label: 'Close Folder', action: () => ex.setRoot(null) },
          ]
        : []),
      ...(recent.length ? ['separator' as const, { label: 'Clear Recent Folders', action: () => ex.forgetRecent() }] : []),
    ];
  };

  return (
    <div class="files" onKeyDown={(e) => onTreeKey(e, ex)}>
      <section class="tree-section">
        <button class="section-title section-toggle" aria-expanded={favOpen()} onClick={() => setFavOpen(!favOpen())}>
          <span class="tree-twisty" classList={{ open: favOpen() }}>
            <IconChevron />
          </span>
          Favorites
        </button>
        <Show when={favOpen()}>
          <Show when={st.favorites.length > 0} fallback={<div class="tree-hint">Star a file or folder to keep it here.</div>}>
            <div role="tree">
              <For each={st.favorites}>{(fav) => <FavoriteRow {...props} fav={fav} itemMenu={itemMenu} />}</For>
            </div>
          </Show>
        </Show>
      </section>

      <Show
        when={st.root}
        fallback={
          <div class="sidebar-empty">
            <p>No folder open.</p>
            <button class="btn btn-small" onClick={() => void ex.openFolderDialog()}>
              Open Folder…
            </button>
            <Show when={st.recent.length > 0}>
              <div class="recent-list">
                <h3 class="section-title">Recent folders</h3>
                <For each={st.recent.slice(0, 8)}>
                  {(p) => (
                    <button class="tree-row recent-row" title={p} onClick={() => void ex.setRoot(p)}>
                      <span class="tree-icon">
                        <IconFolder />
                      </span>
                      <span class="tree-name">{basename(p) || p}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={props.recentSpaces.length > 0}>
              <div class="recent-list">
                <h3 class="section-title">Spaces</h3>
                <For each={props.recentSpaces.slice(0, 6)}>
                  {(s) => (
                    <button class="tree-row recent-row" onClick={() => props.onOpenSpace(s.id)}>
                      <span class="space-dot" />
                      <span class="tree-name">{s.name}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        }
      >
        {(root) => (
          <section class="tree-section">
            <div class="section-title section-title-row" onContextMenu={(e) => props.openMenu(e, folderMenu())}>
              <button class="folder-switcher" title={`${root()}\nClick to open another folder`} onClick={(e) => menuBelow(props, e, folderMenu())}>
                <span class="section-name">{basename(root()) || root()}</span>
                <IconCaret />
              </button>
              <span class="section-actions">
                <button class="icon-btn" title="Go up a folder" aria-label="Go up a folder" onClick={() => void ex.openParent()}>
                  <IconUp />
                </button>
                <button class="icon-btn" title="New file" aria-label="New file" onClick={() => ex.setEditing({ kind: 'new-file', dir: root() })}>
                  <IconPlusFile />
                </button>
                <button class="icon-btn" title="New folder" aria-label="New folder" onClick={() => ex.setEditing({ kind: 'new-folder', dir: root() })}>
                  <IconPlusFolder />
                </button>
              </span>
            </div>
            <div role="tree">
              <DirChildren {...props} dir={root()} depth={0} itemMenu={itemMenu} />
            </div>
          </section>
        )}
      </Show>
    </div>
  );
}

type RowProps = SidebarProps & {
  itemMenu: (path: string, isDir: boolean) => MenuItem[];
  /**
   * True for rows under Favorites that also appear in the main tree. Only one copy may host
   * an inline editor, or the two inputs steal focus from each other.
   */
  mirror?: boolean;
};

function FavoriteRow(props: RowProps & { fav: Favorite }) {
  const ex = props.explorer;
  const open = () => !!ex.state.expanded[props.fav.path];
  const mirror = () => !!ex.state.root && isWithin(props.fav.path, ex.state.root);
  return (
    <>
      <Row {...props}
        mirror={mirror()}
        name={basename(props.fav.path)}
        path={props.fav.path}
        isDir={props.fav.isDir}
        depth={0}
        open={open()}
        favorite
       />
      <Show when={props.fav.isDir && open()}>
        <DirChildren {...props} mirror={mirror()} dir={props.fav.path} depth={1} />
      </Show>
    </>
  );
}

function DirChildren(props: RowProps & { dir: string; depth: number }) {
  const ex = props.explorer;
  const entries = () => ex.visible(ex.state.entries[props.dir] ?? []);
  const editingHere = () => {
    const e = ex.state.editing;
    return !props.mirror && e && e.kind !== 'rename' && samePath(e.dir, props.dir) ? e : null;
  };
  // Expand the folder that's receiving a new item.
  createEffect(() => {
    if (editingHere() && !ex.state.expanded[props.dir]) void ex.toggle(props.dir, true);
  });
  return (
    <>
      <Show when={editingHere()}>
        {(e) => (
          <div class="tree-row editing" style={{ '--depth': props.depth }}>
            <span class="tree-twisty" />
            <span class="tree-icon">{e().kind === 'new-folder' ? <IconFolder /> : <IconFile />}</span>
            <NameInput
              initial=""
              placeholder={e().kind === 'new-folder' ? 'Folder name' : 'File name'}
              onDone={(name) => {
                // Read the accessor before clearing state: <Show> forbids stale reads afterwards.
                const kind = e().kind === 'new-folder' ? 'folder' : 'file';
                ex.setEditing(null);
                if (name) void ex.create(props.dir, name, kind);
              }}
            />
          </div>
        )}
      </Show>
      <For each={entries()}>{(entry) => <EntryRow {...props} entry={entry} depth={props.depth}  />}</For>
      <Show when={ex.state.entries[props.dir] && entries().length === 0 && !editingHere()}>
        <div class="tree-row tree-empty" style={{ '--depth': props.depth }}>
          <span class="tree-twisty" />
          Empty
        </div>
      </Show>
    </>
  );
}

function EntryRow(props: RowProps & { entry: DirEntry; depth: number }) {
  const ex = props.explorer;
  const open = () => !!ex.state.expanded[props.entry.path];
  return (
    <>
      <Row {...props} name={props.entry.name} path={props.entry.path} isDir={props.entry.isDir} depth={props.depth} open={open()}  />
      <Show when={props.entry.isDir && open()}>
        <DirChildren {...props} dir={props.entry.path} depth={props.depth + 1}  />
      </Show>
    </>
  );
}

function Row(props: RowProps & { name: string; path: string; isDir: boolean; depth: number; open: boolean; favorite?: boolean }) {
  const ex = props.explorer;
  const renaming = () => {
    const e = ex.state.editing;
    return e?.kind === 'rename' && samePath(e.path, props.path) && !props.mirror;
  };
  const active = () => !props.isDir && !!props.activePath && samePath(props.activePath, props.path);
  const activate = () => (props.isDir ? void ex.toggle(props.path) : props.openFile(props.path));

  return (
    <div
      class="tree-row"
      classList={{ active: active(), dir: props.isDir, 'is-markdown': !props.isDir && /\.(md|markdown|mdx|txt)$/i.test(props.name) }}
      style={{ '--depth': props.depth }}
      role="treeitem"
      aria-expanded={props.isDir ? props.open : undefined}
      aria-selected={active()}
      tabIndex={0}
      data-path={props.path}
      data-dir={props.isDir ? '1' : undefined}
      title={props.path}
      onClick={() => !renaming() && activate()}
      onKeyDown={(e) => {
        if (renaming()) return;
        if (e.key === ' ' && !props.isDir) {
          e.preventDefault();
          props.quickView(props.path);
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        } else if (e.key === 'F2') {
          e.preventDefault();
          ex.setEditing({ kind: 'rename', path: props.path, isDir: props.isDir });
        } else if (e.key === 'ArrowRight' && props.isDir && !props.open) void ex.toggle(props.path, true);
        else if (e.key === 'ArrowLeft' && props.isDir && props.open) void ex.toggle(props.path, false);
        else if (e.key === 'Delete') void ex.trash(props.path, props.isDir);
        else return;
        e.stopPropagation();
      }}
      onContextMenu={(e) => props.openMenu(e, props.itemMenu(props.path, props.isDir))}
    >
      <span class="tree-twisty" classList={{ open: props.open }}>
        {props.isDir && <IconChevron />}
      </span>
      <span class="tree-icon">{props.favorite ? <IconStar filled /> : props.isDir ? <IconFolder /> : <IconFile />}</span>
      <Show when={renaming()} fallback={<span class="tree-name">{props.name}</span>}>
        <NameInput
          initial={props.name}
          selectStem={!props.isDir}
          onDone={(name) => {
            ex.setEditing(null);
            if (name) void ex.rename(props.path, name);
          }}
        />
      </Show>
      <Show when={!renaming()}>
        <button
          class="row-star"
          classList={{ on: ex.isFavorite(props.path) }}
          tabIndex={-1}
          title={ex.isFavorite(props.path) ? 'Remove from Favorites' : 'Add to Favorites'}
          aria-label={ex.isFavorite(props.path) ? 'Remove from Favorites' : 'Add to Favorites'}
          onClick={(e) => {
            e.stopPropagation();
            void ex.toggleFavorite(props.path, props.isDir);
          }}
        >
          <IconStar filled={ex.isFavorite(props.path)} />
        </button>
      </Show>
    </div>
  );
}

function NameInput(props: { initial: string; placeholder?: string; selectStem?: boolean; onDone: (name: string | null) => void }) {
  let input!: HTMLInputElement;
  let done = false;
  const finish = (value: string | null) => {
    if (done) return;
    done = true;
    props.onDone(value && value.trim() ? value : null);
  };
  onMount(() => {
    input.focus();
    if (props.selectStem && props.initial) input.setSelectionRange(0, stem(props.initial).length);
    else input.select();
  });
  return (
    <input
      ref={input}
      class="tree-input"
      value={props.initial}
      placeholder={props.placeholder}
      spellcheck={false}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(input.value);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(input.value === props.initial ? null : input.value)}
    />
  );
}

/** Up/Down moves between visible rows. */
function onTreeKey(e: KeyboardEvent, _ex: Explorer) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const rows = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.tree-row[tabindex]')];
  const i = rows.indexOf(document.activeElement as HTMLElement);
  const next = rows[e.key === 'ArrowDown' ? i + 1 : i - 1] ?? rows[e.key === 'ArrowDown' ? 0 : rows.length - 1];
  next?.focus();
  e.preventDefault();
}

// ---------------------------------------------------------------- Outline

function Outline(props: SidebarProps) {
  let list!: HTMLDivElement;
  const minLevel = () => Math.min(6, ...props.headings.map((h) => h.level));
  // Keep the current section visible as you move through the document.
  createEffect(() => {
    const i = props.activeHeading;
    queueMicrotask(() => list?.querySelector<HTMLElement>(`[data-index="${i}"]`)?.scrollIntoView({ block: 'nearest' }));
  });
  return (
    <>
    <Show
      when={props.headings.length > 0}
      fallback={
        <div class="sidebar-empty">
          <p>No headings yet.</p>
          <p class="sidebar-hint">Start a line with # to add one.</p>
        </div>
      }
    >
      <div class="outline" ref={list} role="tree">
        <For each={props.headings}>
          {(h, i): JSX.Element => (
            <button
              class="outline-item"
              classList={{ active: i() === props.activeHeading }}
              data-index={i()}
              data-level={h.level}
              style={{ '--depth': h.level - minLevel() }}
              title={h.text}
              onClick={() => props.onHeading(h)}
            >
              {h.text || <span class="outline-empty">Untitled section</span>}
            </button>
          )}
        </For>
      </div>
    </Show>
    <Backlinks {...props} />
    </>
  );
}

/** Notes in the open folder that link to this one (relative links or [[wiki links]]). */
function Backlinks(props: SidebarProps) {
  return (
    <Show when={props.backlinks}>
      {(b) => (
        <section class="tree-section backlinks">
          <h3 class="section-title">Linked from</h3>
          <Show when={b().length > 0} fallback={<div class="tree-hint">No notes in this folder link here yet. Type [[ to link one.</div>}>
            <For each={b()}>
              {(link) => (
                <button class="backlink" title={link.path} onClick={() => props.onBacklink(link)}>
                  <span class="backlink-name">{stem(link.path)}</span>
                  <span class="backlink-text">{link.text}</span>
                </button>
              )}
            </For>
          </Show>
        </section>
      )}
    </Show>
  );
}
