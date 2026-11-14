import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { mathSyntax } from './mathSyntax';

function nodes(doc: string, names: string[]) {
  const s = EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage, extensions: [mathSyntax] })] });
  const out: string[] = [];
  ensureSyntaxTree(s, doc.length, 5000)!.iterate({
    enter: (n) => {
      if (names.includes(n.name)) out.push(`${n.name}:${doc.slice(n.from, n.to)}`);
    },
  });
  return out;
}

describe('math in the editor grammar', () => {
  it('finds inline math, respecting the same rules as the renderer', () => {
    expect(nodes('a $x^2$ b, *$y$*', ['InlineMath'])).toEqual(['InlineMath:$x^2$', 'InlineMath:$y$']);
    expect(nodes('It costs $5 and $10.', ['InlineMath'])).toEqual([]);
  });

  it('finds block math, multi-line and single-line', () => {
    expect(nodes('p\n\n$$\na+b\n$$\n\n$$c$$\n', ['BlockMath'])).toEqual(['BlockMath:$$\na+b\n$$', 'BlockMath:$$c$$']);
  });

  it('does not parse Markdown inside math', () => {
    expect(nodes('$a*b*c$', ['Emphasis'])).toEqual([]);
  });

  it('runs to the end of the document if a block is never closed', () => {
    expect(nodes('$$\nx\ny', ['BlockMath'])).toEqual(['BlockMath:$$\nx\ny']);
  });
});
