import { describe, expect, it, vi } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { openLink } from './links';

function ctx(docPath: string | null = '/notes/a.md') {
  const platform = createMemoryPlatform();
  platform.openExternal = vi.fn(async () => {});
  return { platform, docPath, openPath: vi.fn(), openFile: vi.fn(), gotoAnchor: vi.fn() };
}

describe('openLink', () => {
  it('opens web links externally and ignores dangerous schemes', () => {
    const c = ctx();
    openLink('https://e.com', c);
    openLink('mailto:a@b.c', c);
    openLink('javascript:alert(1)', c);
    openLink('file:///etc/passwd', c);
    expect(c.platform.openExternal).toHaveBeenCalledTimes(2);
    expect(c.openPath).not.toHaveBeenCalled();
  });

  it('opens relative Markdown files in the app', () => {
    const c = ctx();
    openLink('./sub/b.md#part', c);
    openLink('other%20doc.md', c);
    openLink('image.png', c);
    expect(c.openPath.mock.calls.map((x) => x[0])).toEqual(['/notes/sub/b.md', '/notes/other doc.md']);
  });

  it('uses Windows separators for Windows documents', () => {
    const c = ctx('C:\\notes\\a.md');
    openLink('sub/b.md', c);
    expect(c.openPath).toHaveBeenCalledWith('C:\\notes\\sub\\b.md', undefined);
  });

  it('jumps to anchors and ignores self-links', () => {
    const c = ctx();
    openLink('#my-section', c);
    openLink('a.md', c);
    expect(c.gotoAnchor).toHaveBeenCalledWith('my-section');
    expect(c.openPath).not.toHaveBeenCalled();
  });

  it('opens a heading in another note, and other files in tabs', () => {
    const c = ctx();
    openLink('Plan.md#the-budget', c);
    expect(c.openPath).toHaveBeenCalledWith('/notes/Plan.md', 'the-budget');
    openLink('a.md#intro', c);
    expect(c.gotoAnchor).toHaveBeenCalledWith('intro');
    openLink('assets/photo.png', c);
    expect(c.openFile).toHaveBeenCalledWith('/notes/assets/photo.png');
  });
});
