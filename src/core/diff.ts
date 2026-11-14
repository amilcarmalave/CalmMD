/** One line of a line-by-line comparison: in both texts, only in the new one, or only in the old one. */
export interface DiffLine {
  kind: 'same' | 'add' | 'del';
  text: string;
}

/**
 * Line diff from `a` (old) to `b` (new), with Myers' algorithm (O((N+M)·D), so a small change in a
 * long document stays cheap). Within a change, removed lines come before added ones.
 */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n');
  const B = b.split('\n');
  // Common start and end are cheap to take off and are the usual case.
  let start = 0;
  while (start < A.length && start < B.length && A[start] === B[start]) start++;
  let endA = A.length;
  let endB = B.length;
  while (endA > start && endB > start && A[endA - 1] === B[endB - 1]) {
    endA--;
    endB--;
  }
  const out: DiffLine[] = A.slice(0, start).map((text) => ({ kind: 'same', text }));
  out.push(...middle(A.slice(start, endA), B.slice(start, endB)));
  for (let i = endA; i < A.length; i++) out.push({ kind: 'same', text: A[i] });
  return out;
}

const MAX_EDITS = 2000;

function middle(A: string[], B: string[]): DiffLine[] {
  const n = A.length;
  const m = B.length;
  if (!n) return B.map((text) => ({ kind: 'add', text }));
  if (!m) return A.map((text) => ({ kind: 'del', text }));
  const max = n + m;
  const off = max;
  const v = new Int32Array(2 * max + 2);
  // Each step keeps only the diagonals it can reach (2d+1), so memory grows with the size of the
  // change squared, not the document. Past MAX_EDITS the texts are too different to align usefully.
  const trace: Int32Array[] = [];
  let found = false;
  for (let d = 0; d <= max && !found; d++) {
    if (d > MAX_EDITS) return [...A.map((text): DiffLine => ({ kind: 'del', text })), ...B.map((text): DiffLine => ({ kind: 'add', text }))];
    trace.push(v.slice(off - d, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && A[x] === B[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = true;
        break;
      }
    }
  }
  // Walk back through the saved frontiers to recover the edit path. trace[d] holds the frontier
  // before step d, for diagonals -d..d+1 (index k + d).
  const rev: DiffLine[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d];
    const at = (k: number) => vd[k + d];
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const pk = down ? k + 1 : k - 1;
    const px = d === 0 ? 0 : at(pk);
    const py = px - pk;
    while (x > px && y > py) rev.push({ kind: 'same', text: A[--x] }), y--;
    if (d === 0) break;
    if (down) rev.push({ kind: 'add', text: B[--y] });
    else rev.push({ kind: 'del', text: A[--x] });
  }
  while (x > 0 && y > 0) rev.push({ kind: 'same', text: A[--x] }), y--;
  const out = rev.reverse();
  // Group each change as removals then additions, which reads better than interleaving.
  const grouped: DiffLine[] = [];
  for (let i = 0; i < out.length; ) {
    if (out[i].kind === 'same') {
      grouped.push(out[i++]);
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < out.length && out[i].kind !== 'same') (out[i].kind === 'del' ? dels : adds).push(out[i++]);
    grouped.push(...dels, ...adds);
  }
  return grouped;
}
