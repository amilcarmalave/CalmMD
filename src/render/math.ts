import katex from 'katex';
import type { MarkdownIt, StateBlock, StateInline } from 'markdown-it';
import { isMathBlockStart, scanInlineMath } from '../core/mathScan';

/** KaTeX to an HTML string. Errors render as readable red source, never throw. */
export function renderMath(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: 'htmlAndMathml',
    strict: 'ignore',
    trust: false, // no \href, \url or \includegraphics side effects
  });
}

/**
 * `$…$` inline and `$$…$$` block math. KaTeX output goes through env.trusted (see markdown.ts)
 * rather than the HTML sanitiser, which would strip its MathML.
 */
export function mathPlugin(md: MarkdownIt) {
  md.inline.ruler.before('escape', 'math_inline', (state: StateInline, silent: boolean) => {
    const r = scanInlineMath(state.src, state.pos, state.posMax);
    if (r === -1) return false;
    if (!silent) {
      const open = r.display ? 2 : 1;
      const tok = state.push('math_inline', 'math', 0);
      tok.content = state.src.slice(state.pos + open, r.to - open);
      tok.markup = r.display ? '$$' : '$';
    }
    state.pos = r.to;
    return true;
  });

  md.block.ruler.before(
    'fence',
    'math_block',
    (state: StateBlock, startLine: number, endLine: number, silent: boolean) => {
      const start = state.bMarks[startLine] + state.tShift[startLine];
      const max = state.eMarks[startLine];
      if (state.sCount[startLine] - state.blkIndent >= 4) return false;
      const first = state.src.slice(start, max);
      if (!isMathBlockStart(first)) return false;
      if (silent) return true;

      let content: string;
      let line = startLine;
      const rest = first.slice(2);
      const sameLine = rest.trimEnd().endsWith('$$') && rest.trim().length > 2;
      if (sameLine) {
        content = rest.trimEnd().slice(0, -2);
      } else {
        const lines = [rest];
        let closed = false;
        while (++line < endLine) {
          const text = state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
          if (text.trimEnd().endsWith('$$')) {
            lines.push(text.trimEnd().slice(0, -2));
            closed = true;
            break;
          }
          lines.push(state.src.slice(state.bMarks[line], state.eMarks[line]));
        }
        if (!closed) line = endLine - 1;
        content = lines.join('\n');
      }
      const tok = state.push('math_block', 'math', 0);
      tok.block = true;
      tok.content = content.trim();
      tok.map = [startLine, line + 1];
      tok.markup = '$$';
      state.line = line + 1;
      return true;
    },
    { alt: ['paragraph', 'reference', 'blockquote', 'list'] },
  );

  md.renderer.rules.math_inline = (tokens, idx, _o, env) =>
    trusted(env, renderMath(tokens[idx].content, tokens[idx].markup === '$$'));
  md.renderer.rules.math_block = (tokens, idx, _o, env, self) =>
    `<div class="math-block"${self.renderAttrs(tokens[idx])}>${trusted(env, renderMath(tokens[idx].content, true))}</div>\n`;
}

/** Stores trusted HTML and returns a placeholder that survives sanitising. */
export function trusted(env: unknown, html: string): string {
  const e = env as { trusted?: string[]; trustedNonce?: string };
  if (!e.trusted) return ''; // no slot store (shouldn't happen via createRenderer)
  e.trusted.push(html);
  return `<span data-trusted="${e.trustedNonce}-${e.trusted.length - 1}"></span>`;
}
