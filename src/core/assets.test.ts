import { describe, expect, it } from 'vitest';
import {
  assetFolderFor,
  findImageLinks,
  hashedName,
  markdownUrl,
  planRelocation,
  relativePath,
  resolveLink,
  safeStem,
  sha256Hex,
  uniqueName,
} from './assets';

describe('asset folders', () => {
  it('puts images next to the document by default', () => {
    expect(assetFolderFor('/notes/a/doc.md', 'document', '/notes')).toBe('/notes/a/assets');
  });
  it('uses the root folder when the document is inside it', () => {
    expect(assetFolderFor('/notes/a/doc.md', 'root', '/notes')).toBe('/notes/assets');
    expect(assetFolderFor('C:\\Notes\\a\\doc.md', 'root', 'C:\\Notes')).toBe('C:\\Notes\\assets');
  });
  it('falls back to the document folder outside the root', () => {
    expect(assetFolderFor('/elsewhere/doc.md', 'root', '/notes')).toBe('/elsewhere/assets');
    expect(assetFolderFor('/elsewhere/doc.md', 'root', null)).toBe('/elsewhere/assets');
  });
});

describe('relative paths and URLs', () => {
  it('computes relative paths with forward slashes', () => {
    expect(relativePath('/notes/a', '/notes/a/assets/x.png')).toBe('assets/x.png');
    expect(relativePath('/notes/a/b', '/notes/assets/x.png')).toBe('../../assets/x.png');
    expect(relativePath('C:\\Notes\\a', 'c:\\notes\\assets\\x.png')).toBe('../assets/x.png');
  });
  it('has no relative path across Windows drives', () => {
    expect(relativePath('C:\\Notes', 'D:\\Pics\\x.png')).toBeNull();
  });
  it('escapes characters that break link destinations, keeping Unicode', () => {
    expect(markdownUrl('assets/my shot (1).png')).toBe('assets/my%20shot%20%281%29.png');
    expect(markdownUrl('assets/café.png')).toBe('assets/café.png');
  });
  it('resolves links back to files', () => {
    expect(resolveLink('assets/my%20shot.png', '/notes/a')).toBe('/notes/a/assets/my shot.png');
    expect(resolveLink('../img/x.png', 'C:\\Notes\\a')).toBe('C:\\Notes\\img\\x.png');
    expect(resolveLink('C:/tmp/x.png', null)).toBe('C:/tmp/x.png');
    expect(resolveLink('https://x.com/a.png', '/n')).toBeNull();
    expect(resolveLink('data:image/png;base64,xx', '/n')).toBeNull();
    expect(resolveLink('assets/x.png', null)).toBeNull();
  });
});

describe('names', () => {
  it('makes safe stems and unique names', () => {
    expect(safeStem('My Screenshot: 1/2.png')).toBe('2');
    expect(safeStem('Diagram  final?.PNG')).toBe('Diagram-final');
    expect(safeStem('...')).toBe('image');
    const taken = new Set(['a.png', 'a-2.png']);
    expect(uniqueName('a.png', (n) => taken.has(n))).toBe('a-3.png');
    expect(uniqueName('b.png', (n) => taken.has(n))).toBe('b.png');
  });
  it('names pasted data by its content', async () => {
    const h = await sha256Hex(new TextEncoder().encode('hello'));
    expect(h.startsWith('2cf24dba5fb0')).toBe(true);
    expect(hashedName(h, 'png')).toBe('image-2cf24dba5fb0.png');
  });
});

describe('findImageLinks', () => {
  it('finds Markdown and HTML images outside code', () => {
    const text = ['![a](x.png) and ![b](<my pic.png> "t")', '`![no](code.png)`', '```', '![no](fenced.png)', '```', '<img src="y.png" width=3>'].join('\n');
    expect(findImageLinks(text).map((l) => l.url)).toEqual(['x.png', 'my pic.png', 'y.png']);
    const [first] = findImageLinks(text);
    expect(text.slice(first.from, first.to)).toBe('x.png');
  });
});

describe('planRelocation', () => {
  const files = new Set(['/pending/image-abc.png', '/old/assets/a.png', '/shared/pics/b.png', '/new/assets/a.png']);
  const exists = (p: string) => files.has(p);

  it('moves pending images of an untitled document next to its first save', () => {
    const r = planRelocation({ text: '![](/pending/image-abc.png)', from: null, to: '/new/doc.md', pendingDir: '/pending', mode: 'document', root: null, exists });
    expect(r).toEqual({ copies: [{ from: '/pending/image-abc.png', to: '/new/assets/image-abc.png' }], text: '![](assets/image-abc.png)' });
  });

  it('copies owned images along on Save As and re-points the rest', () => {
    const text = '![](assets/a.png) ![](../shared/pics/b.png) ![](https://x.com/c.png) ![](missing.png)';
    const r = planRelocation({ text, from: '/old/doc.md', to: '/new/doc.md', pendingDir: '/pending', mode: 'document', root: null, exists })!;
    // a.png is taken in the new folder, so the copy gets a new name.
    expect(r.copies).toEqual([{ from: '/old/assets/a.png', to: '/new/assets/a-2.png' }]);
    expect(r.text).toBe('![](assets/a-2.png) ![](../shared/pics/b.png) ![](https://x.com/c.png) ![](missing.png)');
  });

  it('does nothing when the folder stays the same', () => {
    expect(planRelocation({ text: '![](assets/a.png)', from: '/old/doc.md', to: '/old/other.md', pendingDir: null, mode: 'document', root: null, exists })).toBeNull();
  });

  it('uses the root assets folder in root mode', () => {
    const r = planRelocation({ text: '![](/pending/image-abc.png)', from: null, to: '/notes/sub/doc.md', pendingDir: '/pending', mode: 'root', root: '/notes', exists })!;
    expect(r.copies[0].to).toBe('/notes/assets/image-abc.png');
    expect(r.text).toBe('![](../assets/image-abc.png)');
  });

  it('copies each image once even if it is linked twice', () => {
    const r = planRelocation({ text: '![](/pending/image-abc.png) ![](/pending/image-abc.png)', from: null, to: '/new/d.md', pendingDir: '/pending', mode: 'document', root: null, exists })!;
    expect(r.copies).toHaveLength(1);
    expect(r.text).toBe('![](assets/image-abc.png) ![](assets/image-abc.png)');
  });
});
