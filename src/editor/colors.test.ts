import { EditorSelection, EditorState, type TransactionSpec } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { applyColor, colorStyleOf, colorValue } from './colors';

/** "[" and "]" mark the selection, "‸" a cursor. Returns the result in the same notation. */
function apply(src: string, op: (s: EditorState) => TransactionSpec): string {
  let doc = src;
  let sel: EditorSelection;
  const c = doc.indexOf('‸');
  if (c !== -1) {
    doc = doc.replace('‸', '');
    sel = EditorSelection.single(c);
  } else {
    const a = doc.indexOf('[');
    const b = doc.indexOf(']', a) - 1;
    doc = doc.replace('[', '').replace(/\](?!.*\])/, '');
    sel = EditorSelection.single(a, b);
  }
  const state = EditorState.create({ doc, selection: sel });
  const next = state.update(op(state)).state;
  const r = next.selection.main;
  const t = next.doc.toString();
  return r.empty ? t.slice(0, r.from) + '‸' + t.slice(r.from) : t.slice(0, r.from) + '[' + t.slice(r.from, r.to) + ']' + t.slice(r.to);
}

const RED = '#e5484d';
const BLUE = '#3b82e0';
const GREEN = 'rgba(74, 222, 128, 0.34)';

describe('applyColor', () => {
  it('wraps the selection in a coloured span or mark', () => {
    expect(apply('a [word] b', (s) => applyColor(s, 'text', RED))).toBe(`a <span style="color: ${RED}">[word]</span> b`);
    expect(apply('a [word] b', (s) => applyColor(s, 'highlight', GREEN))).toBe(`a <mark style="background: ${GREEN}">[word]</mark> b`);
  });

  it('keeps surrounding spaces outside the colour', () => {
    expect(apply('a[ word ]b', (s) => applyColor(s, 'text', RED))).toBe(`a <span style="color: ${RED}">[word]</span> b`);
  });

  it('recolours an already coloured selection instead of nesting', () => {
    const src = `a <span style="color: ${RED}">[word]</span> b`;
    expect(apply(src, (s) => applyColor(s, 'text', BLUE))).toBe(`a <span style="color: ${BLUE}">[word]</span> b`);
  });

  it('recolours when the selection includes the tags', () => {
    const src = `a [<span style="color: ${RED}">word</span>] b`;
    expect(apply(src, (s) => applyColor(s, 'text', BLUE))).toBe(`a <span style="color: ${BLUE}">[word]</span> b`);
  });

  it('removes the colour', () => {
    expect(apply(`<span style="color: ${RED}">[word]</span>`, (s) => applyColor(s, 'text', null))).toBe('[word]');
    expect(apply(`<mark style="background: ${GREEN}">[word]</mark>`, (s) => applyColor(s, 'highlight', null))).toBe('[word]');
    expect(apply('==[word]==', (s) => applyColor(s, 'highlight', null))).toBe('[word]');
    expect(apply('plain [word]', (s) => applyColor(s, 'highlight', null))).toBe('plain [word]');
  });

  it('switches between ==default== and coloured highlights', () => {
    expect(apply('==[word]==', (s) => applyColor(s, 'highlight', GREEN))).toBe(`<mark style="background: ${GREEN}">[word]</mark>`);
    expect(apply(`<mark style="background: ${GREEN}">[word]</mark>`, (s) => applyColor(s, 'highlight', 'default'))).toBe('==[word]==');
  });

  it('puts the cursor inside new tags for an empty selection', () => {
    expect(apply('a ‸', (s) => applyColor(s, 'text', RED))).toBe(`a <span style="color: ${RED}">‸</span>`);
  });
});

describe('custom colours', () => {
  it('resolves palette ids and custom hex colours', () => {
    expect(colorValue('text', 'red')).toBe('#e5484d');
    expect(colorValue('text', '#AA00FF')).toBe('#aa00ff');
    expect(colorValue('highlight', '#ff0000')).toBe('rgba(255, 0, 0, 0.4)');
    expect(colorValue('text', 'nope')).toBeUndefined();
  });
});

describe('colorStyleOf', () => {
  it('keeps only colour and background with safe values', () => {
    expect(colorStyleOf(`<span style="color: ${RED}">`)).toBe(`color: ${RED}`);
    expect(colorStyleOf(`<mark style="background: ${GREEN}">`)).toBe(`background-color: ${GREEN}`);
    expect(colorStyleOf('<span style="color: red; font-size: 40px">')).toBe('color: red');
    expect(colorStyleOf('<span style="color: url(javascript:x)">')).toBe('');
    expect(colorStyleOf('<span style="background: expression(alert(1))">')).toBe('');
    expect(colorStyleOf('<span>')).toBe('');
  });
});
