// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createExporter } from '../app/exporter';
import type { BaseTheme } from './build';
import { DEFAULT_PDF } from './build';
import { takumiOptions } from './takumi';
import { createMemoryPlatform } from '../platform/memory';
import { pdfEngine } from '../core/rustFlags';
import type { TakumiPdfOptions } from './takumi';

describe('native Takumi export', () => {
  it('routes takumi PDF exports through the platform command', async () => {
    localStorage.setItem('calmmd.pdf.engine', 'takumi');
    expect(pdfEngine()).toBe('takumi');

    const takumiPdf = vi.fn(async (_html: string, _out: string, _options: TakumiPdfOptions) => {});
    const platform = { ...createMemoryPlatform(), takumiPdf };
    const exporter = createExporter({
      platform,
      current: () => ({ text: '# Notes', path: '/n/Notes.md', name: 'Notes.md' }),
      theme: () => ({ base: 'paper' as BaseTheme, css: null }),
      notify: () => {},
    });

    await exporter.exportPdfData(
      { text: '# Notes', path: '/n/Notes.md', name: 'Notes.md' },
      '/out/Notes.pdf',
    );
    expect(takumiPdf).toHaveBeenCalledTimes(1);
    const [html, out, options] = takumiPdf.mock.calls[0];
    expect(html).toContain('<h1');
    expect(out).toBe('/out/Notes.pdf');
    expect(options).toEqual(takumiOptions({ title: 'Notes', pdf: DEFAULT_PDF }));
    localStorage.removeItem('calmmd.pdf.engine');
  });
});
