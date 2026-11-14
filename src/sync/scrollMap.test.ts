import { describe, expect, it } from 'vitest';
import {
  blockForLine,
  buildAnchors,
  editorToPreview,
  monotonic,
  previewToEditor,
  type BlockBox,
  type EditorGeometry,
} from './scrollMap';

/** An editor where every line is `h` px tall (plus optional per-line overrides, like wrapped lines). */
function editor(lines: number, h = 20, tall: Record<number, number> = {}): EditorGeometry {
  const tops: number[] = [];
  let y = 0;
  for (let i = 0; i < lines; i++) {
    tops.push(y);
    y += tall[i] ?? h;
  }
  tops.push(y);
  return { lineCount: lines, lineTop: (l) => tops[l], lineBottom: (l) => tops[l + 1] };
}

describe('monotonic', () => {
  it('drops anchors that go backwards or repeat, keeps flat segments', () => {
    const out = monotonic([
      { a: 0, b: 0 },
      { a: 100, b: 50 },
      { a: 100, b: 50 }, // exact duplicate
      { a: 100, b: 60 }, // same editor position, nested block
      { a: 150, b: 40 }, // goes backwards in the preview
      { a: 170, b: 60 }, // flat in the preview (zero-height source line)
      { a: 200, b: 300 },
    ]);
    expect(out).toEqual([
      { a: 0, b: 0 },
      { a: 100, b: 50 },
      { a: 100, b: 60 },
      { a: 170, b: 60 },
      { a: 200, b: 300 },
    ]);
  });

  it('maps flat segments without dividing by zero', () => {
    const a = monotonic([
      { a: 0, b: 0 },
      { a: 100, b: 100 },
      { a: 120, b: 100 },
      { a: 120, b: 180 },
      { a: 200, b: 260 },
    ]);
    expect(editorToPreview(a, 110)).toBe(100);
    expect(previewToEditor(a, 140)).toBe(120);
    for (let x = 0; x <= 260; x += 5) {
      expect(Number.isFinite(editorToPreview(a, x))).toBe(true);
      expect(Number.isFinite(previewToEditor(a, x))).toBe(true);
    }
  });
});

describe('buildAnchors + mapping', () => {
  // A document: heading (line 0), paragraph (2-3), a 400px image (5), a table (7-11), code (13-30).
  const geo = editor(40);
  const blocks: BlockBox[] = [
    { start: 0, end: 1, top: 0, bottom: 48 },
    { start: 2, end: 4, top: 70, bottom: 130 },
    { start: 5, end: 6, top: 150, bottom: 550 }, // the image is much taller than its source line
    { start: 7, end: 12, top: 580, bottom: 760 },
    { start: 7, end: 8, top: 580, bottom: 616 }, // header row
    { start: 9, end: 10, top: 616, bottom: 652 },
    { start: 10, end: 11, top: 652, bottom: 688 },
    { start: 13, end: 31, top: 800, bottom: 1250 },
  ];
  const anchors = buildAnchors(blocks, geo);

  it('maps block tops exactly', () => {
    expect(editorToPreview(anchors, geo.lineTop(2))).toBe(70);
    expect(editorToPreview(anchors, geo.lineTop(5))).toBe(150);
    expect(editorToPreview(anchors, geo.lineTop(13))).toBe(800);
  });

  it('maps table rows individually', () => {
    expect(editorToPreview(anchors, geo.lineTop(9))).toBe(616);
    expect(editorToPreview(anchors, geo.lineTop(10))).toBe(652);
  });

  it('stretches a single source line across a tall image', () => {
    // Halfway through line 5 is halfway down the image.
    const mid = (geo.lineTop(5) + geo.lineBottom(5)) / 2;
    expect(editorToPreview(anchors, mid)).toBeCloseTo(350, 5);
  });

  it('interpolates inside a long code block', () => {
    const top = geo.lineTop(13);
    const bottom = geo.lineBottom(30);
    expect(editorToPreview(anchors, (top + bottom) / 2)).toBeCloseTo((800 + 1250) / 2, 5);
  });

  it('is invertible where both sides have height', () => {
    // Lines 0–6 (heading, paragraph, image): no zero-height segments.
    for (let a = 0; a < geo.lineBottom(5); a += 3) {
      expect(previewToEditor(anchors, editorToPreview(anchors, a))).toBeCloseTo(a, 6);
    }
  });

  it('is monotonic everywhere', () => {
    let prev = -Infinity;
    for (let a = -50; a < 1000; a += 3) {
      const b = editorToPreview(anchors, a);
      expect(b).toBeGreaterThanOrEqual(prev);
      prev = b;
    }
  });

  it('handles wrapped (tall) editor lines', () => {
    const wrapped = editor(10, 20, { 2: 120 }); // line 2 wraps to six visual lines
    const a = buildAnchors([{ start: 2, end: 3, top: 100, bottom: 220 }], wrapped);
    expect(editorToPreview(a, wrapped.lineTop(2) + 60)).toBeCloseTo(160, 5);
  });

  it('aligns the scroll ends', () => {
    const a = buildAnchors(blocks, geo, { aMax: 500, bMax: 1000 });
    expect(editorToPreview(a, 500)).toBe(1000);
    expect(previewToEditor(a, 1000)).toBe(500);
    // Anchors past either limit are dropped, so the tail stays monotonic.
    for (let i = 1; i < a.length; i++) {
      expect(a[i].a).toBeGreaterThanOrEqual(a[i - 1].a);
      expect(a[i].b).toBeGreaterThanOrEqual(a[i - 1].b);
    }
    expect(a[a.length - 1]).toEqual({ a: 500, b: 1000 });
  });

  it('ignores blocks beyond the document (stale render) and empty boxes', () => {
    const a = buildAnchors(
      [
        { start: 100, end: 101, top: 10, bottom: 20 },
        { start: 1, end: 2, top: 30, bottom: 30 },
      ],
      editor(5),
    );
    expect(a).toEqual([{ a: 0, b: 0 }]);
  });

  it('copes with no anchors (empty document)', () => {
    expect(editorToPreview([], 123)).toBe(123);
  });

  it('stays fast for long documents', () => {
    const n = 20000;
    const big = editor(n);
    const blks: BlockBox[] = Array.from({ length: n / 2 }, (_, i) => ({
      start: i * 2,
      end: i * 2 + 1,
      top: i * 50,
      bottom: i * 50 + 30,
    }));
    const t = performance.now();
    const a = buildAnchors(blks, big);
    for (let y = 0; y < 400000; y += 97) editorToPreview(a, y);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

describe('blockForLine', () => {
  it('returns the innermost block', () => {
    const blocks = [
      { start: 0, end: 10, id: 'list' },
      { start: 2, end: 4, id: 'item' },
      { start: 2, end: 3, id: 'nested' },
    ];
    expect(blockForLine(blocks, 2)?.id).toBe('nested');
    expect(blockForLine(blocks, 3)?.id).toBe('item');
    expect(blockForLine(blocks, 8)?.id).toBe('list');
    expect(blockForLine(blocks, 12)).toBeNull();
  });
});
