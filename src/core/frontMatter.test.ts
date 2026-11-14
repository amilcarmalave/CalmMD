import { describe, expect, it } from 'vitest';
import { frontMatterLinesOf } from './frontMatter';

describe('frontMatterLinesOf', () => {
  it('finds YAML front matter', () => {
    expect(frontMatterLinesOf('---\ntitle: A\n---\n# Hi')).toBe(3);
  });
  it('accepts ... as the YAML closing fence', () => {
    expect(frontMatterLinesOf('---\na: 1\n...\ntext')).toBe(3);
  });
  it('finds TOML front matter', () => {
    expect(frontMatterLinesOf('+++\na = 1\n+++\n')).toBe(3);
  });
  it('handles CRLF', () => {
    expect(frontMatterLinesOf('---\r\na: 1\r\n---\r\nx')).toBe(3);
  });
  it('ignores an unclosed block (a leading rule)', () => {
    expect(frontMatterLinesOf('---\nJust text after a rule\n')).toBe(0);
  });
  it('ignores --- that is not on the first line', () => {
    expect(frontMatterLinesOf('\n---\na: 1\n---\n')).toBe(0);
  });
});
