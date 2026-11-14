import { describe, expect, it } from 'vitest';
import { decodeFromDisk, encodeForDisk, minimalChange } from './text';

describe('decodeFromDisk / encodeForDisk', () => {
  it('round-trips LF files', () => {
    const d = decodeFromDisk('a\nb\n');
    expect(d).toEqual({ text: 'a\nb\n', eol: '\n', bom: false });
    expect(encodeForDisk(d.text, d.eol, d.bom)).toBe('a\nb\n');
  });

  it('round-trips CRLF files with a BOM', () => {
    const raw = '﻿a\r\nb\r\n';
    const d = decodeFromDisk(raw);
    expect(d).toEqual({ text: 'a\nb\n', eol: '\r\n', bom: true });
    expect(encodeForDisk(d.text, d.eol, d.bom)).toBe(raw);
  });

  it('picks the majority line ending for mixed files', () => {
    expect(decodeFromDisk('a\r\nb\r\nc\n').eol).toBe('\r\n');
    expect(decodeFromDisk('a\nb\nc\r\n').eol).toBe('\n');
  });

  it('normalises lone CR', () => {
    expect(decodeFromDisk('a\rb').text).toBe('a\nb');
  });
});

describe('minimalChange', () => {
  it('returns null for identical text', () => {
    expect(minimalChange('abc', 'abc')).toBeNull();
  });

  it('finds an insertion', () => {
    expect(minimalChange('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' });
  });

  it('finds a deletion and a replacement', () => {
    expect(minimalChange('abcdef', 'abef')).toEqual({ from: 2, to: 4, insert: '' });
    expect(minimalChange('abcdef', 'abXYef')).toEqual({ from: 2, to: 4, insert: 'XY' });
  });

  it('applies correctly for repeated characters', () => {
    const cases: [string, string][] = [['aaa', 'aaaa'], ['abab', 'ab'], ['', 'x'], ['x', '']];
    for (const [a, b] of cases) {
      const c = minimalChange(a, b)!;
      expect(a.slice(0, c.from) + c.insert + a.slice(c.to)).toBe(b);
    }
  });
});
