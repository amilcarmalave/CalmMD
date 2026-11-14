import { describe, expect, it, vi } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { createExplorer, pushRecent, validateName, withMarkdownExt } from './explorer';

function setup(confirm: 'primary' | 'cancel' = 'primary') {
  const platform = createMemoryPlatform({
    files: {
      '/r/b.md': '',
      '/r/a.md': '',
      '/r/img.png': '',
      '/r/notes/Chapter 10.md': '',
      '/r/notes/Chapter 2.md': '',
    },
  });
  const deps = {
    platform,
    confirm: async () => confirm,
    notify: vi.fn(),
    onRenamed: vi.fn(),
    onTrashed: vi.fn(),
    openFile: vi.fn(),
  };
  return { platform, deps, ex: createExplorer(deps) };
}

describe('recent folders', () => {
  it('keeps the most recent first, without duplicates, capped', () => {
    expect(pushRecent(['/a', '/b'], '/b')).toEqual(['/b', '/a']);
    expect(pushRecent(['C:\\X'], 'c:\\x')).toEqual(['c:\\x']);
    expect(pushRecent(['/1', '/2', '/3'], '/4', 3)).toEqual(['/4', '/1', '/2']);
  });

  it('remembers opened roots and shares them across explorers', async () => {
    const { platform, deps, ex } = setup();
    await ex.setRoot('/r/notes');
    await ex.setRoot('/r');
    expect(ex.state.recent).toEqual(['/r', '/r/notes']);
    const other = createExplorer({ ...deps, platform });
    await other.loadFavorites();
    await vi.waitFor(() => expect(other.state.recent).toEqual(['/r', '/r/notes']));
    await ex.forgetRecent('/r/notes');
    expect(ex.state.recent).toEqual(['/r']);
  });

  it('opens the parent folder with the previous root expanded', async () => {
    const { ex } = setup();
    await ex.setRoot('/r/notes');
    await ex.openParent();
    expect(ex.state.root).toBe('/r');
    expect(ex.state.expanded['/r/notes']).toBe(true);
    expect(ex.state.entries['/r/notes']?.length).toBe(2);
  });
});

describe('explorer', () => {
  it('lists folders first in natural order, and can hide everything but notes', async () => {
    const { ex } = setup();
    await ex.setRoot('/r');
    expect(ex.visible(ex.state.entries['/r']).map((e) => e.name)).toContain('img.png');
    ex.setShowAllFiles(false);
    expect(ex.visible(ex.state.entries['/r']).map((e) => e.name)).toEqual(['notes', 'a.md', 'b.md']);
    await ex.toggle('/r/notes');
    expect(ex.state.entries['/r/notes'].map((e) => e.name)).toEqual(['Chapter 2.md', 'Chapter 10.md']);
    ex.setShowAllFiles(true);
    expect(ex.visible(ex.state.entries['/r']).map((e) => e.name)).toContain('img.png');
  });

  it('creates files with a .md extension and opens them', async () => {
    const { ex, deps, platform } = setup();
    await ex.setRoot('/r');
    const p = await ex.create('/r/notes', 'Draft', 'file');
    expect(p).toBe('/r/notes/Draft.md');
    expect(platform.files()['/r/notes/Draft.md']).toBe('');
    expect(deps.openFile).toHaveBeenCalledWith('/r/notes/Draft.md');
    expect(ex.state.expanded['/r/notes']).toBe(true);
  });

  it('refuses invalid names and existing targets', async () => {
    const { ex, deps } = setup();
    await ex.setRoot('/r');
    expect(await ex.create('/r', 'a/b', 'file')).toBeNull();
    expect(await ex.create('/r', 'a', 'file')).toBeNull(); // a.md exists
    expect(await ex.rename('/r/a.md', 'b.md')).toBeNull();
    expect(deps.notify).toHaveBeenCalledTimes(3);
  });

  it('renaming a folder retargets documents, expansion and favorites', async () => {
    const { ex, deps } = setup();
    await ex.setRoot('/r', ['/r/notes']);
    await ex.toggleFavorite('/r/notes/Chapter 2.md', false);
    const to = await ex.rename('/r/notes', 'book');
    expect(to).toBe('/r/book');
    expect(deps.onRenamed).toHaveBeenCalledWith('/r/notes', '/r/book');
    expect(ex.state.expanded['/r/book']).toBe(true);
    expect(ex.state.expanded['/r/notes']).toBeUndefined();
    expect(ex.state.favorites[0].path).toBe('/r/book/Chapter 2.md');
  });

  it('trash asks first and respects cancel', async () => {
    const a = setup('cancel');
    await a.ex.setRoot('/r');
    expect(await a.ex.trash('/r/a.md', false)).toBe(false);
    expect(a.platform.files()['/r/a.md']).toBe('');

    const b = setup('primary');
    await b.ex.setRoot('/r');
    expect(await b.ex.trash('/r/notes', true)).toBe(true);
    expect(b.deps.onTrashed).toHaveBeenCalledWith('/r/notes');
    expect(Object.keys(b.platform.files()).some((p) => p.startsWith('/r/notes'))).toBe(false);
  });

  it('persists favorites', async () => {
    const { ex, deps } = setup();
    await ex.toggleFavorite('/r/a.md', false);
    await ex.toggleFavorite('/r/notes', true);
    const again = createExplorer(deps);
    await again.loadFavorites();
    expect(again.state.favorites).toEqual([
      { path: '/r/a.md', isDir: false },
      { path: '/r/notes', isDir: true },
    ]);
    await again.toggleFavorite('/r/a.md', false);
    expect(again.isFavorite('/r/a.md')).toBe(false);
  });
});

describe('names', () => {
  it('validates', () => {
    expect(validateName('ok name.md')).toBeNull();
    expect(validateName('  ')).not.toBeNull();
    expect(validateName('a:b')).not.toBeNull();
    expect(validateName('con.md')).not.toBeNull();
    expect(validateName('trailing.')).not.toBeNull();
  });
  it('adds .md when there is no extension', () => {
    expect(withMarkdownExt('Notes')).toBe('Notes.md');
    expect(withMarkdownExt('todo.txt')).toBe('todo.txt');
  });
});
