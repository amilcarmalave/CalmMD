import { describe, expect, it } from 'vitest';
import { drawingFileName, drawingMarkdown, drawingTitle, isDrawingPath } from './drawings';
import { fileKind } from './fileKinds';

describe('drawings', () => {
  it('recognises drawing files', () => {
    expect(isDrawingPath('/n/Plan.excalidraw.svg')).toBe(true);
    expect(isDrawingPath('C:\\n\\Plan.excalidraw')).toBe(true);
    expect(isDrawingPath('/n/photo.svg')).toBe(false);
    expect(fileKind('Plan.excalidraw.svg')).toBe('drawing');
    expect(fileKind('photo.svg')).toBe('image');
  });

  it('makes a safe file name from what was typed', () => {
    expect(drawingFileName('Kitchen layout')).toBe('Kitchen layout.excalidraw.svg');
    expect(drawingFileName('  a/b: c?  ')).toBe('a-b- c-.excalidraw.svg');
    expect(drawingFileName('Plan.excalidraw.svg')).toBe('Plan.excalidraw.svg');
    expect(drawingFileName('   ')).toBeNull();
    expect(drawingTitle('/n/Kitchen layout.excalidraw.svg')).toBe('Kitchen layout');
  });

  it('links a drawing relative to the note, encoded for Markdown', () => {
    expect(drawingMarkdown('/n/Trip.md', '/n/Kitchen layout.excalidraw.svg')).toBe('![Kitchen layout](Kitchen%20layout.excalidraw.svg)');
    expect(drawingMarkdown('C:\\n\\sub\\Trip.md', 'C:\\n\\Plan.excalidraw.svg')).toBe('![Plan](../Plan.excalidraw.svg)');
  });
});
