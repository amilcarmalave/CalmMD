// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { scanInlineMath } from '../core/mathScan';
import { _seedDiagram } from './diagrams';
import { isEmbeddableUrl, parseEmbed } from './embeds';
import { createRenderer } from './markdown';

const r = createRenderer();
const dom = (md: string) => {
  const d = document.createElement('div');
  d.innerHTML = r.render(md, { docPath: '/n/doc.md', resolveAsset: (p) => 'asset://' + p });
  return d;
};

describe('inline math scanning', () => {
  const at0 = (s: string) => scanInlineMath(s, 0);
  it('follows Pandoc rules', () => {
    expect(at0('$x^2$ more')).toEqual({ to: 5, display: false });
    expect(at0('$ x$')).toBe(-1); // space after opening
    expect(at0('$x $')).toBe(-1); // space before closing
    expect(at0('$5 and $10')).toBe(-1); // prices
    expect(at0('$$\\sum$$')).toEqual({ to: 8, display: true });
    expect(at0('$a \\$ b$')).toEqual({ to: 8, display: false }); // escaped dollar inside
    expect(at0('$a\n\nb$')).toBe(-1); // never across paragraphs
    expect(at0('$$')).toBe(-1);
  });
});

describe('math rendering', () => {
  it('renders inline and block math with KaTeX, keeping MathML', () => {
    const d = dom('Euler: $e^{i\\pi}+1=0$\n\n$$\n\\int_0^1 x\\,dx\n$$\n\nCosts $5 and $10.');
    expect(d.querySelectorAll('.katex')).toHaveLength(2);
    expect(d.querySelector('.katex-display')).not.toBeNull();
    expect(d.querySelector('math')).not.toBeNull(); // MathML survived sanitising
    expect(d.textContent).toContain('Costs $5 and $10.');
    const block = d.querySelector<HTMLElement>('.math-block')!;
    expect([block.dataset.lineStart, block.dataset.lineEnd]).toEqual(['2', '5']);
  });

  it('shows errors instead of throwing', () => {
    const d = dom('$\\frac{1}{$');
    expect(d.querySelector('.katex-error')).not.toBeNull();
  });

  it('does not let raw HTML forge trusted slots', () => {
    const d = dom('$x$ <span data-trusted="0"></span> <span data-trusted="abc-0"></span>');
    expect(d.querySelectorAll('.katex')).toHaveLength(1);
  });
});

describe('diagrams', () => {
  it('uses cached Mermaid SVG and shows source while pending', () => {
    _seedDiagram('graph TD; A-->B', 'light', { svg: '<svg class="mmd"><style>.a{fill:red}</style><g/></svg>' });
    const ready = dom('```mermaid\ngraph TD; A-->B\n```');
    expect(ready.querySelector('.mermaid-block svg.mmd style')).not.toBeNull(); // trusted SVG kept its <style>
    expect(ready.querySelector<HTMLElement>('.mermaid-block')!.dataset.lineStart).toBe('0');
    _seedDiagram('graph LR; bad', 'light', { error: 'Parse error on line 1' });
    const bad = dom('```mermaid\ngraph LR; bad\n```');
    expect(bad.querySelector('.diagram-error')!.textContent).toContain('Parse error');
  });
});

describe('embeds', () => {
  it('recognises YouTube, Vimeo and video files', () => {
    expect(parseEmbed('https://youtu.be/dQw4w9WgXcQ?t=42')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 42 });
    expect(parseEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')).toEqual({ kind: 'youtube', id: 'dQw4w9WgXcQ', start: 90 });
    expect(parseEmbed('https://youtube.com/shorts/abcdefgh12')).toMatchObject({ kind: 'youtube', id: 'abcdefgh12' });
    expect(parseEmbed('https://vimeo.com/76979871')).toEqual({ kind: 'vimeo', id: '76979871' });
    expect(parseEmbed('clips/demo.mp4')).toEqual({ kind: 'video', src: 'clips/demo.mp4' });
    expect(parseEmbed('https://example.com/pic.png')).toBeNull();
    expect(isEmbeddableUrl(' https://youtu.be/dQw4w9WgXcQ ')).toBe(true);
    expect(isEmbeddableUrl('see https://youtu.be/dQw4w9WgXcQ')).toBe(false);
  });

  it('renders click-to-load cards and local video players', () => {
    const d = dom('![Launch talk](https://youtu.be/dQw4w9WgXcQ)\n\n![](clips/demo.mp4)');
    const card = d.querySelector<HTMLElement>('.embed-card')!;
    expect(card.dataset.embedKind).toBe('youtube');
    expect(card.querySelector('.embed-title')!.textContent).toBe('Launch talk');
    expect(d.querySelector('iframe')).toBeNull(); // nothing loads until clicked
    expect(d.querySelector('video')!.getAttribute('src')).toBe('asset:///n/clips/demo.mp4');
  });
});
