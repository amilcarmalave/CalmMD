import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, worthConverting } from './richPaste';

describe('rich paste', () => {
  it('turns web formatting into Markdown', () => {
    const html = '<h2>Plan</h2><p>Some <strong>bold</strong>, <em>italic</em> and a <a href="https://x.y">link</a>.</p><ul><li>one</li><li>two</li></ul>';
    expect(htmlToMarkdown(html)).toBe('## Plan\n\nSome **bold**, _italic_ and a [link](https://x.y).\n\n- one\n- two');
  });

  it('keeps tables and code', () => {
    const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table><pre><code>npm i</code></pre>';
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```\nnpm i\n```');
  });

  it('drops embedded data images', () => {
    expect(htmlToMarkdown('<p>a <img src="data:image/png;base64,AAAA"> b</p>')).toBe('a  b');
  });

  it('only converts HTML that has structure', () => {
    expect(worthConverting('<p>Some <b>bold</b></p>')).toBe(true);
    expect(worthConverting('<div style="color:#333"><span>const x = 1;</span></div>')).toBe(false);
    expect(worthConverting('')).toBe(false);
  });
});
