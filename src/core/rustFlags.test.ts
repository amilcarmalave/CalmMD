// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { pdfEngine, useRustMarkdown, useRustSpell } from './rustFlags';

const keys = ['calmmd.rust.markdown', 'calmmd.rust.spell', 'calmmd.pdf.engine'];

afterEach(() => {
  for (const key of keys) localStorage.removeItem(key);
});

describe('Rust migration flags', () => {
  it('keeps every Rust service off by default', () => {
    expect(useRustMarkdown()).toBe(false);
    expect(useRustSpell()).toBe(false);
    expect(pdfEngine()).toBe('browser');
  });

  it('accepts local overrides', () => {
    localStorage.setItem('calmmd.rust.markdown', '1');
    localStorage.setItem('calmmd.rust.spell', 'TRUE');
    localStorage.setItem('calmmd.pdf.engine', 'takumi');
    expect(useRustMarkdown()).toBe(true);
    expect(useRustSpell()).toBe(true);
    expect(pdfEngine()).toBe('takumi');
  });

  it('falls back to the browser engine for unknown values', () => {
    localStorage.setItem('calmmd.pdf.engine', 'latex');
    expect(pdfEngine()).toBe('browser');
  });
});
