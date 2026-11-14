import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { mathSyntax } from '../mathSyntax';
import { syntaxExtras } from '../syntaxExtras';
import { analyzeBlocks, analyzeInline, type LiveItem } from './analyze';

describe('live mode: paragraph gaps', () => {
  const gaps = (src: string) =>
    run(src)
      .items.filter((i) => i.kind === 'line' && i.cls === 'cm-live-gap')
      .map((i) => (i as { at: number }).at);
  it('marks blank lines between blocks, except where the cursor is', () => {
    expect(gaps('one\n\ntwo\n\nthree‸')).toEqual([4, 9]);
    expect(gaps('one\n‸\ntwo')).toEqual([]);
  });
  it('leaves blank lines inside code and lists alone', () => {
    expect(gaps('‸```\na\n\nb\n```\nend')).toEqual([]);
    expect(gaps('‸- a\n\n- b\nend')).toEqual([]);
  });
});

describe('live mode: extended syntax', () => {
  const marks = (src: string, cls: string) =>
    run(src).items.filter((i): i is Extract<LiveItem, { kind: 'mark' }> => i.kind === 'mark' && i.cls.includes(cls));

  it('renders highlight, sub and superscript, hiding their marks', () => {
    expect(visible('==hi== H~2~O x^2^ end')).toBe('hi H2O x2 end');
    expect(marks('==hi== end', 'cm-live-highlight')).toHaveLength(1);
  });
  it('hides escape backslashes away from the cursor', () => {
    expect(visible('a \\*literal\\* b')).toBe('a *literal* b');
    expect(visible('a \\‸*literal\\* b')).toBe('a \\*literal* b');
  });
  it('hides the backslash of a hard line break away from the cursor', () => {
    expect(visible('one\\\ntwo\n\nend')).toBe('one\ntwo\n\nend');
    expect(visible('one‸\\\ntwo')).toBe('one\\\ntwo');
  });
  it('renders reference links with their definition as the target', () => {
    const src = 'See [the site][ref] and [ref].\n\n[ref]: https://example.com';
    expect(visible(src).split('\n')[0]).toBe('See the site and ref.');
    expect(marks(src, 'cm-live-link').map((m) => m.href)).toEqual(['https://example.com', 'https://example.com', 'https://example.com']);
  });
  it('keeps undefined [brackets] as text', () => {
    expect(visible('just [brackets] here')).toBe('just [brackets] here');
  });
  it('shows footnote references as superscripts', () => {
    expect(visible('Note[^1] end\n\n[^1]: Text')).toBe('Note1 end\n\n[^1]: Text');
    expect(marks('Note[^1] end', 'cm-live-footnote-ref')).toHaveLength(1);
  });
  it('renders paired inline HTML and hides the tags', () => {
    expect(visible('Press <kbd>Ctrl</kbd> and <mark>this</mark>.')).toBe('Press Ctrl and this.');
    expect(marks('Press <kbd>Ctrl</kbd>.', 'cm-live-html-kbd')).toHaveLength(1);
    expect(visible('Lone <kbd> tag')).toBe('Lone <kbd> tag');
  });
  it('renders wiki links with their alias and a wiki: target', () => {
    expect(visible('See [[Ideas]] and [[Projects/Plan#Goals|the plan]].')).toBe('See Ideas and the plan.');
    expect(marks('See [[Projects/Plan#Goals|the plan]]', 'cm-live-wikilink')[0].href).toBe('wiki:Projects%2FPlan%23Goals');
    expect(visible('See [[Id‸eas]]')).toBe('See [[Ideas]]');
  });
  it('renders coloured spans and highlights with a safe style', () => {
    const src = 'a <span style="color: #e5484d">red</span> <mark style="background: rgba(74, 222, 128, 0.34)">hl</mark> b';
    expect(visible(src)).toBe('a red hl b');
    expect(marks(src, 'cm-live-html-span')[0].style).toBe('color: #e5484d');
    expect(marks(src, 'cm-live-html-mark')[0].style).toBe('background-color: rgba(74, 222, 128, 0.34)');
    expect(marks('<span style="position: fixed">x</span>', 'cm-live-html-span')[0].style).toBeUndefined();
  });
  it('turns > [!NOTE] into a callout with a label', () => {
    const { items } = run('> [!NOTE]\n> Body\n\nAfter');
    const lines = items.filter((i) => i.kind === 'line' && i.cls.includes('cm-live-callout-note'));
    expect(lines).toHaveLength(2);
    expect(visible('> [!NOTE]\n> Body\n\nAfter')).toBe('NOTE\nBody\n\nAfter');
  });
  it('marks nested quote depth', () => {
    const { items } = run('> one\n> > two\n\nx');
    const quoteLines = items.filter((i) => i.kind === 'line' && i.cls.startsWith('cm-live-quote')).map((i) => (i as { cls: string }).cls);
    expect(quoteLines).toEqual(['cm-live-quote cm-live-quote-1', 'cm-live-quote cm-live-quote-2']);
  });
  it('styles front matter as a block instead of a rule and heading', () => {
    const { items } = run('---\ntitle: A\n---\n\nText');
    expect(items.filter((i) => i.kind === 'line' && i.cls.includes('cm-live-frontmatter'))).toHaveLength(3);
    expect(items.some((i) => i.kind === 'hr' || (i.kind === 'line' && i.cls.includes('heading')))).toBe(false);
  });
  it('fades code fences to a language label away from the block', () => {
    expect(visible('```js\nlet a;\n```\n\nx')).toBe('js\nlet a;\n\n\nx');
    expect(visible('```js\nlet ‸a;\n```\n\nx')).toBe('```js\nlet a;\n```\n\nx');
  });
});

describe('live mode: HTML blocks', () => {
  const blocks = (src: string) => analyzeBlocks(state(src));
  it('groups <details> with the Markdown inside it', () => {
    const src = '<details>\n<summary>S</summary>\n\nHidden **content**.\n</details>\n\nAfter‸';
    expect(blocks(src)).toEqual([{ kind: 'html', from: 0, to: src.indexOf('</details>') + 10 }]);
  });
  it('renders a self-contained block', () => {
    expect(blocks('<div align="center">Hi</div>\n\nx‸')).toEqual([{ kind: 'html', from: 0, to: 28 }]);
  });
  it('shows the source while the cursor is inside', () => {
    expect(blocks('<div>H‸i</div>\n\nx')).toEqual([]);
  });
  it('never renders unsafe or unclosed blocks', () => {
    expect(blocks('<script>alert(1)</script>\n\nx‸')).toEqual([]);
    expect(blocks('<div>\nopen forever\n\nx‸')).toEqual([]);
  });
});

/** `‸` marks the cursor position in the test document. */
function state(src: string) {
  const at = src.indexOf('‸');
  const doc = at === -1 ? src : src.slice(0, at) + src.slice(at + 1);
  const s = EditorState.create({
    doc,
    selection: EditorSelection.cursor(at === -1 ? doc.length : at),
    extensions: [markdown({ base: markdownLanguage, extensions: [mathSyntax, ...syntaxExtras] })],
  });
  ensureSyntaxTree(s, s.doc.length, 5000);
  return s;
}

const run = (src: string) => {
  const s = state(src);
  return { s, items: analyzeInline(s, 0, s.doc.length) };
};
/** The visible text after applying hide/replace items (widgets shown as tokens). */
function visible(src: string): string {
  const { s, items } = run(src);
  const replaces = items
    .filter((i): i is Extract<LiveItem, { from: number; to: number }> => 'from' in i && i.kind !== 'mark')
    .sort((a, b) => a.from - b.from);
  let out = '';
  let pos = 0;
  for (const r of replaces) {
    if (r.from < pos) continue;
    out += s.doc.sliceString(pos, r.from);
    out += r.kind === 'hide' ? '' : r.kind === 'bullet' ? '•' : r.kind === 'task' ? (r.checked ? '☑' : '☐') : r.kind === 'hr' ? '<hr>' : `<img ${(r as { src: string }).src}>`;
    pos = r.to;
  }
  return out + s.doc.sliceString(pos);
}

describe('headings', () => {
  it('hide # when the cursor is elsewhere, and style the line', () => {
    const { items } = run('# Title\n\nbody‸');
    expect(items).toContainEqual({ kind: 'line', at: 0, cls: 'cm-live-heading cm-live-h1' });
    expect(visible('# Title ##\n\nbody‸')).toBe('Title\n\nbody');
  });
  it('reveal # when the cursor is on the heading line', () => {
    expect(visible('# Ti‸tle\n\nbody')).toBe('# Title\n\nbody');
  });
  it('keeps the line style while revealed (no layout jump)', () => {
    expect(run('## Ti‸tle').items).toContainEqual({ kind: 'line', at: 0, cls: 'cm-live-heading cm-live-h2' });
  });
});

describe('inline formatting', () => {
  it('hides emphasis marks away from the cursor', () => {
    expect(visible('a *em* **st** ~~del~~ `code`\n‸')).toBe('a em st del code\n');
  });
  it('reveals only the element the cursor touches', () => {
    expect(visible('a *e‸m* **st**')).toBe('a *em* st');
    // Touching the edge counts.
    expect(visible('a *em*‸ **st**')).toBe('a *em* st');
  });
  it('reveals inside a selection', () => {
    const s = EditorState.create({
      doc: '*a* *b* *c*',
      selection: EditorSelection.range(1, 5),
      extensions: [markdown({ base: markdownLanguage })],
    });
    ensureSyntaxTree(s, s.doc.length, 5000);
    const hidden = analyzeInline(s, 0, s.doc.length).filter((i) => i.kind === 'hide');
    expect(hidden.map((h) => 'from' in h && h.from)).toEqual([8, 10]); // only *c*
  });
  it('styles inline code even when revealed', () => {
    expect(run('`x‸`').items.some((i) => i.kind === 'mark' && i.cls === 'cm-live-inline-code')).toBe(true);
  });
});

describe('links and images', () => {
  it('shows only link text, with the href attached', () => {
    const { items } = run('see [the docs](https://e.com/x) now\n‸');
    expect(visible('see [the docs](https://e.com/x) now\n‸')).toBe('see the docs now\n');
    expect(items).toContainEqual({ kind: 'mark', from: 5, to: 13, cls: 'cm-live-link', href: 'https://e.com/x' });
  });
  it('reveals the full link syntax under the cursor', () => {
    expect(visible('see [the d‸ocs](u) now')).toBe('see [the docs](u) now');
  });
  it('replaces images with a widget unless the cursor is in them', () => {
    expect(visible('![alt text](img/a.png)\n‸')).toBe('<img img/a.png>\n');
    expect(visible('![alt ‸text](img/a.png)')).toBe('![alt text](img/a.png)');
    // While editing, the picture stays visible after the source.
    expect(run('![alt ‸text](a.png)').items).toContainEqual({ kind: 'image-after', at: 18, src: 'a.png', alt: 'alt text' });
    const img = run('![alt text](a.png)\n‸').items.find((i) => i.kind === 'image');
    expect(img).toMatchObject({ alt: 'alt text', src: 'a.png' });
  });
  it('marks bare URLs and autolinks', () => {
    expect(visible('<https://a.b> and https://c.d\n‸')).toBe('https://a.b and https://c.d\n');
    const links = run('https://c.d\n‸').items.filter((i) => i.kind === 'mark' && i.cls === 'cm-live-link');
    expect(links).toHaveLength(1);
  });
  it('renders reference links and keeps their definitions visible', () => {
    expect(visible('[a][ref]\n\n[ref]: https://x\n‸')).toBe('a\n\n[ref]: https://x\n');
  });
});

describe('lists, tasks, quotes, rules', () => {
  it('turns bullets into dots and tasks into checkboxes', () => {
    expect(visible('- one\n- [ ] todo\n- [x] done\n\n‸')).toBe('• one\n☐ todo\n☑ done\n\n');
  });
  it('reveals the bullet when the cursor is right after it', () => {
    expect(visible('- ‸one')).toBe('- one');
  });
  it('reveals task syntax when the cursor is on the marker', () => {
    expect(visible('- [‸x] done')).toBe('- [x] done');
  });
  it('keeps ordered list numbers', () => {
    expect(visible('1. one\n2. two\n‸')).toBe('1. one\n2. two\n');
  });
  it('hides quote marks except on the cursor line', () => {
    const v = visible('> one\n> tw‸o');
    expect(v).toBe('one\n> two');
  });
  it('renders horizontal rules', () => {
    expect(visible('a\n\n---\n\nb‸')).toBe('a\n\n<hr>\n\nb');
    expect(visible('a\n\n--‸-\n\nb')).toBe('a\n\n---\n\nb');
  });
});

describe('code', () => {
  it('styles fenced code lines and does not render Markdown inside', () => {
    const { items } = run('```md\n# not a heading\n*x*\n```\n‸');
    const lines = items.filter((i) => i.kind === 'line').map((i) => i.kind === 'line' && i.cls);
    expect(lines).toEqual([
      'cm-live-codeblock cm-live-codeblock-first cm-live-fence',
      'cm-live-codeblock',
      'cm-live-codeblock',
      'cm-live-codeblock cm-live-codeblock-last cm-live-fence',
    ]);
    // Only the fence lines are hidden; the Markdown inside the block stays as typed.
    expect(visible('```md\n# not a heading\n*x*\n```\n‸')).toBe('md\n# not a heading\n*x*\n\n');
  });
});

describe('math, diagrams and embeds', () => {
  it('renders inline math away from the cursor and shows its source when touched', () => {
    expect(run('Euler $e^{i\\pi}$ here\n‸').items).toContainEqual({ kind: 'math', from: 6, to: 16, tex: 'e^{i\\pi}', display: false });
    const editing = run('Euler $e^{i\\pi‸}$ here').items;
    expect(editing.some((i) => i.kind === 'math')).toBe(false);
    expect(editing).toContainEqual({ kind: 'mark', from: 6, to: 16, cls: 'cm-live-math-src' });
  });

  it('renders block math as a block, with a live preview while editing', () => {
    const away = analyzeBlocks(state('$$\nx^2\n$$\n\ntext‸'));
    expect(away).toEqual([{ kind: 'math', from: 0, to: 9, tex: 'x^2' }]);
    const editing = analyzeBlocks(state('$$\nx^‸2\n$$\n\ntext'));
    expect(editing).toEqual([{ kind: 'math-preview', at: 9, tex: 'x^2' }]);
  });

  it('renders Mermaid fences as diagrams, other fences stay code', () => {
    const src = '```mermaid\ngraph TD\nA-->B\n```\n\n```js\nx\n```\n\nend‸';
    expect(analyzeBlocks(state(src))).toEqual([{ kind: 'diagram', from: 0, to: 29, code: 'graph TD\nA-->B' }]);
    expect(analyzeBlocks(state('```mermaid\ngraph ‸TD\n```'))[0]).toMatchObject({ kind: 'diagram-preview', code: 'graph TD' });
  });

  it('turns video links into embeds', () => {
    expect(run('![Talk](https://youtu.be/dQw4w9WgXcQ)\n‸').items).toContainEqual({
      kind: 'embed',
      from: 0,
      to: 37,
      src: 'https://youtu.be/dQw4w9WgXcQ',
      alt: 'Talk',
    });
  });
});

describe('tables', () => {
  const table = '| a | b |\n|---|---|\n| 1 | 2 |';
  it('renders tables as blocks when the cursor is outside', () => {
    const s = state('intro\n\n' + table + '\n\nafter‸');
    expect(analyzeBlocks(s)).toEqual([{ kind: 'table', from: 7, to: 7 + table.length }]);
  });
  it('shows table source when the cursor is inside', () => {
    const s = state('intro\n\n| a | ‸b |\n|---|---|\n| 1 | 2 |');
    expect(analyzeBlocks(s)).toEqual([]);
    const lines = analyzeInline(s, 0, s.doc.length).filter((i) => i.kind === 'line' && i.cls !== 'cm-live-gap');
    expect(lines).toHaveLength(3);
  });
});
