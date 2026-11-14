import { describe, expect, it } from 'vitest';
import { altRangeAt, nthImageAlt, parseAltSize, withAltOptions, withAltSize } from './imageSize';

describe('image sizes in alt text', () => {
  it('reads a width, or width x height', () => {
    expect(parseAltSize('A photo|300')).toEqual({ alt: 'A photo', width: 300, height: null, align: null });
    expect(parseAltSize('A photo | 300x200')).toEqual({ alt: 'A photo', width: 300, height: 200, align: null });
    expect(parseAltSize('|120')).toEqual({ alt: '', width: 120, height: null, align: null });
  });
  it('leaves other alt text alone', () => {
    expect(parseAltSize('A | B')).toEqual({ alt: 'A | B', width: null, height: null, align: null });
    expect(parseAltSize('Chart 2024')).toEqual({ alt: 'Chart 2024', width: null, height: null, align: null });
    expect(parseAltSize('x|0').width).toBeNull();
    expect(parseAltSize('A | center stage').align).toBeNull();
  });
  it('writes and removes sizes', () => {
    expect(withAltSize('A photo', 300)).toBe('A photo|300');
    expect(withAltSize('A photo|300', 480.4)).toBe('A photo|480');
    expect(withAltSize('A photo|300', null)).toBe('A photo');
  });
});

describe('image alignment in alt text', () => {
  it('reads an alignment with or without a size, in either order', () => {
    expect(parseAltSize('A|300|center')).toEqual({ alt: 'A', width: 300, height: null, align: 'center' });
    expect(parseAltSize('A|center')).toEqual({ alt: 'A', width: null, height: null, align: 'center' });
    expect(parseAltSize('A | right | 300')).toEqual({ alt: 'A', width: 300, height: null, align: 'right' });
    expect(parseAltSize('A|left').align).toBe('left');
  });
  it('keeps the alignment when the size changes, and the size when the alignment changes', () => {
    expect(withAltSize('A|300|center', 480)).toBe('A|480|center');
    expect(withAltSize('A|300|center', null)).toBe('A|center');
    expect(withAltOptions('A|300', { align: 'right' })).toBe('A|300|right');
    expect(withAltOptions('A|300|right', { align: 'left' })).toBe('A|300');
    expect(withAltOptions('A|right', { align: null })).toBe('A');
  });
});

describe('finding image alt text', () => {
  it('at a position', () => {
    const t = 'x ![A|300](a.png) y';
    expect(altRangeAt(t, 2)).toEqual({ from: 4, to: 9, alt: 'A|300' });
    expect(altRangeAt(t, 0)).toBeNull();
  });
  it('by index, skipping inline code', () => {
    const t = '`![no](x)` ![one](1.png) and ![two|50](2.png)';
    expect(nthImageAlt(t, 0)?.alt).toBe('one');
    expect(nthImageAlt(t, 1)?.alt).toBe('two|50');
    expect(nthImageAlt(t, 2)).toBeNull();
  });
});
