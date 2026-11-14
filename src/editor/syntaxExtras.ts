import { tags as t } from '@lezer/highlight';
import type { Input } from '@lezer/common';
import { Subscript, Superscript, type BlockContext, type InlineContext, type Line, type MarkdownConfig } from '@lezer/markdown';
import { frontMatterLinesOf } from '../core/frontMatter';

/**
 * Editor grammar additions that match the renderer (render/extras.ts and the markdown-it
 * mark/sub/sup plugins): front matter, ==highlight==, ~sub~ and ^sup^.
 */
const frontMatter: MarkdownConfig = {
  defineNodes: [
    { name: 'FrontMatter', block: true, style: t.meta },
    { name: 'FrontMatterMark', style: t.processingInstruction },
  ],
  parseBlock: [
    {
      name: 'FrontMatter',
      before: 'FencedCode',
      parse(cx: BlockContext, line: Line) {
        if (cx.lineStart !== 0 || line.pos !== 0) return false;
        const first = line.text.trimEnd();
        if (first !== '---' && first !== '+++') return false;
        // Look ahead for the closing fence without consuming lines (the shared rule needs the
        // whole block). BlockContext keeps its input in a private field.
        const input = (cx as unknown as { input?: Input }).input;
        if (!input) return false;
        const n = frontMatterLinesOf(input.read(0, Math.min(input.length, 64 * 1024)));
        if (n === 0) return false;
        const marks = [cx.elt('FrontMatterMark', 0, line.text.length)];
        let end = line.text.length;
        for (let i = 1; i < n; i++) {
          if (!cx.nextLine()) break;
          end = cx.lineStart + line.text.length;
        }
        marks.push(cx.elt('FrontMatterMark', cx.lineStart, end));
        cx.nextLine();
        cx.addElement(cx.elt('FrontMatter', 0, end, marks));
        return true;
      },
    },
  ],
};

const PUNCT = /[\p{P}\p{S}]/u;
const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };

const highlight: MarkdownConfig = {
  defineNodes: [
    // No highlight style: Live mode styles it; Source mode shows it as plain text with marks.
    { name: 'Highlight' },
    { name: 'HighlightMark', style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: 'Highlight',
      after: 'Emphasis',
      parse(cx: InlineContext, next: number, pos: number) {
        // "==", not "===" (and not inside a longer run).
        if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61 || cx.char(pos - 1) === 61) return -1;
        const before = cx.slice(pos - 1, pos);
        const after = cx.slice(pos + 2, pos + 3);
        const sBefore = /\s|^$/.test(before);
        const sAfter = /\s|^$/.test(after);
        const pBefore = PUNCT.test(before);
        const pAfter = PUNCT.test(after);
        return cx.addDelimiter(
          HighlightDelim,
          pos,
          pos + 2,
          !sAfter && (!pAfter || sBefore || pBefore),
          !sBefore && (!pBefore || sAfter || pAfter),
        );
      },
    },
  ],
};

/** [[Wiki links]] (see core/noteLinks.ts), parsed before ordinary links. */
const wikiLink: MarkdownConfig = {
  defineNodes: [
    { name: 'WikiLink', style: t.link },
    { name: 'WikiLinkMark', style: t.processingInstruction },
  ],
  parseInline: [
    {
      name: 'WikiLink',
      before: 'Link',
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 91 || cx.char(pos + 1) !== 91) return -1;
        let end = pos + 2;
        for (; end < cx.end; end++) {
          const c = cx.char(end);
          if (c === 91 || c === 10) return -1;
          if (c === 93) break;
        }
        if (end >= cx.end - 1 || cx.char(end + 1) !== 93 || end === pos + 2) return -1;
        if (!cx.slice(pos + 2, end).trim()) return -1;
        return cx.addElement(cx.elt('WikiLink', pos, end + 2, [cx.elt('WikiLinkMark', pos, pos + 2), cx.elt('WikiLinkMark', end, end + 2)]));
      },
    },
  ],
};

export const syntaxExtras = [frontMatter, highlight, wikiLink, Subscript, Superscript];
