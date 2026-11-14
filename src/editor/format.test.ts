import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  clearFormatting,
  insertBlock,
  insertLink,
  setHeading,
  TABLE_TEMPLATE,
  toggleCodeBlock,
  toggleInline,
  toggleLineKind,
} from './format';

/**
 * Test notation: "[" and "]" mark a selection, "‸" a cursor (exactly one per test string).
 * Returns the resulting text in the same notation.
 */
function apply(src: string, op: (s: EditorState) => TransactionSpec): string {
  let doc = src;
  let sel: EditorSelection;
  const c = doc.indexOf('‸');
  if (c !== -1) {
    doc = doc.replace('‸', '');
    sel = EditorSelection.single(c);
  } else {
    const a = doc.indexOf('[');
    const b = doc.indexOf(']') - 1;
    doc = doc.replace('[', '').replace(']', '');
    sel = EditorSelection.single(a, b);
  }
  const state = EditorState.create({ doc, selection: sel, extensions: EditorState.allowMultipleSelections.of(true) });
  const next = state.update(op(state)).state;
  const r = next.selection.main;
  const text = next.doc.toString();
  if (r.empty) return text.slice(0, r.from) + '‸' + text.slice(r.from);
  return text.slice(0, r.from) + '[' + text.slice(r.from, r.to) + ']' + text.slice(r.to);
}

describe('toggleInline', () => {
  const bold = (s: EditorState) => toggleInline(s, '**');
  it('wraps and unwraps a selection', () => {
    expect(apply('a [word] b', bold)).toBe('a **[word]** b');
    expect(apply('a **[word]** b', bold)).toBe('a [word] b');
    expect(apply('a [**word**] b', bold)).toBe('a [word] b');
  });
  it('does not swallow surrounding spaces', () => {
    expect(apply('a[ word ]b', bold)).toBe('a **[word]** b');
  });
  it('inserts a pair at an empty cursor', () => {
    expect(apply('a ‸ b', bold)).toBe('a **‸** b');
  });
  it('does not mistake bold for italic', () => {
    expect(apply('**[x]**', (s) => toggleInline(s, '*'))).toBe('***[x]***');
  });
});

describe('setHeading', () => {
  it('sets, changes and toggles heading levels', () => {
    expect(apply('Ti‸tle', (s) => setHeading(s, 2))).toBe('## Ti‸tle');
    expect(apply('## Ti‸tle', (s) => setHeading(s, 1))).toBe('# Ti‸tle');
    expect(apply('## Ti‸tle', (s) => setHeading(s, 2))).toBe('Ti‸tle');
    expect(apply('### Ti‸tle', (s) => setHeading(s, 0))).toBe('Ti‸tle');
  });
});

describe('toggleLineKind', () => {
  it('puts the cursor after a new marker, so typing goes into the item', () => {
    expect(apply('‸', (s) => toggleLineKind(s, 'bullet'))).toBe('- ‸');
    expect(apply('‸', (s) => toggleLineKind(s, 'task'))).toBe('- [ ] ‸');
    expect(apply('‸one', (s) => toggleLineKind(s, 'ordered'))).toBe('1. ‸one');
    expect(apply('‸', (s) => toggleLineKind(s, 'quote'))).toBe('> ‸');
    expect(apply('‸', (s) => setHeading(s, 2))).toBe('## ‸');
  });
  it('adds and removes bullets across lines', () => {
    expect(apply('[one\ntwo]', (s) => toggleLineKind(s, 'bullet'))).toBe('- [one\n- two]');
    expect(apply('[- one\n- two]', (s) => toggleLineKind(s, 'bullet'))).toBe('[one\ntwo]');
  });
  it('converts between kinds and numbers ordered lists', () => {
    // A replaced prefix keeps the selection covering whole lines.
    expect(apply('[- one\n- two]', (s) => toggleLineKind(s, 'ordered'))).toBe('[1. one\n2. two]');
    expect(apply('[1. one\n2. two]', (s) => toggleLineKind(s, 'task'))).toBe('[- [ ] one\n- [ ] two]');
  });
  it('keeps indentation and skips blank lines', () => {
    expect(apply('[  one\n\n  two]', (s) => toggleLineKind(s, 'bullet'))).toBe('[  - one\n\n  - two]');
  });
  it('toggles quotes', () => {
    expect(apply('[a\nb]', (s) => toggleLineKind(s, 'quote'))).toBe('> [a\n> b]');
    expect(apply('[> a\n> b]', (s) => toggleLineKind(s, 'quote'))).toBe('[a\nb]');
  });
  it('ignores a line the selection only touches at its start', () => {
    expect(apply('[a\n]b', (s) => toggleLineKind(s, 'bullet'))).toBe('- [a\n]b');
  });
});

describe('links and blocks', () => {
  it('wraps text in a link and selects the url placeholder', () => {
    expect(apply('see [docs] now', insertLink)).toBe('see [docs]([url]) now');
  });
  it('turns a selected URL into the link target', () => {
    expect(apply('[https://e.com]', insertLink)).toBe('[‸](https://e.com)');
  });
  it('inserts blocks on their own lines', () => {
    expect(apply('para‸', (s) => insertBlock(s, '---', 3))).toBe('para\n\n---‸\n');
    expect(apply('a\n\n‸\n\nb', (s) => insertBlock(s, TABLE_TEMPLATE, [2, 10]))).toBe(
      'a\n\n| [Column 1] | Column 2 |\n| --- | --- |\n|  |  |\n\nb',
    );
  });
  it('fences selected lines', () => {
    expect(apply('[x = 1]', toggleCodeBlock)).toBe('```‸\nx = 1\n```');
  });
  it('clears formatting', () => {
    expect(apply('[**a** _b_ `c` ~~d~~]', clearFormatting)).toBe('[a b c d]');
  });
});
