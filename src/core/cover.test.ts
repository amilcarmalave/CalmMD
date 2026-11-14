import { describe, expect, it } from 'vitest';
import { coverFromDoc, coverHtml, frontMatterFields } from './cover';

const now = new Date(2026, 10, 13);

describe('cover page', () => {
  it('reads simple front matter fields', () => {
    expect(frontMatterFields('---\ntitle: "My Thesis"\nauthor: Ada\ntags: [a]\n---\n# X')).toEqual({ title: 'My Thesis', author: 'Ada', tags: '[a]' });
    expect(frontMatterFields('# No front matter')).toEqual({});
  });

  it('prefers front matter, then the first heading and today', () => {
    const fm = coverFromDoc('---\ntitle: Report\nsubtitle: Q4\nauthor: Ada\ndate: 2026\n---\n# Other', 'file', now);
    expect(fm).toEqual({ title: 'Report', subtitle: 'Q4', author: 'Ada', date: '2026' });
    const plain = coverFromDoc('Intro\n\n# The **Real** Title\n', 'file', now, 'Remembered');
    expect(plain.title).toBe('The Real Title');
    expect(plain.author).toBe('Remembered');
    expect(plain.date).toBe(now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
    expect(coverFromDoc('just text', 'Untitled 1', now).title).toBe('Untitled 1');
  });

  it('renders escaped HTML and skips empty lines', () => {
    const html = coverHtml({ title: 'A <b>', subtitle: '', author: 'Ada', date: '' });
    expect(html).toContain('<p class="cover-title" role="heading" aria-level="1">A &lt;b&gt;</p>');
    expect(html).not.toContain('cover-subtitle');
    expect(html).toContain('<p class="cover-author">Ada</p>');
  });
});
