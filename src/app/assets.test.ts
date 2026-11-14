import { EditorState } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import type { ImageFolderMode } from '../core/assets';
import { createMemoryPlatform } from '../platform/memory';
import { createAssets } from './assets';
import { createDocuments } from './documents';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

function setup(mode: ImageFolderMode = 'document', root: string | null = null, files: Record<string, string> = {}) {
  const platform = createMemoryPlatform({ files });
  const notify = vi.fn();
  const assets = createAssets({ platform, mode: () => mode, root: () => root, notify });
  return { platform, assets, notify };
}

describe('assets', () => {
  it('saves a pasted screenshot next to the document and links it relatively', async () => {
    const { platform, assets } = setup();
    const link = await assets.saveData('/notes/a/doc.md', PNG, 'image/png', 'image.png');
    expect(link).toMatch(/^assets\/image-[0-9a-f]{12}\.png$/);
    expect(await platform.stat('/notes/a/' + link)).not.toBeNull();
  });

  it('reuses the file when the same image is pasted twice', async () => {
    const { platform, assets } = setup();
    const a = await assets.saveData('/n/doc.md', PNG, 'image/png');
    const b = await assets.saveData('/n/doc.md', PNG, 'image/png');
    expect(a).toBe(b);
    expect((await platform.listDir('/n/assets', true)).length).toBe(1);
  });

  it('keeps a named file’s name and avoids clashes', async () => {
    const { assets } = setup();
    expect(await assets.saveData('/n/doc.md', PNG, 'image/png', 'My Chart.png')).toBe('assets/My-Chart.png');
    expect(await assets.saveData('/n/doc.md', new Uint8Array([9]), 'image/png', 'My Chart.png')).toBe('assets/My-Chart-2.png');
  });

  it('uses the root assets folder in root mode', async () => {
    const { assets } = setup('root', '/notes');
    expect(await assets.saveData('/notes/sub/deep/doc.md', PNG, 'image/png', 'x.png')).toBe('../../assets/x.png');
  });

  it('copies dropped files into the asset folder, but links files already beside the document', async () => {
    const { assets, platform } = setup('document', null, {});
    await platform.writeBinaryFile('/pics/Holiday photo.jpg', PNG);
    expect(await assets.importFile('/n/doc.md', '/pics/Holiday photo.jpg')).toBe('assets/Holiday-photo.jpg');
    await platform.writeBinaryFile('/n/img/local.png', PNG);
    expect(await assets.importFile('/n/doc.md', '/n/img/local.png')).toBe('img/local.png');
  });

  it('moves an untitled document’s images next to it on first save', async () => {
    const platform = createMemoryPlatform({ pickSave: async () => '/out/Note.md' });
    const assets = createAssets({ platform, mode: () => 'document', root: () => null, notify: vi.fn() });
    const docs = createDocuments({
      platform,
      makeState: (text) => EditorState.create({ doc: text }),
      confirm: async () => 'cancel',
      notify: vi.fn(),
      autosaveIdleMs: 10,
      beforeSaveAs: (text, from, to) => assets.relocate(text, from, to),
    });
    await docs.restore([]);
    const id = docs.store.activeId!;
    const link = await assets.saveData(null, PNG, 'image/png');
    expect(link).toMatch(/^\/appdata\/pending-assets\/image-/);
    docs.syncState(id, EditorState.create({ doc: `Hi\n\n![](${link})` }));
    docs.touch(id);
    expect(await docs.saveAs(id)).toBe(true);
    const saved = (await platform.readTextFile('/out/Note.md')).text;
    expect(saved).toMatch(/!\[\]\(assets\/image-[0-9a-f]{12}\.png\)/);
    const file = /\((assets\/[^)]+)\)/.exec(saved)![1];
    expect(await platform.stat('/out/' + file)).not.toBeNull();
  });
});
