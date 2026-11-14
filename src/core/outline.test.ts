import { describe, expect, it } from 'vitest';
import { extractHeadings, headingIndexAt, plainHeadingText } from './outline';

describe('extractHeadings', () => {
  it('finds ATX headings with levels and lines', () => {
    const h = extractHeadings('# One\n\ntext\n\n## Two ##\n### Three\n####### not a heading');
    expect(h).toEqual([
      { level: 1, text: 'One', line: 0 },
      { level: 2, text: 'Two', line: 4 },
      { level: 3, text: 'Three', line: 5 },
    ]);
  });

  it('finds setext headings but not horizontal rules', () => {
    const h = extractHeadings('Title\n=====\n\nSub\n---\n\n---\n\n- item\n---');
    expect(h.map((x) => [x.level, x.text, x.line])).toEqual([
      [1, 'Title', 0],
      [2, 'Sub', 3],
    ]);
  });

  it('ignores headings inside code fences and indented code', () => {
    const h = extractHeadings('```md\n# not\n```\n~~~~\n# not\n```\n# still not\n~~~~\n\n    # indented\n\n# yes');
    expect(h.map((x) => x.text)).toEqual(['yes']);
  });

  it('skips front matter', () => {
    const h = extractHeadings('---\ntitle: x\n# comment\n---\n# Real');
    expect(h).toEqual([{ level: 1, text: 'Real', line: 4 }]);
  });

  it('handles empty headings and CRLF-free input', () => {
    expect(extractHeadings('#\n##   \n# A')).toEqual([
      { level: 1, text: '', line: 0 },
      { level: 2, text: '', line: 1 },
      { level: 1, text: 'A', line: 2 },
    ]);
  });

  it('strips inline markup', () => {
    expect(plainHeadingText('**Bold** and _it_ with `code` and [a link](x) ~~old~~')).toBe(
      'Bold and it with code and a link old',
    );
  });
});

describe('headingIndexAt', () => {
  const hs = extractHeadings('intro\n# A\ntext\n## B\ntext\n# C');
  it('returns the section containing a line', () => {
    expect(headingIndexAt(hs, 0)).toBe(-1);
    expect(headingIndexAt(hs, 1)).toBe(0);
    expect(headingIndexAt(hs, 2)).toBe(0);
    expect(headingIndexAt(hs, 4)).toBe(1);
    expect(headingIndexAt(hs, 99)).toBe(2);
  });
});
