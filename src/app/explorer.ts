import { batch } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { isDrawingPath } from '../core/drawings';
import { basename, dirname, isMarkdownPath, isWithin, joinPath, rebase, samePath } from '../core/paths';
import type { DirEntry, Platform } from '../platform/types';
import type { ConfirmFn } from './documents';

export interface Favorite {
  path: string;
  isDir: boolean;
}

/** Inline editing state for new files/folders and renames. */
export type Editing =
  | { kind: 'new-file' | 'new-folder'; dir: string }
  | { kind: 'rename'; path: string; isDir: boolean }
  | null;

export interface ExplorerDeps {
  platform: Platform;
  confirm: ConfirmFn;
  notify: (msg: string) => void;
  /** Hooks into open documents. */
  onRenamed: (from: string, to: string) => void | Promise<void>;
  onTrashed: (path: string) => void;
  openFile: (path: string) => void;
  /** Called when the user switches between all files and notes only (the app persists it). */
  onShowAllFiles?: (on: boolean) => void;
}

const FAVORITES_KEY = 'favorites';
const RECENT_KEY = 'recent-folders';
export const RECENT_MAX = 10;

/** Most recent first, no duplicates (case-insensitive on Windows-style paths), capped. */
export function pushRecent(list: string[], path: string, max = RECENT_MAX): string[] {
  return [path, ...list.filter((p) => !samePath(p, path))].slice(0, max);
}
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Rejects names the common file systems can't store. Returns an error message or null. */
export function validateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter a name.';
  if (n === '.' || n === '..') return 'That name is reserved.';
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(n)) return 'Names can’t contain \\ / : * ? " < > |';
  if (/[. ]$/.test(n)) return 'Names can’t end with a dot or space.';
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(n)) return 'That name is reserved on Windows.';
  return null;
}

/** New files get ".md" unless the user typed an extension. */
export function withMarkdownExt(name: string): string {
  const n = name.trim();
  return /\.[^./\\]+$/.test(n) ? n : n + '.md';
}

export type Explorer = ReturnType<typeof createExplorer>;

export function createExplorer(deps: ExplorerDeps) {
  const { platform } = deps;
  const [state, setState] = createStore<{
    root: string | null;
    /** Loaded folder listings, keyed by folder path. */
    entries: Record<string, DirEntry[]>;
    expanded: Record<string, boolean>;
    favorites: Favorite[];
    editing: Editing;
    showAllFiles: boolean;
    /** Recently opened root folders (all windows), most recent first. */
    recent: string[];
  }>({ root: null, entries: {}, expanded: {}, favorites: [], editing: null, showAllFiles: true, recent: [] });

  let fileCache: { root: string; files: Promise<string[]> } | null = null;

  /** Markdown files and folders by default. Other files only when asked. */
  const visible = (entries: DirEntry[]) =>
    state.showAllFiles ? entries : entries.filter((e) => e.isDir || isMarkdownPath(e.name) || isDrawingPath(e.name));

  async function load(dir: string) {
    try {
      const list = await platform.listDir(dir);
      setState('entries', dir, list);
    } catch (e) {
      setState('entries', dir, []);
      if (state.root && samePath(dir, state.root)) deps.notify(`Couldn't open folder: ${errText(e)}`);
    }
  }

  async function setRoot(root: string | null, expanded: string[] = []) {
    batch(() => {
      setState('root', root);
      setState('entries', reconcile({}));
      setState('expanded', reconcile(Object.fromEntries(expanded.map((p) => [p, true]))));
    });
    if (!root) return;
    void rememberRecent(root);
    await load(root);
    await Promise.all(expanded.filter((p) => isWithin(p, root)).map(load));
  }

  async function openFolderDialog() {
    const dir = await platform.openFolderDialog();
    if (dir) await setRoot(dir);
  }

  /** Opens the folder above the current root, keeping the current one expanded. */
  async function openParent() {
    const root = state.root;
    if (!root) return;
    const parent = dirname(root);
    if (!parent || samePath(parent, root)) return deps.notify('This is already the top folder');
    const keep = [root, ...Object.keys(unwrap(state.expanded)).filter((p) => state.expanded[p])];
    await setRoot(parent, keep);
  }

  // ---------- Recent folders ----------
  async function loadRecent() {
    try {
      const raw = await platform.kvGet(RECENT_KEY);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      setState('recent', Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string').slice(0, RECENT_MAX) : []);
    } catch {
      setState('recent', []);
    }
  }
  async function rememberRecent(path: string) {
    setState('recent', pushRecent([...state.recent], path));
    await platform.kvSet(RECENT_KEY, JSON.stringify(unwrap(state.recent)));
    platform.broadcast('recent-folders');
  }
  async function forgetRecent(path?: string) {
    setState('recent', path ? state.recent.filter((p) => !samePath(p, path)) : []);
    await platform.kvSet(RECENT_KEY, JSON.stringify(unwrap(state.recent)));
    platform.broadcast('recent-folders');
  }
  platform.onBroadcast('recent-folders', () => void loadRecent());

  async function toggle(dir: string, open = !state.expanded[dir]) {
    setState('expanded', dir, open);
    if (open && !state.entries[dir]) await load(dir);
  }

  /** Reloads every loaded folder (for example on window focus or after an operation). */
  async function refresh() {
    fileCache = null;
    const dirs = Object.keys(unwrap(state.entries));
    await Promise.all(dirs.map(load));
  }

  /** Reloads one folder if it's loaded, however its path is spelled (a save dialog's path, say). */
  async function refreshDir(dir: string) {
    const key = Object.keys(unwrap(state.entries)).find((k) => samePath(k, dir));
    if (key) {
      fileCache = null;
      await load(key);
    }
  }

  // ---------- Favorites ----------
  async function loadFavorites() {
    void loadRecent();
    try {
      const raw = await platform.kvGet(FAVORITES_KEY);
      const list = raw ? (JSON.parse(raw) as Favorite[]) : [];
      setState('favorites', Array.isArray(list) ? list.filter((f) => typeof f?.path === 'string') : []);
    } catch {
      setState('favorites', []);
    }
  }
  // Favorites are shared by all windows.
  const saveFavorites = async () => {
    await platform.kvSet(FAVORITES_KEY, JSON.stringify(unwrap(state.favorites)));
    platform.broadcast('favorites');
  };
  platform.onBroadcast('favorites', () => void loadFavorites());

  const isFavorite = (path: string) => state.favorites.some((f) => samePath(f.path, path));

  async function toggleFavorite(path: string, isDir: boolean) {
    if (isFavorite(path)) setState('favorites', (f) => f.filter((x) => !samePath(x.path, path)));
    else {
      setState('favorites', (f) => [...f, { path, isDir }]);
      if (isDir) await toggle(path, true);
    }
    await saveFavorites();
  }

  function moveFavorite(from: number, to: number) {
    setState(
      'favorites',
      produce((f) => {
        const [item] = f.splice(from, 1);
        f.splice(to, 0, item);
      }),
    );
    void saveFavorites();
  }

  // ---------- File operations ----------
  async function create(dir: string, rawName: string, kind: 'file' | 'folder'): Promise<string | null> {
    const name = kind === 'file' ? withMarkdownExt(rawName) : rawName.trim();
    const err = validateName(name);
    if (err) {
      deps.notify(err);
      return null;
    }
    const path = joinPath(dir, name);
    try {
      if (kind === 'file') await platform.createFile(path);
      else await platform.createDir(path);
    } catch (e) {
      deps.notify(errText(e));
      return null;
    }
    setState('expanded', dir, true);
    await load(dir);
    fileCache = null;
    if (kind === 'file') deps.openFile(path);
    return path;
  }

  async function rename(path: string, rawName: string): Promise<string | null> {
    const name = rawName.trim();
    if (name === basename(path)) return path;
    const err = validateName(name);
    if (err) {
      deps.notify(err);
      return null;
    }
    const to = joinPath(dirname(path), name);
    try {
      await platform.renamePath(path, to);
    } catch (e) {
      deps.notify(errText(e));
      return null;
    }
    fileCache = null;
    await deps.onRenamed(path, to);
    retarget(path, to);
    await load(dirname(path));
    return to;
  }

  async function move(path: string, dir: string, rawName?: string): Promise<string | null> {
    const name = rawName?.trim() || basename(path);
    const to = joinPath(dir, name);
    if (samePath(path, to)) return path;
    const err = validateName(name);
    if (err) {
      deps.notify(err);
      return null;
    }
    try {
      await platform.renamePath(path, to);
    } catch (e) {
      deps.notify(errText(e));
      return null;
    }
    fileCache = null;
    await deps.onRenamed(path, to);
    retarget(path, to);
    await load(dirname(path));
    if (!samePath(dir, dirname(path))) await load(dir);
    return to;
  }

  /** Keeps expanded folders, favorites and the root pointing at renamed paths. */
  function retarget(from: string, to: string) {
    batch(() => {
      const expanded = unwrap(state.expanded);
      const next: Record<string, boolean> = {};
      for (const [p, open] of Object.entries(expanded)) next[isWithin(p, from) ? rebase(p, from, to) : p] = open;
      setState('expanded', reconcile(next));
      const entries = { ...unwrap(state.entries) };
      for (const key of Object.keys(entries)) if (isWithin(key, from)) delete entries[key];
      setState('entries', reconcile(entries));
      let favChanged = false;
      setState('favorites', (f) =>
        f.map((x) => {
          if (!isWithin(x.path, from)) return x;
          favChanged = true;
          return { ...x, path: rebase(x.path, from, to) };
        }),
      );
      if (favChanged) void saveFavorites();
      if (state.root && isWithin(state.root, from)) setState('root', rebase(state.root, from, to));
    });
    for (const p of Object.keys(unwrap(state.expanded))) if (state.expanded[p] && isWithin(p, to)) void load(p);
  }

  /** MCP callers pass `confirmed` themselves; UI callers still show the confirmation dialog. */
  async function trash(path: string, isDir: boolean, confirmed = false): Promise<boolean> {
    if (!confirmed) {
      const choice = await deps.confirm({
        title: `Move “${basename(path)}” to the trash?`,
        message: isDir ? 'The folder and everything in it will be moved to the trash.' : 'You can restore it from the trash.',
        primary: 'Move to Trash',
        destructive: 'primary',
      });
      if (choice !== 'primary') return false;
    }
    try {
      await platform.trashPath(path);
    } catch (e) {
      deps.notify(`Couldn't move to trash: ${errText(e)}`);
      return false;
    }
    fileCache = null;
    deps.onTrashed(path);
    if (isFavorite(path)) await toggleFavorite(path, isDir);
    await load(dirname(path));
    return true;
  }

  /** Every Markdown file under the root (for Go to File). Capped, cached until refresh. */
  async function allFiles(): Promise<string[]> {
    return (await everyFile()).filter((p) => isMarkdownPath(p));
  }

  /** Every file under the root, notes or not (for links to pictures, PDFs and drawings). */
  function everyFile(limit = 5000): Promise<string[]> {
    const root = state.root;
    if (!root) return Promise.resolve([]);
    if (fileCache?.root === root) return fileCache.files;
    const files = (async () => {
      const out: string[] = [];
      const queue = [root];
      while (queue.length && out.length < limit) {
        const dir = queue.shift()!;
        let list: DirEntry[];
        try {
          list = await platform.listDir(dir);
        } catch {
          continue;
        }
        for (const e of list) {
          if (e.isDir) queue.push(e.path);
          else out.push(e.path);
        }
      }
      return out;
    })();
    fileCache = { root, files };
    return files;
  }

  return {
    state,
    visible,
    allFiles,
    everyFile,
    invalidateFiles: () => (fileCache = null),
    setRoot,
    openFolderDialog,
    openParent,
    forgetRecent,
    toggle,
    refresh,
    refreshDir,
    load,
    loadFavorites,
    isFavorite,
    toggleFavorite,
    moveFavorite,
    create,
    rename,
    move,
    trash,
    setEditing: (e: Editing) => setState('editing', e),
    setShowAllFiles: (on: boolean) => {
      setState('showAllFiles', on);
      deps.onShowAllFiles?.(on);
    },
    expandedList: () =>
      Object.entries(unwrap(state.expanded))
        .filter(([, open]) => open)
        .map(([p]) => p),
  };
}
