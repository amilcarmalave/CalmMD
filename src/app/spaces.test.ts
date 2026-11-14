import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { createDocuments } from './documents';
import { DEFAULT_SESSION, parseSession } from './session';
import { createSpaces, parseSpace } from './spaces';

describe('spaces store', () => {
  it('creates, lists by recency, renames and removes', async () => {
    const platform = createMemoryPlatform();
    let changes = 0;
    const spaces = createSpaces(platform, () => changes++);
    const a = await spaces.create('Thesis', { ...DEFAULT_SESSION, root: '/thesis' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await spaces.create('  ', DEFAULT_SESSION);
    expect(b.name).toBe('Untitled Space');
    expect((await spaces.list()).map((s) => s.id)).toEqual([b.id, a.id]);
    await new Promise((r) => setTimeout(r, 5));
    await spaces.saveSession(a.id, { ...DEFAULT_SESSION, root: '/thesis', tabs: [{ path: '/thesis/ch1.md', cursor: 3, topLine: 0 }] });
    expect((await spaces.list())[0].id).toBe(a.id); // opening bumps it to the top
    expect((await spaces.get(a.id))!.session.tabs).toHaveLength(1);
    await spaces.rename(a.id, 'PhD');
    expect((await spaces.get(a.id))!.name).toBe('PhD');
    await spaces.remove(b.id);
    expect(await spaces.list()).toHaveLength(1);
    expect(changes).toBe(4); // create, create, rename, remove (session saves are quiet)
  });

  it('rejects corrupt records', () => {
    expect(parseSpace('{bad')).toBeNull();
    expect(parseSpace(JSON.stringify({ v: 1, id: 'x' }))).toBeNull();
    expect(parseSpace(JSON.stringify({ v: 1, id: 'x', name: 'N', session: { tabs: 'nope' } }))!.session.tabs).toEqual([]);
  });

  it('keeps the per-space view mode', () => {
    expect(parseSession(JSON.stringify({ viewMode: 'split' })).viewMode).toBe('split');
    expect(parseSession(JSON.stringify({ viewMode: 'weird' })).viewMode).toBeUndefined();
  });
});

describe('draft ownership', () => {
  const setup = (owner: string, storage?: ReturnType<typeof createMemoryPlatform>) => {
    const platform = storage ?? createMemoryPlatform();
    const docs = createDocuments({
      platform,
      makeState: (text) => EditorState.create({ doc: text }),
      confirm: async () => 'cancel',
      notify: () => {},
      autosaveIdleMs: 5,
      draftOwner: () => owner,
    });
    return { platform, docs };
  };

  it('restores only drafts owned by this window or space', async () => {
    const a = setup('space:A');
    await a.docs.restore([]);
    a.docs.syncState(a.docs.store.activeId!, EditorState.create({ doc: 'idea for A' }));
    a.docs.touch(a.docs.store.activeId!);
    await a.docs.flushAll();

    // Another space starting on the same storage doesn't pick it up.
    const b = setup('space:B', a.platform);
    await b.docs.restore([]);
    expect(b.docs.store.docs.map((d) => b.docs.textOf(d.id))).toEqual(['']);

    // Space A does.
    const a2 = setup('space:A', a.platform);
    await a2.docs.restore([]);
    expect(a2.docs.store.docs.map((d) => a2.docs.textOf(d.id))).toEqual(['idea for A']);
  });

  it('reset closes everything but keeps drafts for later', async () => {
    const a = setup('window:main');
    await a.docs.restore([]);
    const id = a.docs.store.activeId!;
    a.docs.syncState(id, EditorState.create({ doc: 'keep me' }));
    a.docs.touch(id);
    await a.docs.flushAll();
    a.docs.reset();
    expect(a.docs.store.docs).toHaveLength(0);
    expect(await a.platform.kvList('draft/')).toHaveLength(1);
    await a.docs.restore([]);
    expect(a.docs.textOf(a.docs.store.activeId!)).toBe('keep me');
  });

  it('re-tags drafts when the owner changes', async () => {
    let owner = 'window:main';
    const platform = createMemoryPlatform();
    const docs = createDocuments({
      platform,
      makeState: (text) => EditorState.create({ doc: text }),
      confirm: async () => 'cancel',
      notify: () => {},
      autosaveIdleMs: 5,
      draftOwner: () => owner,
    });
    await docs.restore([]);
    docs.syncState(docs.store.activeId!, EditorState.create({ doc: 'moves with the space' }));
    docs.touch(docs.store.activeId!);
    await docs.flushAll();
    owner = 'space:S';
    await docs.rewriteDrafts();
    const [key] = await platform.kvList('draft/');
    expect(JSON.parse((await platform.kvGet(key))!).owner).toBe('space:S');
  });

  it('can adopt orphaned drafts from closed windows', async () => {
    const w = setup('window:space-3');
    await w.docs.restore([]);
    w.docs.syncState(w.docs.store.activeId!, EditorState.create({ doc: 'orphan' }));
    w.docs.touch(w.docs.store.activeId!);
    await w.docs.flushAll();
    const main = setup('window:main', w.platform);
    await main.docs.restore([], undefined, { adopt: (o) => !o || o === 'window:main' || o === 'window:space-3' });
    expect(main.docs.textOf(main.docs.store.activeId!)).toBe('orphan');
  });
});
