// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createRenderer } from './markdown';

const r = createRenderer();
const dom = (md: string) => {
  const div = document.createElement('div');
  div.innerHTML = r.render(md, { docPath: null });
  return div;
};

describe('front matter', () => {
  it('renders as a front-matter block, not a rule and a heading', () => {
    const d = dom('---\ntitle: Kitchen\ntags: [a]\n---\n\n# Real title\n');
    const fm = d.querySelector('pre.front-matter')!;
    expect(fm.textContent).toBe('title: Kitchen\ntags: [a]');
    expect([fm.getAttribute('data-line-start'), fm.getAttribute('data-line-end')]).toEqual(['0', '4']);
    expect(d.querySelector('hr')).toBeNull();
    expect([...d.querySelectorAll('h1,h2')].map((h) => h.textContent)).toEqual(['Real title']);
  });
  it('leaves a leading rule alone when nothing closes it', () => {
    const d = dom('---\n\nText\n');
    expect(d.querySelector('.front-matter')).toBeNull();
    expect(d.querySelector('hr')).not.toBeNull();
  });
});

describe('callouts', () => {
  it('turns > [!NOTE] into a titled callout', () => {
    const d = dom('> [!NOTE]\n> Read this.\n');
    const q = d.querySelector('blockquote')!;
    expect(q.className).toBe('callout callout-note');
    expect(q.querySelector('.callout-title')!.textContent).toBe('Note');
    expect([...q.querySelectorAll('p:not(.callout-title)')].map((p) => p.textContent?.trim()).filter(Boolean)).toEqual(['Read this.']);
    expect(q.textContent).not.toContain('[!NOTE]');
  });
  it('keeps text on the marker line', () => {
    const d = dom('> [!warning] Mind the gap\n');
    const q = d.querySelector('blockquote.callout-warning')!;
    expect(q.querySelector('p:not(.callout-title)')!.textContent).toBe('Mind the gap');
  });
  it('leaves ordinary quotes alone', () => {
    expect(dom('> [link] text\n').querySelector('blockquote')!.className).toBe('');
  });
});

describe('inline extras', () => {
  it('supports highlight, subscript and superscript', () => {
    const d = dom('==hi== H~2~O x^2^ ~~gone~~');
    expect(d.querySelector('mark')!.textContent).toBe('hi');
    expect(d.querySelector('sub')!.textContent).toBe('2');
    expect(d.querySelector('sup')!.textContent).toBe('2');
    expect(d.querySelector('s')!.textContent).toBe('gone');
  });
});

describe('wiki links', () => {
  it('renders [[Note]], aliases and headings as wiki: links', () => {
    const d = dom('See [[Ideas]], [[Projects/Thesis#Plan|the plan]] and [[ ]].');
    const links = [...d.querySelectorAll('a.wikilink')].map((a) => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([
      ['wiki:Ideas', 'Ideas'],
      ['wiki:Projects%2FThesis%23Plan', 'the plan'],
    ]);
    expect(d.textContent).toContain('[[ ]]');
  });
  it('escapes the text', () => {
    expect(dom('[[<b>x</b>]]').querySelector('a.wikilink')!.innerHTML).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
});
