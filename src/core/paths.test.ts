import { describe, expect, it } from 'vitest';
import { basename, dirname, isWithin, joinPath, naturalCompare, rebase, samePath, stem } from './paths';

describe('paths', () => {
  it('basename handles both separators', () => {
    expect(basename('/home/a/notes.md')).toBe('notes.md');
    expect(basename('C:\\Users\\a\\notes.md')).toBe('notes.md');
    expect(basename('notes.md')).toBe('notes.md');
    expect(basename('/home/a/dir/')).toBe('dir');
  });

  it('dirname', () => {
    expect(dirname('/home/a/notes.md')).toBe('/home/a');
    expect(dirname('C:\\Users\\a\\notes.md')).toBe('C:\\Users\\a');
    expect(dirname('/notes.md')).toBe('/');
    expect(dirname('notes.md')).toBe('');
  });

  it('stem', () => {
    expect(stem('/a/b/Read Me.md')).toBe('Read Me');
    expect(stem('.hidden')).toBe('.hidden');
  });

  it('joinPath keeps the separator style', () => {
    expect(joinPath('/a/b', 'c.md')).toBe('/a/b/c.md');
    expect(joinPath('C:\\a', 'c.md')).toBe('C:\\a\\c.md');
    expect(joinPath('/', 'c.md')).toBe('/c.md');
  });

  it('isWithin and rebase', () => {
    expect(isWithin('/a/b/c.md', '/a/b')).toBe(true);
    expect(isWithin('/a/bc/c.md', '/a/b')).toBe(false);
    expect(isWithin('C:\\A\\b.md', 'c:\\a')).toBe(true);
    expect(rebase('/a/old/x/y.md', '/a/old', '/a/new')).toBe('/a/new/x/y.md');
    expect(rebase('/a/old', '/a/old', '/a/new')).toBe('/a/new');
  });

  it('naturalCompare', () => {
    const v = ['Chapter 10', 'chapter 2', 'Chapter 1', 'appendix'];
    expect(v.sort(naturalCompare)).toEqual(['appendix', 'Chapter 1', 'chapter 2', 'Chapter 10']);
  });

  it('samePath is case-insensitive only for Windows paths', () => {
    expect(samePath('C:\\Users\\A\\x.md', 'c:/users/a/x.md')).toBe(true);
    expect(samePath('/home/A/x.md', '/home/a/x.md')).toBe(false);
    expect(samePath('/home/a/x.md', '/home/a/x.md')).toBe(true);
  });
});
