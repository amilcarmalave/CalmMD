// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import type { Platform } from '../platform/types';
import type { MarkdownRenderOptions } from '../markdown/types';
import { createRustRenderer } from './rustMarkdown';
import { _seedDiagram } from './diagrams';
import { useRustMarkdown } from '../core/rustFlags';

function platformWith(html: string): Platform {
  const platform = createMemoryPlatform();
  return {
    ...platform,
    markdownRender: async (text: string, options?: MarkdownRenderOptions) => ({
      html: html.replace('{text}', text),
      sourceMap: [],
      options,
    }),
  } as unknown as Platform;
}

const render = (html: string, text = '', env = {}) =>
  createRustRenderer(platformWith(html)).render(text, { docPath: null, ...env });

describe('Rust-backed preview renderer', () => {
  it('sanitises Rust HTML and keeps source-line attributes', async () => {
    const html = await render(
      '<h1 data-line-start="0" data-line-end="1" onclick="alert(1)">Hello</h1><script>alert(2)</script>',
    );
    expect(html).toContain('<h1 data-line-start="0" data-line-end="1">Hello</h1>');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
  });

  it('resolves relative images and applies alt sizing', async () => {
    const html = await render('<p><img src="pic.png" alt="A picture|240x120|center"></p>', '', {
      docPath: '/notes/doc.md',
      resolveAsset: (path: string) => 'asset://localhost/' + encodeURIComponent(path),
    });
    expect(html).toContain('src="asset://localhost/%2Fnotes%2Fpic.png"');
    expect(html).toContain('width="240"');
    expect(html).toContain('height="120"');
    expect(html).toContain('img-center');
    expect(html).toContain('alt="A picture"');
  });

  it('turns page-break markers into page breaks', async () => {
    const html = await render('<p data-line-start="2" data-line-end="3">---pagebreak---</p>');
    expect(html).toContain('<div class="page-break" aria-hidden="true" data-line-start="2" data-line-end="3"></div>');
  });

  it('injects ready Mermaid diagrams as trusted SVG', async () => {
    _seedDiagram('graph TD; A-->B;', 'light', { svg: '<svg><g><title>ok</title></g></svg>' });
    const html = await render(
      '<pre class="code-block" data-line-start="4" data-lang="mermaid"><code>graph TD; A--&gt;B;</code></pre>',
    );
    expect(html).toContain('class="mermaid-block"');
    expect(html).toContain('<svg>');
  });

  it('is the default renderer with the TypeScript path still available as a fallback', () => {
    expect(useRustMarkdown()).toBe(true);
  });
});
