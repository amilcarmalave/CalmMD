import { describe, expect, it } from 'vitest';
import { linksTo, noteLink, parseWiki, resolveWiki } from './noteLinks';

const files = ['/n/Ideas.md', '/n/projects/Ideas.md', '/n/projects/thesis/Chapter 1.md', '/n/journal/Today.md', '/n/a.png'];

describe('wiki links', () => {
  it('parses names, headings and aliases', () => {
    expect(parseWiki('Ideas')).toEqual({ name: 'Ideas', heading: undefined, alias: undefined });
    expect(parseWiki('Ideas.md#Big ones|my ideas')).toEqual({ name: 'Ideas', heading: 'Big ones', alias: 'my ideas' });
    expect(parseWiki('#Local heading')).toEqual({ name: '', heading: 'Local heading', alias: undefined });
    expect(parseWiki('  ')).toBeNull();
  });

  it('resolves the same folder first, then the closest match', () => {
    expect(resolveWiki('Ideas', '/n/projects/x.md', files)).toBe('/n/projects/Ideas.md');
    expect(resolveWiki('ideas', '/n/journal/Today.md', files)).toBe('/n/Ideas.md');
    expect(resolveWiki('Chapter 1', '/n/Ideas.md', files)).toBe('/n/projects/thesis/Chapter 1.md');
    expect(resolveWiki('thesis/Chapter 1', null, files)).toBe('/n/projects/thesis/Chapter 1.md');
    expect(resolveWiki('Missing', '/n/Ideas.md', files)).toBeNull();
    expect(resolveWiki('a', '/n/Ideas.md', files)).toBeNull(); // images aren't notes
  });
});

describe('noteLink', () => {
  it('inserts a relative Markdown link', () => {
    expect(noteLink('/n/journal/Today.md', '/n/projects/thesis/Chapter 1.md')).toBe('[Chapter 1](../projects/thesis/Chapter%201.md)');
    expect(noteLink('/n/Ideas.md', '/n/journal/Today.md')).toBe('[Today](journal/Today.md)');
  });
  it('falls back to a wiki link for untitled documents', () => {
    expect(noteLink(null, '/n/Ideas.md')).toBe('[[Ideas]]');
  });
});

describe('linksTo (Linked from)', () => {
  it('finds relative links and wiki links to the note, not images or other notes', () => {
    const text = [
      'See [ch1](projects/thesis/Chapter%201.md#intro).',
      'Also [[Chapter 1]] and [[Chapter 1|the first]].',
      '![not a link](projects/thesis/Chapter%201.md)',
      'Unrelated [x](journal/Today.md) and [[Today]].',
    ].join('\n');
    const hits = linksTo(text, '/n/Ideas.md', '/n/projects/thesis/Chapter 1.md', files);
    expect(hits.map((h) => h.line)).toEqual([0, 1]);
  });
  it('ignores the note itself', () => {
    expect(linksTo('[[Ideas]]', '/n/Ideas.md', '/n/Ideas.md', files)).toEqual([]);
  });
});
