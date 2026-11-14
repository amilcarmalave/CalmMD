import { describe, expect, it } from 'vitest';
import { groupHits, matchRanges, searchText, snippet } from './search';

const any = { caseSensitive: false, wholeWord: false };

describe('search', () => {
  it('matches case-insensitively by default', () => {
    expect(matchRanges('Calm calm CALM', 'calm', any)).toEqual([
      [0, 4],
      [5, 9],
      [10, 14],
    ]);
    expect(matchRanges('Calm calm', 'calm', { ...any, caseSensitive: true })).toEqual([[5, 9]]);
  });

  it('can match whole words only, including non-English letters', () => {
    expect(matchRanges('cat catalog cat', 'cat', { ...any, wholeWord: true })).toEqual([
      [0, 3],
      [12, 15],
    ]);
    expect(matchRanges('café cafés', 'café', { ...any, wholeWord: true })).toEqual([[0, 4]]);
  });

  it('finds matching lines with 0-based line numbers', () => {
    const hits = searchText('/a.md', '# Title\nno\nThe title again\r\nend', 'title', any);
    expect(hits.map((h) => h.line)).toEqual([0, 2]);
    expect(hits[1].text).toBe('The title again');
  });

  it('ignores an empty query and respects the limit', () => {
    expect(searchText('/a.md', 'x', '  ', any)).toEqual([]);
    expect(searchText('/a.md', 'a\na\na', 'a', any, 2)).toHaveLength(2);
  });

  it('keeps the match visible in long lines', () => {
    const line = 'x'.repeat(500) + 'NEEDLE' + 'y'.repeat(500);
    const s = snippet(line, 500);
    expect(s).toContain('NEEDLE');
    expect(s.startsWith('…') && s.endsWith('…')).toBe(true);
  });

  it('groups hits by file', () => {
    const g = groupHits([
      { path: '/a', line: 1, text: '' },
      { path: '/b', line: 0, text: '' },
      { path: '/a', line: 4, text: '' },
    ]);
    expect(g.map((x) => [x.path, x.hits.length])).toEqual([
      ['/a', 2],
      ['/b', 1],
    ]);
  });
});
