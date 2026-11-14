import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './fuzzy';

describe('fuzzyMatch', () => {
  it('matches subsequences case-insensitively and rejects non-matches', () => {
    expect(fuzzyMatch('tgl', 'Toggle')).not.toBeNull();
    expect(fuzzyMatch('xyz', 'Toggle Sidebar')).toBeNull();
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, positions: [] });
  });

  it('returns highlight positions', () => {
    expect(fuzzyMatch('side', 'Toggle Sidebar')!.positions).toEqual([7, 8, 9, 10]);
    expect(fuzzyMatch('ts', 'Toggle Sidebar')!.positions).toEqual([0, 7]);
  });

  it('ranks prefix and word-start matches above scattered ones', () => {
    const items = ['Insert Table', 'Toggle Sidebar', 'Toggle Source Mode', 'Format Table', 'Set Theme'];
    const order = (q: string) => fuzzyFilter(q, items, (s) => s).map((r) => r.item);
    expect(order('table')[0]).toBe('Insert Table'); // equal substrings: earlier/shorter wins
    expect(order('tsb')[0]).toBe('Toggle Sidebar');
    expect(order('tsm')[0]).toBe('Toggle Source Mode');
    expect(order('fo')[0]).toBe('Format Table');
  });

  it('keeps original order when the query is empty', () => {
    expect(fuzzyFilter('', ['b', 'a'], (s) => s).map((r) => r.item)).toEqual(['b', 'a']);
  });
});
