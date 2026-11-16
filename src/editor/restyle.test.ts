import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { syntaxExtras } from './syntaxExtras';
import { restyle, setColorStyle, toggleHighlight, toggleStyle, type StyleChange } from './restyle';

/** "«" and "»" mark the selection. Returns the result in the same notation, or null when restyle passes. */
function run(src: string, change: StyleChange): string | null {
  const a = src.indexOf('«');
  const b = src.indexOf('»') - 1;
  const doc = src.replace('«', '').replace('»', '');
  let state = EditorState.create({ doc, selection: EditorSelection.single(a, b), extensions: [markdown({ base: markdownLanguage, extensions: syntaxExtras })] });
  ensureSyntaxTree(state, state.doc.length, 5000);
  state = state.update({}).state;
  const spec = restyle(state, change);
  if (!spec) return null;
  const next = state.update(spec).state;
  const r = next.selection.main;
  const t = next.doc.toString();
  return t.slice(0, r.from) + '«' + t.slice(r.from, r.to) + '»' + t.slice(r.to);
}

const RED = '#e5484d';
const BLUE = '#3b82e0';
const red = (s: string) => `<span style="color: ${RED}">${s}</span>`;
const blue = (s: string) => `<span style="color: ${BLUE}">${s}</span>`;

describe('restyle: colour over existing colour', () => {
  it('recolours part of a coloured word without crossing tags', () => {
    expect(run(`plain ${red('re«d wo»rd')} plain`, setColorStyle('color', BLUE))).toBe(`plain ${red('re')}${blue('«d wo»')}${red('rd')} plain`);
  });
  it('colours a selection that starts in plain text and ends inside a coloured run', () => {
    expect(run(`pla«in ${red('re»d')}`, setColorStyle('color', BLUE))).toBe(`pla${blue('«in re»')}${red('d')}`);
  });
  it('colours across a coloured run, replacing it', () => {
    expect(run(`«a ${red('b')} c»`, setColorStyle('color', BLUE))).toBe(blue('«a b c»'));
  });
  it('removes colour from part of a run', () => {
    expect(run(red('a «b» c'), setColorStyle('color', null))).toBe(`${red('a')} «b» ${red('c')}`);
  });
});

describe('restyle: bold and italic over existing formatting', () => {
  it('bolds a selection that overlaps bold text', () => {
    expect(run('pla«in **bo»ld** end', toggleStyle('bold'))).toBe('pla**«in bo»ld** end');
  });
  it('unbolds part of a bold phrase', () => {
    expect(run('**one «two» three**', toggleStyle('bold'))).toBe('**one** «two» **three**');
  });
  it('italicises inside bold with proper nesting', () => {
    expect(run('**bold «word» here**', toggleStyle('italic'))).toBe('**bold _«word»_ here**');
  });
  it('bolds coloured text without breaking the tags', () => {
    expect(run(`a ${red('«red»')} b`, toggleStyle('bold'))).toBe(`a ${red('**«red»**')} b`);
  });
  it('colours bold text across its edge, with tags nested properly', () => {
    expect(run('**bo«ld** pl»ain', setColorStyle('color', RED))).toBe(`**bo${red('«ld')}**${red(' pl»')}ain`);
  });
  it('keeps links and code whole', () => {
    expect(run('see [the «li»nk](https://x.y) now', toggleStyle('bold'))).toBe('see **«[the link](https://x.y)»** now');
    expect(run('run `np«m i»` now', toggleStyle('bold'))).toBe('run **«`npm i`»** now');
  });
  it('uses * for italic inside a word', () => {
    expect(run('in«side»out', toggleStyle('italic'))).toBe('in*«side»*out');
  });
  it('toggles the == highlight', () => {
    expect(run('a ==«b c»== d', toggleHighlight)).toBe('a «b c» d');
    expect(run('a «b» c', toggleHighlight)).toBe('a ==«b»== c');
  });
});

describe('restyle: selections over several lines', () => {
  const ORANGE = '#e2781f';
  const PURPLE = '#9061f0';
  const orange = (s: string) => `<span style="color: ${ORANGE}">${s}</span>`;
  const purple = (s: string) => `<span style="color: ${PURPLE}">${s}</span>`;
  const doc = `«Hello\n\n${orange('My name is john')}\n\nnice to meet you»`;

  it('colours each paragraph, replacing the colour that was there', () => {
    expect(run(doc, setColorStyle('color', PURPLE))).toBe(`${purple('«Hello')}\n\n${purple('My name is john')}\n\n${purple('nice to meet you»')}`);
  });
  it('bolds each paragraph and keeps the coloured one coloured', () => {
    expect(run(doc, toggleStyle('bold'))).toBe(`**«Hello**\n\n${orange('**My name is john**')}\n\n**nice to meet you»**`);
  });
  it('unbolds when every selected line is already bold', () => {
    expect(run('«**one**\n\n**two**»', toggleStyle('bold'))).toBe('«one\n\ntwo»');
  });
  it('leaves heading, list and quote marks outside the style', () => {
    expect(run('«## Title\n- item\n> quote»', toggleStyle('bold'))).toBe('## **«Title**\n- **item**\n> **quote»**');
  });
  it('skips code blocks', () => {
    expect(run('«before\n```\ncode\n```\nafter»', toggleStyle('bold'))).toBe('**«before**\n```\ncode\n```\n**after»**');
  });
});
