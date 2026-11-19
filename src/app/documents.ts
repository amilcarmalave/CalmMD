import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { batch } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Autosaver, type SaveStatus } from '../core/autosave';
import { basename, isWithin, rebase, samePath } from '../core/paths';
import { scrollLineToTop, topLineOf } from '../editor/geometry';
import type { SessionTab } from './session';
import { decodeFromDisk, encodeForDisk, minimalChange, type Eol } from '../core/text';
import { ExternalLoad } from '../editor/extensions';
import type { Platform } from '../platform/types';

export interface DocMeta {
  id: string;
  /** Absolute path, or null for an untitled draft. */
  path: string | null;
  untitledIndex: number;
  status: SaveStatus;
  lastError: string | null;
  eol: Eol;
  bom: boolean;
  /** mtime of the file as we last read or wrote it. */
  mtimeMs: number | null;
  /** The file changed on disk while we had unsaved edits. */
  conflict: boolean;
}

export type ConfirmChoice = 'primary' | 'secondary' | 'cancel';
export interface ConfirmRequest {
  title: string;
  message: string;
  primary: string;
  secondary?: string;
  destructive?: 'primary' | 'secondary';
}
export type ConfirmFn = (req: ConfirmRequest) => Promise<ConfirmChoice>;

export interface DocumentsDeps {
  platform: Platform;
  makeState: (text: string) => EditorState;
  confirm: ConfirmFn;
  notify: (message: string) => void;
  autosaveIdleMs?: number;
  /**
   * Who owns new drafts: "space:<id>" or "window:<label>". Drafts come back only in their owner,
   * so switching Spaces or using several windows never mixes them up.
   */
  draftOwner?: () => string;
  /**
   * Before a document is written to a new location (first save, Save As): may rewrite its text,
   * for example to move pasted images next to the new file. Resolves to the new text or null.
   */
  beforeSaveAs?: (text: string, from: string | null, to: string) => Promise<string | null>;
  /**
   * A file is closing (its tab, or every tab via `takeClosingVersions`): its text when it was
   * opened and now, for file history. Only called when the two differ.
   */
  onClosing?: (path: string, opened: string, current: string) => Promise<void>;
  /**
   * Text is being changed by a tool (MCP), not by keystrokes. Snapshot it for file history
   * before applying the change so an agent edit is always reversible.
   */
  onExternalEdit?: (path: string, before: string, after: string) => Promise<void>;
}

export type WriteMode = 'replace' | 'append' | 'prepend';

const DRAFT_PREFIX = 'draft/';
interface DraftRecord {
  v: 1;
  owner?: string;
  text: string;
  untitledIndex: number;
  /** Set when the draft holds edits that conflicted with a file on disk. */
  path?: string | null;
  updatedAt: number;
}

interface DocRuntime {
  state: EditorState;
  autosaver: Autosaver;
  /** Pixel offset while the app runs (null until the tab has been shown). */
  scrollTop: number | null;
  /** Line at the top of the viewport, which is what survives a restart. */
  topLine: number;
  /** The text as opened (or as last handed to file history). */
  openedText: string;
}

export function docName(d: Pick<DocMeta, 'path' | 'untitledIndex'>): string {
  if (d.path) return basename(d.path);
  return d.untitledIndex > 1 ? `Untitled ${d.untitledIndex}` : 'Untitled';
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type Documents = ReturnType<typeof createDocuments>;

export function createDocuments(deps: DocumentsDeps) {
  const { platform } = deps;
  const [store, setStore] = createStore<{ docs: DocMeta[]; activeId: string | null }>({
    docs: [],
    activeId: null,
  });
  const runtime = new Map<string, DocRuntime>();
  let view: EditorView | null = null;

  const find = (id: string) => store.docs.find((d) => d.id === id);
  const patch = (id: string, p: Partial<DocMeta>) => setStore('docs', (d) => d.id === id, p);
  const textOf = (id: string) => runtime.get(id)?.state.doc.toString() ?? '';
  const draftKey = (id: string) => DRAFT_PREFIX + id;

  function nextUntitledIndex(): number {
    const used = new Set(store.docs.filter((d) => !d.path).map((d) => d.untitledIndex));
    let i = 1;
    while (used.has(i)) i++;
    return i;
  }

  function isPristine(d: DocMeta): boolean {
    return !d.path && textOf(d.id).length === 0;
  }

  async function writeDraft(id: string, path: string | null) {
    const meta = find(id);
    if (!meta) return;
    const record: DraftRecord = {
      v: 1,
      owner: deps.draftOwner?.(),
      text: textOf(id),
      untitledIndex: meta.untitledIndex,
      path,
      updatedAt: Date.now(),
    };
    await platform.kvSet(draftKey(id), JSON.stringify(record));
  }

  /** The autosave target: the file on disk, or the draft store for untitled documents. */
  async function persist(id: string): Promise<void> {
    const meta = find(id);
    if (!meta) return;
    const text = textOf(id);

    if (!meta.path) {
      if (text.length === 0) await platform.kvDelete(draftKey(id));
      else await writeDraft(id, null);
      return;
    }
    if (meta.conflict) {
      // Never overwrite someone else's change. Keep our edits safe until the user decides.
      await writeDraft(id, meta.path);
      return;
    }
    const st = await platform.stat(meta.path);
    if (st && meta.mtimeMs !== null && Math.abs(st.mtimeMs - meta.mtimeMs) > 1) {
      patch(id, { conflict: true });
      await writeDraft(id, meta.path);
      return;
    }
    const { mtimeMs } = await platform.writeTextFile(meta.path, encodeForDisk(text, meta.eol, meta.bom));
    patch(id, { mtimeMs });
  }

  function addDoc(init: {
    id?: string;
    path: string | null;
    text: string;
    eol?: Eol;
    bom?: boolean;
    mtimeMs?: number | null;
    untitledIndex?: number;
    activate?: boolean;
    cursor?: number;
    topLine?: number;
  }): string {
    const id = init.id ?? newId();
    const meta: DocMeta = {
      id,
      path: init.path,
      untitledIndex: init.path ? 0 : (init.untitledIndex ?? nextUntitledIndex()),
      status: 'clean',
      lastError: null,
      eol: init.eol ?? '\n',
      bom: init.bom ?? false,
      mtimeMs: init.mtimeMs ?? null,
      conflict: false,
    };
    const autosaver = new Autosaver({
      save: () => persist(id),
      idleMs: deps.autosaveIdleMs,
      onStatus: (status, error) => patch(id, { status, lastError: error ? errText(error) : null }),
    });
    let state = deps.makeState(init.text);
    if (init.cursor) state = state.update({ selection: { anchor: Math.min(init.cursor, state.doc.length) } }).state;
    runtime.set(id, { state, autosaver, scrollTop: null, topLine: init.topLine ?? 0, openedText: init.text });
    // Insert right after the active tab, like browsers do.
    const at = store.activeId ? store.docs.findIndex((d) => d.id === store.activeId) + 1 : store.docs.length;
    setStore('docs', (docs) => [...docs.slice(0, at), meta, ...docs.slice(at)]);
    if (init.activate !== false) activate(id);
    return id;
  }

  function activate(id: string) {
    const next = runtime.get(id);
    if (!next) return;
    const prevId = store.activeId;
    if (prevId === id) return;
    if (view && prevId) {
      const prev = runtime.get(prevId);
      if (prev) {
        prev.state = view.state;
        prev.scrollTop = view.scrollDOM.scrollTop;
        prev.topLine = topLineOf(view);
      }
    }
    setStore('activeId', id);
    if (view) {
      view.setState(next.state);
      const v = view;
      // Same session: restore the exact pixel offset. After a restart: restore by line,
      // because widths and wrapping may have changed.
      requestAnimationFrame(() => {
        if (next.scrollTop !== null) v.scrollDOM.scrollTop = next.scrollTop;
        else scrollLineToTop(v, next.topLine);
      });
      v.focus();
    }
  }

  /** Swap content (for example after an external change) without counting it as an edit. */
  function replaceContent(id: string, text: string) {
    const r = runtime.get(id);
    if (!r) return;
    const change = minimalChange(r.state.doc.toString(), text);
    if (!change) return;
    if (view && store.activeId === id) {
      view.dispatch({ changes: change, annotations: ExternalLoad.of(true) });
      r.state = view.state;
    } else {
      r.state = r.state.update({ changes: change, annotations: ExternalLoad.of(true) }).state;
    }
  }

  async function openPaths(paths: string[]) {
    for (const path of paths) {
      const existing = store.docs.find((d) => d.path && samePath(d.path, path));
      if (existing) {
        activate(existing.id);
        continue;
      }
      try {
        const { text: raw, mtimeMs } = await platform.readTextFile(path);
        const decoded = decodeFromDisk(raw);
        const lone = store.docs.length === 1 && isPristine(store.docs[0]) ? store.docs[0].id : null;
        addDoc({ path, text: decoded.text, eol: decoded.eol, bom: decoded.bom, mtimeMs });
        if (lone) discard(lone);
      } catch (e) {
        deps.notify(`Couldn't open ${basename(path)}: ${errText(e)}`);
      }
    }
  }

  async function openWithDialog() {
    const paths = await platform.openFileDialog();
    if (paths.length) await openPaths(paths);
  }

  /** A new untitled document, optionally with starting text (guides, templates). */
  function newDoc(text = '') {
    return addDoc({ path: null, text });
  }

  async function save(id = store.activeId): Promise<boolean> {
    if (!id) return false;
    const meta = find(id);
    if (!meta) return false;
    if (!meta.path) return saveAs(id);
    if (meta.conflict) return resolveConflict(id);
    const r = runtime.get(id)!;
    const ok = await r.autosaver.flush();
    if (!ok) deps.notify(`Couldn't save ${docName(meta)}: ${find(id)?.lastError ?? 'unknown error'}`);
    return ok;
  }

  async function saveAs(id = store.activeId): Promise<boolean> {
    if (!id) return false;
    const meta = find(id);
    if (!meta) return false;
    const suggested = meta.path ? basename(meta.path) : suggestFileName(textOf(id), docName(meta));
    const path = await platform.saveFileDialog(suggested);
    if (!path) return false;
    const other = store.docs.find((d) => d.id !== id && d.path && samePath(d.path, path));
    if (other) discard(other.id);
    const wasUntitled = !meta.path;
    const moved = await deps.beforeSaveAs?.(textOf(id), meta.path, path).catch(() => null);
    if (moved != null) replaceContent(id, moved);
    patch(id, { path, mtimeMs: null, conflict: false, untitledIndex: 0 });
    const r = runtime.get(id)!;
    r.autosaver.touch(); // force a write even if nothing changed since the last autosave
    const ok = await r.autosaver.flush();
    if (ok && wasUntitled) await platform.kvDelete(draftKey(id));
    if (!ok) deps.notify(`Couldn't save to ${basename(path)}: ${find(id)?.lastError ?? 'unknown error'}`);
    return ok;
  }

  /** Remove a document without asking. */
  function discard(id: string) {
    const r = runtime.get(id);
    r?.autosaver.dispose();
    runtime.delete(id);
    void platform.kvDelete(draftKey(id));
    const idx = store.docs.findIndex((d) => d.id === id);
    batch(() => {
      setStore('docs', (docs) => docs.filter((d) => d.id !== id));
      if (store.activeId === id) setStore('activeId', null);
    });
    if (store.activeId === null) {
      const next = store.docs[Math.min(idx, store.docs.length - 1)];
      if (next) activate(next.id);
      else newDoc();
    }
  }

  async function close(id = store.activeId): Promise<boolean> {
    if (!id) return false;
    const meta = find(id);
    if (!meta) return false;
    const r = runtime.get(id)!;

    if (!meta.path) {
      if (textOf(id).trim().length > 0) {
        const choice = await deps.confirm({
          title: `Save “${docName(meta)}”?`,
          message: "This draft hasn't been saved to a file yet.",
          primary: 'Save…',
          secondary: "Don't save",
          destructive: 'secondary',
        });
        if (choice === 'cancel') return false;
        if (choice === 'primary' && !(await saveAs(id))) return false;
      }
    } else if (meta.conflict) {
      if (!(await resolveConflict(id))) return false;
    } else if (!(await r.autosaver.flush())) {
      const choice = await deps.confirm({
        title: `Couldn't save “${docName(meta)}”`,
        message: find(id)?.lastError ?? 'The file could not be written.',
        primary: 'Keep open',
        secondary: 'Close anyway',
        destructive: 'secondary',
      });
      if (choice !== 'secondary') return false;
    }
    const closing = find(id);
    const current = textOf(id);
    if (closing?.path && current !== r.openedText) await deps.onClosing?.(closing.path, r.openedText, current).catch(() => undefined);
    discard(id);
    return true;
  }

  /** Every open file whose text changed since it was opened (quitting, switching Spaces); marks them as handed over. */
  async function takeClosingVersions() {
    for (const d of store.docs) {
      const r = runtime.get(d.id);
      if (!d.path || !r) continue;
      const current = d.id === store.activeId && view ? view.state.doc.toString() : r.state.doc.toString();
      if (current === r.openedText) continue;
      const opened = r.openedText;
      r.openedText = current;
      await deps.onClosing?.(d.path, opened, current).catch(() => undefined);
    }
  }

  async function resolveConflict(id: string): Promise<boolean> {
    const meta = find(id);
    if (!meta?.path) return true;
    const choice = await deps.confirm({
      title: `“${docName(meta)}” changed on disk`,
      message: 'Another app changed this file while you had unsaved edits.',
      primary: 'Keep my version',
      secondary: 'Load file from disk',
      destructive: 'secondary',
    });
    if (choice === 'primary') return keepMine(id);
    if (choice === 'secondary') return loadTheirs(id);
    return false;
  }

  async function keepMine(id: string): Promise<boolean> {
    const meta = find(id);
    if (!meta?.path) return false;
    const st = await platform.stat(meta.path);
    patch(id, { conflict: false, mtimeMs: st?.mtimeMs ?? null });
    const r = runtime.get(id)!;
    r.autosaver.touch();
    const ok = await r.autosaver.flush();
    if (ok) await platform.kvDelete(draftKey(id));
    return ok;
  }

  async function loadTheirs(id: string): Promise<boolean> {
    const meta = find(id);
    if (!meta?.path) return false;
    try {
      const { text: raw, mtimeMs } = await platform.readTextFile(meta.path);
      const decoded = decodeFromDisk(raw);
      replaceContent(id, decoded.text);
      runtime.get(id)!.openedText = decoded.text;
      patch(id, { conflict: false, mtimeMs, eol: decoded.eol, bom: decoded.bom });
      runtime.get(id)!.autosaver.markSaved();
      await platform.kvDelete(draftKey(id));
      return true;
    } catch (e) {
      deps.notify(`Couldn't reload ${docName(meta)}: ${errText(e)}`);
      return false;
    }
  }

  /** Called when the window regains focus: reload files that changed underneath us. */
  async function checkExternalChanges() {
    for (const meta of [...store.docs]) {
      if (!meta.path || meta.conflict || meta.mtimeMs === null) continue;
      const r = runtime.get(meta.id);
      if (!r || r.autosaver.status === 'saving') continue;
      const st = await platform.stat(meta.path);
      if (!st || Math.abs(st.mtimeMs - meta.mtimeMs) <= 1) continue;
      if (r.autosaver.isDirty) {
        patch(meta.id, { conflict: true });
      } else {
        await loadTheirs(meta.id);
      }
    }
  }

  async function flushAll(): Promise<boolean> {
    const results = await Promise.all([...runtime.values()].map((r) => r.autosaver.flush()));
    return results.every(Boolean);
  }

  /** Session snapshot: tab order, cursors and scroll lines. */
  function snapshot(): { tabs: SessionTab[]; active: number } {
    const tabs = store.docs.map((d): SessionTab => {
      const r = runtime.get(d.id)!;
      const isActive = d.id === store.activeId && view;
      const state = isActive ? view!.state : r.state;
      const base = { cursor: state.selection.main.head, topLine: isActive ? topLineOf(view!) : r.topLine };
      return d.path ? { path: d.path, ...base } : { draftId: d.id, ...base };
    });
    // Empty untitled tabs aren't worth restoring.
    const keep = tabs.filter((t, i) => t.path || textOf(store.docs[i].id).length > 0);
    const activeTab = tabs[store.docs.findIndex((d) => d.id === store.activeId)];
    return { tabs: keep, active: Math.max(0, keep.indexOf(activeTab)) };
  }

  /** A file or folder was renamed or moved: retarget open documents inside it. */
  function renamePaths(from: string, to: string) {
    for (const d of store.docs) {
      if (d.path && isWithin(d.path, from)) patch(d.id, { path: rebase(d.path, from, to) });
    }
  }

  /**
   * Applies a tool-driven edit to the live document state (not directly to disk), so autosave,
   * conflict detection, drafts and undo all keep working. Opens the file first if needed.
   */
  async function setContentByPath(
    path: string,
    text: string,
    opts: { mode?: WriteMode; flush?: boolean } = {},
  ): Promise<{ id: string; changed: boolean }> {
    let d = store.docs.find((x) => x.path && samePath(x.path, path));
    if (!d) {
      await openPaths([path]);
      d = store.docs.find((x) => x.path && samePath(x.path, path));
    }
    if (!d) throw new Error(`No document open at ${path}`);
    if (d.conflict) throw new Error('This document has a conflict. Resolve it in CalmMD before editing it.');

    const current = textOf(d.id);
    const mode = opts.mode ?? 'replace';
    const next = mode === 'append' ? current + text : mode === 'prepend' ? text + current : text;
    if (next === current) return { id: d.id, changed: false };

    await deps.onExternalEdit?.(path, current, next).catch(() => undefined);
    const change = minimalChange(current, next);
    const r = runtime.get(d.id)!;
    if (change) {
      if (view && store.activeId === d.id) view.dispatch({ changes: change, userEvent: 'input.mcp' });
      else r.state = r.state.update({ changes: change, userEvent: 'input.mcp' }).state;
    }
    r.autosaver.touch();

    if (opts.flush !== false) {
      const ok = await r.autosaver.flush();
      if (!ok || find(d.id)?.conflict) {
        throw new Error(find(d.id)?.lastError || 'The file changed on disk; the edit is kept as a draft.');
      }
    }
    return { id: d.id, changed: true };
  }

  /** A file or folder was moved to the trash: close clean documents inside it, keep edited ones. */
  function closeWithin(path: string) {
    for (const d of [...store.docs]) {
      if (!d.path || !isWithin(d.path, path)) continue;
      const r = runtime.get(d.id)!;
      if (!r.autosaver.isDirty && !d.conflict) discard(d.id);
      else patch(d.id, { mtimeMs: null }); // recreated on the next save
    }
  }

  /**
   * Startup: reopen the last session's tabs in order with their cursors and scroll positions,
   * bring back any leftover drafts (for example after a crash), then open files passed by the OS.
   */
  async function restore(
    launchPaths: string[],
    session?: { tabs: SessionTab[]; active: number },
    opts: {
      /** Whether this window should take in a leftover draft with this owner. */
      adopt?: (owner: string | undefined) => boolean;
    } = {},
  ) {
    const me = deps.draftOwner?.();
    const adopt = opts.adopt ?? ((owner: string | undefined) => owner === undefined || owner === me);
    const keys = await platform.kvList(DRAFT_PREFIX);
    const drafts: { id: string; rec: DraftRecord }[] = [];
    for (const key of keys) {
      try {
        const raw = await platform.kvGet(key);
        if (!raw) continue;
        const rec = JSON.parse(raw) as DraftRecord;
        if (rec.v === 1 && typeof rec.text === 'string') drafts.push({ id: key.slice(DRAFT_PREFIX.length), rec });
      } catch {
        // A corrupt draft shouldn't block startup.
      }
    }
    drafts.sort((a, b) => a.rec.updatedAt - b.rec.updatedAt);
    const draftById = new Map(drafts.map((d) => [d.id, d.rec]));

    const ids: (string | null)[] = [];
    let missing = 0;
    for (const tab of session?.tabs ?? []) {
      const pos = { cursor: tab.cursor, topLine: tab.topLine, activate: false };
      if (tab.draftId) {
        const rec = draftById.get(tab.draftId);
        draftById.delete(tab.draftId);
        ids.push(rec ? addDoc({ id: tab.draftId, path: null, text: rec.text, untitledIndex: rec.untitledIndex || undefined, ...pos }) : null);
      } else if (tab.path && !store.docs.some((d) => d.path && samePath(d.path, tab.path!))) {
        try {
          const { text: raw, mtimeMs } = await platform.readTextFile(tab.path);
          const decoded = decodeFromDisk(raw);
          ids.push(addDoc({ path: tab.path, text: decoded.text, eol: decoded.eol, bom: decoded.bom, mtimeMs, ...pos }));
        } catch {
          missing++;
          ids.push(null);
        }
      } else ids.push(null);
    }
    if (missing) deps.notify(`${missing} file${missing > 1 ? 's' : ''} from your last session couldn't be found`);

    // Drafts not referenced by the session: leftovers from a crash, or recovered conflict edits.
    // Only take those this window owns (or orphans it was asked to adopt).
    for (const [id, rec] of draftById) {
      if (!adopt(rec.owner)) continue;
      addDoc({ id, path: null, text: rec.text, untitledIndex: rec.untitledIndex || undefined, activate: false });
      if (rec.path) deps.notify(`Recovered unsaved edits to ${basename(rec.path)} as a draft`);
    }

    const preferred = session ? ids[session.active] : null;
    const first = preferred ?? ids.find((x) => x) ?? store.docs[0]?.id;
    if (first) activate(first);
    if (launchPaths.length) await openPaths(launchPaths);
    if (store.docs.length === 0) newDoc();
  }

  /**
   * Closes every document without asking and without deleting drafts (used when switching
   * Spaces: the drafts belong to the Space being left and come back with it). Call flushAll first.
   */
  function reset() {
    for (const r of runtime.values()) r.autosaver.dispose();
    runtime.clear();
    batch(() => {
      setStore('docs', []);
      setStore('activeId', null);
    });
  }

  /** Re-writes every untitled draft now, for example after the window's owner (its Space) changed. */
  async function rewriteDrafts() {
    await Promise.all(store.docs.filter((d) => !d.path && textOf(d.id).length > 0).map((d) => writeDraft(d.id, null)));
  }

  return {
    store,
    reset,
    rewriteDrafts,
    attachView(v: EditorView) {
      view = v;
      const id = store.activeId;
      if (id) v.setState(runtime.get(id)!.state);
    },
    /** Keep the stored state in sync with the view (call from the update listener). */
    syncState(id: string, state: EditorState) {
      const r = runtime.get(id);
      if (r) r.state = state;
    },
    touch(id: string) {
      runtime.get(id)?.autosaver.touch();
    },
    textOf,
    activate,
    newDoc,
    openPaths,
    openWithDialog,
    setContentByPath,
    /** Applies a change already written by the Rust workspace, without another save or snapshot. */
    async applyWorkspaceContent(path: string, text: string, mtimeMs: number | null) {
      let d = store.docs.find((x) => x.path && samePath(x.path, path));
      if (!d) {
        await openPaths([path]);
        d = store.docs.find((x) => x.path && samePath(x.path, path));
      }
      if (!d) return;
      // Keep the edit undoable, like the old MCP write path did.
      const r = runtime.get(d.id)!;
      const before = r.state.doc.toString();
      const change = minimalChange(before, text);
      if (change) {
        if (view && store.activeId === d.id) view.dispatch({ changes: change, userEvent: 'input.mcp' });
        else r.state = r.state.update({ changes: change, userEvent: 'input.mcp' }).state;
      }
      r.openedText = text;
      patch(d.id, { mtimeMs, conflict: false, lastError: null });
      r.autosaver.markSaved();
    },
    save,
    saveAs,
    close,
    keepMine,
    loadTheirs,
    checkExternalChanges,
    flushAll,
    takeClosingVersions,
    restore,
    snapshot,
    renamePaths,
    closeWithin,
    /** True while a document has edits that aren't persisted yet. */
    isDirty(id: string) {
      return runtime.get(id)?.autosaver.isDirty ?? false;
    },
  };
}

/** A filename from the first heading or line, for example "Meeting notes.md". */
export function suggestFileName(text: string, fallback: string): string {
  const first = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  const cleaned = first
    .replace(/^#{1,6}\s+/, '')
    .replace(/[*_`~[\]()<>]/g, '')
    .replace(/[\\/:"|?]/g, '-')
    .trim()
    .slice(0, 60)
    .trim();
  return (cleaned || fallback) + '.md';
}
