// @vitest-environment jsdom
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it } from 'vitest';
import { lineBreakEnter, paragraphEnter } from './paragraphs';

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

/** `|` marks the cursor. */
function setup(doc: string) {
  const at = doc.indexOf('|');
  const state = EditorState.create({ doc: doc.replace('|', ''), selection: { anchor: at }, extensions: [markdown({ base: markdownLanguage })] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  view = new EditorView({ state });
  return view;
}
const shown = (v: EditorView) => {
  const d = v.state.doc.toString();
  const h = v.state.selection.main.head;
  return d.slice(0, h) + '|' + d.slice(h);
};

describe('Enter in a paragraph', () => {
  it('starts a new paragraph at the end of one', () => {
    const v = setup('Hello world|');
    expect(paragraphEnter(v)).toBe(true);
    expect(shown(v)).toBe('Hello world\n\n|');
  });
  it('splits a paragraph in the middle', () => {
    const v = setup('Hello |world');
    expect(paragraphEnter(v)).toBe(true);
    expect(shown(v)).toBe('Hello \n\n|world');
  });
  it('works on the second line of a paragraph', () => {
    const v = setup('one\ntwo|\n\nnext');
    expect(paragraphEnter(v)).toBe(true);
    expect(shown(v)).toBe('one\ntwo\n\n|\n\nnext');
  });
  it('leaves lists, headings, quotes, code and blank lines to the usual Enter', () => {
    for (const doc of ['- item|', '1. item|', '# Title|', '> quote|', '```\ncode|\n```', 'text\n\n|', '|']) {
      expect(paragraphEnter(setup(doc)), doc).toBe(false);
    }
  });
});

describe('Shift+Enter in a paragraph', () => {
  it('writes a hard line break GitHub understands', () => {
    const v = setup('Line one|');
    expect(lineBreakEnter(v)).toBe(true);
    expect(shown(v)).toBe('Line one\\\n|');
  });
  it('is left alone outside paragraphs', () => {
    expect(lineBreakEnter(setup('- item|'))).toBe(false);
  });
});
