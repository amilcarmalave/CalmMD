// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { pdfEngine, takumiFontWeight, useRustMarkdown, useRustSpell } from './rustFlags';

const keys = ['calmmd.rust.markdown', 'calmmd.rust.spell', 'calmmd.pdf.engine', 'calmmd.takumi.fontWeight'];

afterEach(() => {
  for (const key of keys) localStorage.removeItem(key);
});

describe('Rust migration flags', () => {
  it('uses Rust Markdown, Rust spellchecking and Takumi by default', () => {
    expect(useRustMarkdown()).toBe(true);
    expect(useRustSpell()).toBe(true);
    expect(pdfEngine()).toBe('takumi');
    expect(takumiFontWeight()).toBe(350);
  });

  it('allows the TypeScript renderer as an explicit fallback', () => {
    localStorage.setItem('calmmd.rust.markdown', '0');
    expect(useRustMarkdown()).toBe(false);
  });

  it('allows the OS spellchecker as an explicit fallback', () => {
    localStorage.setItem('calmmd.rust.spell', '0');
    expect(useRustSpell()).toBe(false);
  });

  it('allows the browser PDF engine as an explicit fallback', () => {
    localStorage.setItem('calmmd.pdf.engine', 'browser');
    expect(pdfEngine()).toBe('browser');
  });

  it('accepts local overrides', () => {
    localStorage.setItem('calmmd.rust.markdown', '1');
    localStorage.setItem('calmmd.rust.spell', 'TRUE');
    localStorage.setItem('calmmd.pdf.engine', 'browser');
    expect(useRustMarkdown()).toBe(true);
    expect(useRustSpell()).toBe(true);
    expect(pdfEngine()).toBe('browser');
    localStorage.setItem('calmmd.takumi.fontWeight', '375');
    expect(takumiFontWeight()).toBe(375);
  });

  it('falls back to Takumi for unknown engine values', () => {
    localStorage.setItem('calmmd.pdf.engine', 'latex');
    expect(pdfEngine()).toBe('takumi');
  });
});
