import { EditorState } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { createDocuments, suggestFileName, type ConfirmChoice } from './documents';

function setup(files: Record<string, string> = {}, opts: { confirm?: ConfirmChoice; savePath?: string | null } = {}) {
  const platform = createMemoryPlatform({ files, pickSave: async () => opts.savePath ?? null });
  const notify = vi.fn();
  const docs = createDocuments({
    platform,
    makeState: (text) => EditorState.create({ doc: text }),
    confirm: async () => opts.confirm ?? 'cancel',
    notify,
    autosaveIdleMs: 10,
  });
  /** Simulate typing at the end of a document (no view attached in tests). */
  const type = (id: string, insert: string) => {
    const state = EditorState.create({ doc: docs.textOf(id) + insert });
    docs.syncState(id, state);
    docs.touch(id);
  };
  return { platform, docs, notify, type };
}

describe('documents', () => {
  it('starts with one empty untitled document', async () => {
    const { docs } = setup();
    await docs.restore([]);
    expect(docs.store.docs).toHaveLength(1);
    expect(docs.store.docs[0].path).toBeNull();
  });

  it('opening a file replaces the pristine untitled document', async () => {
    const { docs } = setup({ '/a.md': '# A' });
    await docs.restore([]);
    await docs.openPaths(['/a.md']);
    expect(docs.store.docs.map((d) => d.path)).toEqual(['/a.md']);
  });

  it('opening the same file twice focuses the existing tab', async () => {
    const { docs } = setup({ '/a.md': 'a', '/b.md': 'b' });
    await docs.openPaths(['/a.md', '/b.md', '/a.md']);
    expect(docs.store.docs).toHaveLength(2);
    expect(docs.store.docs.find((d) => d.id === docs.store.activeId)?.path).toBe('/a.md');
  });

  it('autosaves edits and preserves CRLF line endings and BOM', async () => {
    const { docs, platform, type } = setup({ '/w.md': '﻿one\r\ntwo\r\n' });
    await docs.openPaths(['/w.md']);
    const id = docs.store.activeId!;
    expect(docs.textOf(id)).toBe('one\ntwo\n');
    type(id, 'three\n');
    expect(await docs.save(id)).toBe(true);
    expect(platform.files()['/w.md']).toBe('﻿one\r\ntwo\r\nthree\r\n');
  });

  it('reloads a clean document silently when the file changes on disk', async () => {
    const { docs, platform } = setup({ '/c.md': 'old' });
    await docs.openPaths(['/c.md']);
    const id = docs.store.activeId!;
    platform.externalWrite('/c.md', 'new from another app');
    await docs.checkExternalChanges();
    expect(docs.textOf(id)).toBe('new from another app');
    expect(docs.store.docs[0].conflict).toBe(false);
  });

  it('never overwrites an external change when there are unsaved edits', async () => {
    const { docs, platform, type } = setup({ '/c.md': 'base' });
    await docs.openPaths(['/c.md']);
    const id = docs.store.activeId!;
    type(id, ' mine');
    platform.externalWrite('/c.md', 'theirs');
    await docs.checkExternalChanges();
    expect(docs.store.docs[0].conflict).toBe(true);
    await new Promise((r) => setTimeout(r, 30)); // let autosave run
    expect(platform.files()['/c.md']).toBe('theirs');
    // Our edits are kept safe in a draft.
    expect(await platform.kvList('draft/')).toHaveLength(1);

    expect(await docs.keepMine(id)).toBe(true);
    expect(platform.files()['/c.md']).toBe('base mine');
    expect(await platform.kvList('draft/')).toHaveLength(0);
  });

  it('detects a conflict at save time even without a focus check', async () => {
    const { docs, platform, type } = setup({ '/d.md': 'base' });
    await docs.openPaths(['/d.md']);
    const id = docs.store.activeId!;
    platform.externalWrite('/d.md', 'theirs');
    type(id, '!');
    await docs.save(id); // conflicted -> confirm returns cancel -> nothing written
    await new Promise((r) => setTimeout(r, 30));
    expect(platform.files()['/d.md']).toBe('theirs');
    expect(docs.store.docs[0].conflict).toBe(true);
  });

  it('keeps untitled drafts across restarts', async () => {
    const storage = new Map<string, string>();
    const backing = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
      key: (i: number) => [...storage.keys()][i] ?? null,
      get length() {
        return storage.size;
      },
    };
    const mk = () =>
      createDocuments({
        platform: createMemoryPlatform({ storage: backing }),
        makeState: (text) => EditorState.create({ doc: text }),
        confirm: async () => 'cancel',
        notify: () => {},
        autosaveIdleMs: 10,
      });

    const first = mk();
    await first.restore([]);
    const id = first.store.activeId!;
    first.syncState(id, EditorState.create({ doc: 'unsaved thoughts' }));
    first.touch(id);
    await first.flushAll();

    const second = mk();
    await second.restore([]);
    expect(second.store.docs).toHaveLength(1);
    expect(second.textOf(second.store.activeId!)).toBe('unsaved thoughts');
  });

  it('save on an untitled document asks for a path and removes the draft', async () => {
    const { docs, platform, type } = setup({}, { savePath: '/new.md' });
    await docs.restore([]);
    const id = docs.store.activeId!;
    type(id, '# Plan');
    await docs.flushAll();
    expect(await platform.kvList('draft/')).toHaveLength(1);
    expect(await docs.save(id)).toBe(true);
    expect(platform.files()['/new.md']).toBe('# Plan');
    expect(docs.store.docs[0].path).toBe('/new.md');
    expect(await platform.kvList('draft/')).toHaveLength(0);
  });

  it('closing a non-empty draft respects cancel', async () => {
    const { docs, type } = setup({}, { confirm: 'cancel' });
    await docs.restore([]);
    const id = docs.store.activeId!;
    type(id, 'keep me');
    expect(await docs.close(id)).toBe(false);
    expect(docs.store.docs).toHaveLength(1);
  });

  it('closing the last tab leaves a fresh untitled document', async () => {
    const { docs } = setup({ '/a.md': 'a' });
    await docs.openPaths(['/a.md']);
    expect(await docs.close()).toBe(true);
    expect(docs.store.docs).toHaveLength(1);
    expect(docs.store.docs[0].path).toBeNull();
  });
});

describe('session restore', () => {
  it('reopens tabs in order with cursors, and activates the saved tab', async () => {
    const { docs, notify } = setup({ '/a.md': 'aaaa', '/b.md': 'bbbbbbbb' });
    await docs.restore([], {
      tabs: [
        { path: '/a.md', cursor: 2, topLine: 0 },
        { path: '/missing.md', cursor: 0, topLine: 0 },
        { path: '/b.md', cursor: 5, topLine: 3 },
      ],
      active: 2,
    });
    expect(docs.store.docs.map((d) => d.path)).toEqual(['/a.md', '/b.md']);
    expect(docs.store.docs.find((d) => d.id === docs.store.activeId)?.path).toBe('/b.md');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("1 file from your last session couldn't be found"));
    const snap = docs.snapshot();
    expect(snap.tabs).toEqual([
      { path: '/a.md', cursor: 2, topLine: 0 },
      { path: '/b.md', cursor: 5, topLine: 3 },
    ]);
    expect(snap.active).toBe(1);
  });

  it('round-trips drafts through the session and keeps unreferenced drafts', async () => {
    const { docs, platform } = setup({ '/a.md': 'a' });
    await platform.kvSet('draft/d1', JSON.stringify({ v: 1, text: 'draft one', untitledIndex: 1, updatedAt: 1 }));
    await platform.kvSet('draft/orphan', JSON.stringify({ v: 1, text: 'crash leftover', untitledIndex: 2, updatedAt: 2 }));
    await docs.restore([], {
      tabs: [
        { draftId: 'd1', cursor: 3, topLine: 0 },
        { path: '/a.md', cursor: 0, topLine: 0 },
      ],
      active: 0,
    });
    expect(docs.store.docs.map((d) => d.path ?? docs.textOf(d.id))).toEqual(['draft one', '/a.md', 'crash leftover']);
    expect(docs.snapshot().tabs[0]).toEqual({ draftId: 'd1', cursor: 3, topLine: 0 });
  });

  it('does not save empty untitled tabs in the session', async () => {
    const { docs } = setup({ '/a.md': 'a' });
    await docs.openPaths(['/a.md']);
    docs.newDoc();
    expect(docs.snapshot().tabs).toEqual([{ path: '/a.md', cursor: 0, topLine: 0 }]);
  });
});

describe('renames and deletes', () => {
  it('retargets open documents when a folder is renamed', async () => {
    const { docs, platform, type } = setup({ '/n/old/a.md': 'a', '/n/other.md': 'o' });
    await docs.openPaths(['/n/old/a.md', '/n/other.md']);
    await platform.renamePath('/n/old', '/n/new');
    docs.renamePaths('/n/old', '/n/new');
    expect(docs.store.docs.map((d) => d.path)).toEqual(['/n/new/a.md', '/n/other.md']);
    const id = docs.store.docs[0].id;
    type(id, '!');
    await docs.save(id);
    expect(platform.files()['/n/new/a.md']).toBe('a!');
    expect(platform.files()['/n/old/a.md']).toBeUndefined();
  });

  it('closes clean documents in a trashed folder but keeps edited ones', async () => {
    const { docs, type } = setup({ '/t/a.md': 'a', '/t/b.md': 'b', '/keep.md': 'k' });
    await docs.openPaths(['/t/a.md', '/t/b.md', '/keep.md']);
    const b = docs.store.docs[1].id;
    type(b, ' edited');
    docs.closeWithin('/t');
    expect(docs.store.docs.map((d) => d.path)).toEqual(['/t/b.md', '/keep.md']);
  });
});

describe('suggestFileName', () => {
  it('uses the first heading', () => {
    expect(suggestFileName('\n# Meeting notes: Q3\nbody', 'Untitled')).toBe('Meeting notes- Q3.md');
  });
  it('falls back for empty text', () => {
    expect(suggestFileName('   \n', 'Untitled 2')).toBe('Untitled 2.md');
  });
});
