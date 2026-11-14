import { tags as t } from '@lezer/highlight';
import type { BlockContext, InlineContext, Line, MarkdownConfig } from '@lezer/markdown';
import { isMathBlockStart, scanInlineMath } from '../core/mathScan';

/**
 * Math for the editor grammar (InlineMath, BlockMath), using the same scanning rules as the
 * renderer (core/mathScan.ts), so the editor and preview always agree on what's math.
 */
export const mathSyntax: MarkdownConfig = {
  defineNodes: [
    { name: 'InlineMath', style: t.special(t.content) },
    { name: 'InlineMathMark', style: t.processingInstruction },
    { name: 'BlockMath', block: true, style: t.special(t.content) },
    { name: 'BlockMathMark', style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: 'InlineMath',
      before: 'Escape',
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 36) return -1;
        // Scan within the inline section's text. Offsets are relative to cx.offset.
        const rel = pos - cx.offset;
        const r = scanInlineMath(cx.text, rel, cx.end - cx.offset);
        if (r === -1) return -1;
        const end = cx.offset + r.to;
        const m = r.display ? 2 : 1;
        return cx.addElement(
          cx.elt('InlineMath', pos, end, [cx.elt('InlineMathMark', pos, pos + m), cx.elt('InlineMathMark', end - m, end)]),
        );
      },
    },
  ],
  parseBlock: [
    {
      name: 'BlockMath',
      before: 'FencedCode',
      parse(cx: BlockContext, line: Line) {
        if (line.indent >= 4 || !isMathBlockStart(line.text)) return false;
        const start = cx.lineStart + line.pos;
        const marks = [cx.elt('BlockMathMark', start, start + 2)];
        const rest = line.text.slice(line.pos + 2);
        let end: number;
        if (rest.trimEnd().endsWith('$$') && rest.trim().length > 2) {
          const close = cx.lineStart + line.pos + 2 + rest.trimEnd().length - 2;
          marks.push(cx.elt('BlockMathMark', close, close + 2));
          end = cx.lineStart + line.text.length;
          cx.nextLine();
        } else {
          end = cx.lineStart + line.text.length;
          while (cx.nextLine()) {
            end = cx.lineStart + line.text.length;
            const trimmed = line.text.trimEnd();
            if (trimmed.endsWith('$$')) {
              const close = cx.lineStart + trimmed.length - 2;
              marks.push(cx.elt('BlockMathMark', close, close + 2));
              cx.nextLine();
              break;
            }
          }
        }
        cx.addElement(cx.elt('BlockMath', start, end, marks));
        return true;
      },
    },
  ],
};
