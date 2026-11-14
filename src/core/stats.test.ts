import { describe, expect, it } from 'vitest';
import { countStats } from './stats';

describe('countStats', () => {
  it('handles empty text', () => {
    expect(countStats('')).toEqual({ words: 0, chars: 0, lines: 1 });
  });

  it('counts words, ignoring Markdown punctuation', () => {
    expect(countStats('# Hello **bold** _world_').words).toBe(3);
    expect(countStats('- [ ] buy milk\n- [x] done').words).toBe(4); // buy, milk, x, done
  });

  it('keeps contractions, decimals and hyphenated words whole', () => {
    expect(countStats("don't stop 3.14 well-known e.g.").words).toBe(5);
  });

  it('counts CJK characters individually', () => {
    expect(countStats('中文字').words).toBe(3);
    expect(countStats('hello中文').words).toBe(3);
  });

  it('counts characters by code point and excludes line breaks', () => {
    const s = countStats('a😀\r\nb');
    expect(s.chars).toBe(3);
    expect(s.lines).toBe(2);
  });

  it('counts lines including trailing newline', () => {
    expect(countStats('a\nb\n').lines).toBe(3);
  });

  it('is reasonably fast on large documents', () => {
    const big = 'Lorem ipsum dolor sit amet, consectetur adipiscing.\n'.repeat(20000); // ~1 MB
    const t = performance.now();
    const s = countStats(big);
    expect(s.words).toBe(7 * 20000);
    expect(performance.now() - t).toBeLessThan(500);
  });
});
