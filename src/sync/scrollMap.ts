/**
 * Scroll mapping between the editor and the preview.
 *
 * An anchor pairs a vertical position in the editor (`a`) with the matching position in the
 * preview (`b`), both in scroll-content coordinates. Positions between anchors are interpolated
 * linearly. Anchors come from block boundaries: the top of each rendered block ↔ the top of
 * its first source line, and the bottom of each block ↔ the bottom of its last source line.
 * Because nested blocks (list items, table rows) carry their own lines, long lists and tables
 * stay aligned row by row.
 */

export interface Anchor {
  a: number;
  b: number;
}

export interface BlockBox {
  /** First source line, 0-based. */
  start: number;
  /** Source line after the block (exclusive). */
  end: number;
  /** Rendered top/bottom in preview content coordinates. */
  top: number;
  bottom: number;
}

export interface EditorGeometry {
  lineCount: number;
  /** Top of a 0-based line in editor content coordinates. */
  lineTop(line: number): number;
  /** Bottom of a 0-based line in editor content coordinates. */
  lineBottom(line: number): number;
}

export interface ScrollExtents {
  /** Maximum scrollTop of the editor and of the preview. */
  aMax: number;
  bMax: number;
}

/**
 * Keeps anchors that never go backwards in either coordinate. Flat segments are allowed and
 * meaningful: a table's `|---|` delimiter line has no rendered height (flat in the preview),
 * and front matter may render as nothing at all. Exact duplicates are dropped.
 * Interpolation picks the last anchor at or before x, so flat segments never divide by zero.
 */
export function monotonic(points: Anchor[]): Anchor[] {
  const sorted = [...points].sort((x, y) => x.a - y.a || x.b - y.b);
  const out: Anchor[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (!last || (p.a >= last.a && p.b >= last.b && (p.a > last.a || p.b > last.b))) out.push(p);
  }
  return out;
}

export function buildAnchors(blocks: BlockBox[], editor: EditorGeometry, extents?: ScrollExtents): Anchor[] {
  const points: Anchor[] = [{ a: 0, b: 0 }];
  for (const blk of blocks) {
    if (blk.start >= editor.lineCount || blk.bottom <= blk.top) continue;
    points.push({ a: editor.lineTop(blk.start), b: blk.top });
    // Bottom anchors matter even for one-line blocks: an image is one source line but can be
    // hundreds of pixels tall, and scrolling through that line should glide over the image.
    const last = Math.max(blk.start, Math.min(blk.end, editor.lineCount) - 1);
    points.push({ a: editor.lineBottom(last), b: blk.bottom });
  }
  let anchors = monotonic(points);
  if (extents && extents.aMax > 0 && extents.bMax > 0) {
    // Align the ends: when one pane is scrolled to the bottom, so is the other. Anchors past
    // either scroll limit are dropped so the tail interpolates smoothly to the end.
    anchors = anchors.filter((p) => p.a < extents.aMax && p.b < extents.bMax);
    anchors.push({ a: extents.aMax, b: extents.bMax });
  }
  return anchors;
}

/** Maps a position along `from` to `to`, extrapolating with slope 1 outside the anchors. */
function interpolate(anchors: Anchor[], x: number, from: 'a' | 'b', to: 'a' | 'b'): number {
  const n = anchors.length;
  if (n === 0) return x;
  if (x <= anchors[0][from]) return anchors[0][to] - (anchors[0][from] - x);
  if (x >= anchors[n - 1][from]) return anchors[n - 1][to] + (x - anchors[n - 1][from]);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid][from] <= x) lo = mid;
    else hi = mid;
  }
  const p = anchors[lo];
  const q = anchors[hi];
  const t = (x - p[from]) / (q[from] - p[from]);
  return p[to] + t * (q[to] - p[to]);
}

export const editorToPreview = (anchors: Anchor[], a: number) => interpolate(anchors, a, 'a', 'b');
export const previewToEditor = (anchors: Anchor[], b: number) => interpolate(anchors, b, 'b', 'a');

/** The innermost block containing `line`, for cursor highlighting. */
export function blockForLine<T extends { start: number; end: number }>(blocks: T[], line: number): T | null {
  let best: T | null = null;
  for (const b of blocks) {
    if (b.start <= line && line < b.end) {
      if (!best || b.end - b.start <= best.end - best.start) best = b;
    }
  }
  return best;
}
