import { describe, expect, it } from 'vitest';
import { fileKind, formatBytes, parseDelimited } from './fileKinds';

describe('fileKind', () => {
  it('sorts files into what Quick view can show', () => {
    expect(fileKind('Notes.md')).toBe('note');
    expect(fileKind('todo.txt')).toBe('note');
    expect(fileKind('assets/shot.PNG')).toBe('image');
    expect(fileKind('report.pdf')).toBe('pdf');
    expect(fileKind('data.csv')).toBe('table');
    expect(fileKind('script.py')).toBe('text');
    expect(fileKind('config.yaml')).toBe('text');
    expect(fileKind('/x/LICENSE')).toBe('text');
    expect(fileKind('archive.zip')).toBe('other');
    expect(fileKind('Movie.mp4')).toBe('other');
  });
});

describe('parseDelimited', () => {
  it('reads quoted fields, escaped quotes and CRLF', () => {
    const { rows } = parseDelimited('name,note\r\n"Ada, L.","said ""hi"""\r\nBob,\n', ',');
    expect(rows).toEqual([
      ['name', 'note'],
      ['Ada, L.', 'said "hi"'],
      ['Bob', ''],
    ]);
  });
  it('reads tabs and caps the rows', () => {
    const r = parseDelimited('a\tb\n1\t2\n3\t4\n', '\t', 2);
    expect(r.rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(r.truncated).toBe(true);
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
