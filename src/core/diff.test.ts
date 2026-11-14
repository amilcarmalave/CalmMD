import { describe, expect, it } from 'vitest';
import { diffLines } from './diff';

const show = (a: string, b: string) => diffLines(a, b).map((d) => (d.kind === 'same' ? ' ' : d.kind === 'add' ? '+' : '-') + d.text);

describe('diffLines', () => {
  it('marks nothing when the texts match', () => {
    expect(show('a\nb', 'a\nb')).toEqual([' a', ' b']);
  });
  it('finds added, removed and changed lines', () => {
    expect(show('a\nb\nc', 'a\nc\nd')).toEqual([' a', '-b', ' c', '+d']);
    expect(show('one\ntwo', 'one\nTWO')).toEqual([' one', '-two', '+TWO']);
  });
  it('handles empty sides', () => {
    expect(show('', 'x')).toEqual(['-', '+x']);
    expect(show('x\ny', '')).toEqual(['-x', '-y', '+']);
  });
  it('aligns several scattered changes', () => {
    expect(show('a\nb\nc\nd\ne\nf', 'a\nB\nc\nd\nf\ng')).toEqual([' a', '-b', '+B', ' c', ' d', '-e', ' f', '+g']);
  });
  it('gives up aligning completely different long texts without running out of memory', () => {
    const a = Array.from({ length: 6000 }, (_, i) => `a${i}`).join('\n');
    const b = Array.from({ length: 6000 }, (_, i) => `b${i}`).join('\n');
    const d = diffLines(a, b);
    expect(d.length).toBe(12000);
  });
  it('keeps long documents with a small change cheap and exact', () => {
    const a = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
    const b = a.replace('line 2500', 'changed');
    const d = diffLines(a, b);
    expect(d.filter((x) => x.kind !== 'same').map((x) => x.kind + x.text)).toEqual(['delline 2500', 'addchanged']);
  });
});
