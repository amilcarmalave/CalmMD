import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { parseEmbed } from '../../render/embeds';
import { colorStyleOf } from '../colors';

/**
 * Live mode, step 1: decide *what* to render inline for a document range, as plain data.
 * Rendering it to CodeMirror decorations lives in decorations.ts. Keeping this pure makes the
 * reveal rules (the part users feel) unit-testable without a DOM.
 *
 * Reveal rule: an element's Markdown syntax is visible while any selection range touches the
 * element (inclusive of its edges). Line-level syntax (headings, quotes, rules) reveals while
 * the selection is on that line.
 */
export type LiveItem =
  | { kind: 'hide'; from: number; to: number }
  | { kind: 'mark'; from: number; to: number; cls: string; href?: string; style?: string }
  | { kind: 'line'; at: number; cls: string }
  | { kind: 'bullet'; from: number; to: number }
  | { kind: 'task'; from: number; to: number; checked: boolean }
  | { kind: 'image'; from: number; to: number; src: string; alt: string }
  | { kind: 'image-after'; at: number; src: string; alt: string }
  | { kind: 'embed'; from: number; to: number; src: string; alt: string }
  | { kind: 'math'; from: number; to: number; tex: string; display: boolean }
  | { kind: 'hr'; from: number; to: number };

/**
 * Whole-line replacements (rendered while the cursor is elsewhere) and companions shown under the
 * source while it's being edited, so you see the result as you type.
 */
export type BlockItem =
  | { kind: 'table'; from: number; to: number }
  | { kind: 'html'; from: number; to: number }
  | { kind: 'math'; from: number; to: number; tex: string }
  | { kind: 'diagram'; from: number; to: number; code: string }
  | { kind: 'math-preview'; at: number; tex: string }
  | { kind: 'diagram-preview'; at: number; code: string };

/** The TeX inside a BlockMath node's text. */
export function blockMathTex(text: string): string {
  return text.replace(/^\s*\$\$/, '').replace(/\$\$\s*$/, '').trim();
}

/** Code inside a fenced block, without its fence lines. */
function fenceBody(state: EditorState, from: number, to: number): string {
  const first = state.doc.lineAt(from);
  const last = state.doc.lineAt(to);
  const closed = last.number > first.number && /^\s*(`{3,}|~{3,})\s*$/.test(last.text);
  const endLine = closed ? last.number - 1 : last.number;
  if (endLine < first.number + 1) return '';
  return state.doc.sliceString(state.doc.line(first.number + 1).from, state.doc.line(endLine).to);
}

function isMermaid(state: EditorState, node: SyntaxNode): boolean {
  const info = node.getChild('CodeInfo');
  return !!info && state.sliceDoc(info.from, info.to).trim().toLowerCase() === 'mermaid';
}

function touches(state: EditorState, from: number, to: number): boolean {
  for (const r of state.selection.ranges) if (r.from <= to && r.to >= from) return true;
  return false;
}

function touchesLines(state: EditorState, from: number, to: number): boolean {
  const a = state.doc.lineAt(from).from;
  const b = state.doc.lineAt(to).to;
  return touches(state, a, b);
}

const children = (node: SyntaxNode, name: string) => node.getChildren(name);

/** `[!NOTE]` and friends at the start of a quote (GitHub alerts), as in render/extras.ts. */
const CALLOUT = /^\[!(note|tip|important|warning|caution)\]/i;

/** Inline HTML elements rendered in place when their open and close tags pair up. */
const INLINE_HTML = new Set(['kbd', 'mark', 'span', 'u', 'ins', 'sub', 'sup', 'b', 'strong', 'i', 'em', 's', 'del', 'strike', 'small', 'code']);
const OPEN_TAG = /^<([a-z][a-z0-9]*)(?:\s[^>]*)?>$/i;
const CLOSE_TAG = /^<\/([a-z][a-z0-9]*)\s*>$/i;

/** HTML blocks that are never rendered in place (the sanitiser would leave nothing to see). */
const UNSAFE_BLOCK = /^<(script|style|iframe|object|embed|form|base|meta|link|textarea|title)\b/i;

const normLabel = (s: string) => s.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Link reference definitions ([label]: url), by normalised label. Cached per syntax tree. */
const refCache = new WeakMap<object, Map<string, string>>();
function linkRefs(state: EditorState): Map<string, string> {
  const tree = syntaxTree(state);
  let map = refCache.get(tree);
  if (map) return map;
  map = new Map();
  tree.iterate({
    enter: (ref) => {
      if (ref.name === 'LinkReference') {
        const label = ref.node.getChild('LinkLabel');
        const url = ref.node.getChild('URL');
        if (label && url) {
          const key = normLabel(state.sliceDoc(label.from, label.to));
          if (!map!.has(key)) map!.set(key, state.sliceDoc(url.from, url.to));
        }
        return false;
      }
      // Definitions are top-level or inside containers, never inside inline content.
      return ref.name === 'Document' || ref.name === 'Blockquote' || ref.name === 'BulletList' || ref.name === 'OrderedList' || ref.name === 'ListItem';
    },
  });
  refCache.set(tree, map);
  return map;
}

/** Hides a mark plus one following space, as in "# " or "> ". */
function hideWithSpace(state: EditorState, out: LiveItem[], from: number, to: number) {
  const next = state.doc.sliceString(to, to + 1);
  out.push({ kind: 'hide', from, to: next === ' ' || next === '\t' ? to + 1 : to });
}

export function analyzeInline(state: EditorState, from: number, to: number): LiveItem[] {
  const out: LiveItem[] = [];
  const doc = state.doc;
  const tree = syntaxTree(state);
  const htmlTags: SyntaxNode[] = [];

  tree.iterate({
    from,
    to,
    enter: (ref) => {
      const node = ref.node;
      const name = ref.name;

      const heading = /^ATXHeading(\d)$/.exec(name);
      if (heading) {
        const line = doc.lineAt(ref.from);
        out.push({ kind: 'line', at: line.from, cls: `cm-live-heading cm-live-h${heading[1]}` });
        if (!touches(state, line.from, line.to)) {
          const marks = children(node, 'HeaderMark');
          if (marks[0]) hideWithSpace(state, out, marks[0].from, marks[0].to);
          // Closing hashes ("## Title ##"): hide them and the space before them.
          for (const m of marks.slice(1)) {
            let start = m.from;
            while (start > marks[0].to && /[ \t]/.test(doc.sliceString(start - 1, start))) start--;
            out.push({ kind: 'hide', from: start, to: m.to });
          }
        }
        return;
      }

      const setext = /^SetextHeading(\d)$/.exec(name);
      if (setext) {
        const first = doc.lineAt(ref.from);
        out.push({ kind: 'line', at: first.from, cls: `cm-live-heading cm-live-h${setext[1]}` });
        const mark = node.getChild('HeaderMark');
        if (mark) {
          const markLine = doc.lineAt(mark.from);
          out.push({ kind: 'line', at: markLine.from, cls: 'cm-live-setext-mark' });
          // The underline keeps its (short) line, so revealing it never shifts the text below.
          if (!touches(state, first.from, markLine.to)) out.push({ kind: 'hide', from: mark.from, to: mark.to });
        }
        return;
      }

      switch (name) {
        case 'Emphasis':
        case 'StrongEmphasis':
        case 'Strikethrough':
        case 'Highlight':
        case 'Subscript':
        case 'Superscript': {
          const cls = name === 'Highlight' ? 'cm-live-highlight' : name === 'Subscript' ? 'cm-live-sub' : name === 'Superscript' ? 'cm-live-sup' : null;
          if (cls) out.push({ kind: 'mark', from: ref.from, to: ref.to, cls });
          if (!touches(state, ref.from, ref.to)) {
            for (const markName of ['EmphasisMark', 'StrikethroughMark', 'HighlightMark', 'SubscriptMark', 'SuperscriptMark'])
              for (const m of children(node, markName)) out.push({ kind: 'hide', from: m.from, to: m.to });
          }
          return;
        }

        case 'Escape': {
          // "\*" shows as "*".
          if (!touches(state, ref.from, ref.to)) out.push({ kind: 'hide', from: ref.from, to: ref.from + 1 });
          return false;
        }

        case 'HardBreak': {
          // "\" at the end of a line (Shift+Enter): the break shows, the backslash doesn't.
          if (doc.sliceString(ref.from, ref.from + 1) === '\\' && !touches(state, ref.from, ref.from + 1))
            out.push({ kind: 'hide', from: ref.from, to: ref.from + 1 });
          return false;
        }

        case 'Blockquote': {
          // GitHub alerts: a tinted, titled quote. The marker shows as a small label.
          const para = node.firstChild?.nextSibling;
          const head = para?.name === 'Paragraph' ? doc.sliceString(para.from, Math.min(para.to, para.from + 16)) : '';
          const m = CALLOUT.exec(head);
          if (m && para) {
            const type = m[1].toLowerCase();
            const first = doc.lineAt(ref.from).number;
            const last = doc.lineAt(ref.to).number;
            for (let n = first; n <= last; n++)
              out.push({ kind: 'line', at: doc.line(n).from, cls: `cm-live-callout cm-live-callout-${type}${n === first ? ' cm-live-callout-first' : ''}` });
            const markerLine = doc.lineAt(para.from);
            out.push({ kind: 'mark', from: para.from + 2, to: para.from + m[0].length - 1, cls: 'cm-live-callout-label' });
            if (!touches(state, markerLine.from, markerLine.to)) {
              out.push({ kind: 'hide', from: para.from, to: para.from + 2 });
              out.push({ kind: 'hide', from: para.from + m[0].length - 1, to: para.from + m[0].length });
            }
          }
          return;
        }

        case 'FrontMatter': {
          const first = doc.lineAt(ref.from).number;
          const last = doc.lineAt(ref.to).number;
          for (let n = first; n <= last; n++) {
            let cls = 'cm-live-frontmatter';
            if (n === first) cls += ' cm-live-frontmatter-first';
            if (n === last) cls += ' cm-live-frontmatter-last';
            out.push({ kind: 'line', at: doc.line(n).from, cls });
          }
          return false;
        }

        case 'WikiLink': {
          // [[Note]] shows "Note"; [[Note|alias]] shows "alias". Mod+click follows it.
          const inner = doc.sliceString(ref.from + 2, ref.to - 2);
          const bar = inner.indexOf('|');
          const target = (bar === -1 ? inner : inner.slice(0, bar)).trim();
          const shownFrom = bar === -1 ? ref.from + 2 : ref.from + 2 + bar + 1;
          out.push({ kind: 'mark', from: shownFrom, to: ref.to - 2, cls: 'cm-live-link cm-live-wikilink', href: `wiki:${encodeURIComponent(target)}` });
          if (!touches(state, ref.from, ref.to)) {
            out.push({ kind: 'hide', from: ref.from, to: shownFrom });
            out.push({ kind: 'hide', from: ref.to - 2, to: ref.to });
          }
          return false;
        }

        case 'HTMLTag': {
          htmlTags.push(node);
          return false;
        }

        case 'InlineCode': {
          out.push({ kind: 'mark', from: ref.from, to: ref.to, cls: 'cm-live-inline-code' });
          if (!touches(state, ref.from, ref.to)) {
            for (const m of children(node, 'CodeMark')) out.push({ kind: 'hide', from: m.from, to: m.to });
          }
          return false;
        }

        case 'Link': {
          const marks = children(node, 'LinkMark');
          if (marks.length < 2) return;
          const url = node.getChild('URL');
          const label = node.getChild('LinkLabel');
          const text = doc.sliceString(marks[0].to, marks[1].from);
          const editing = touches(state, ref.from, ref.to);

          // Inline links: [text](url)
          if (marks.length >= 3 && doc.sliceString(marks[2].from, marks[2].to) === '(') {
            const href = url ? doc.sliceString(url.from, url.to) : '';
            if (marks[1].from > marks[0].to)
              out.push({ kind: 'mark', from: marks[0].to, to: marks[1].from, cls: 'cm-live-link', href });
            if (!editing) {
              out.push({ kind: 'hide', from: marks[0].from, to: marks[0].to });
              out.push({ kind: 'hide', from: marks[1].from, to: ref.to });
            }
            return; // descend: emphasis inside link text still renders
          }

          // Footnotes: [^1] is a superscript reference; "[^1]:" at a line start is its definition.
          if (!label && text.startsWith('^') && text.length > 1) {
            const isDef = doc.lineAt(ref.from).from === ref.from && doc.sliceString(ref.to, ref.to + 1) === ':';
            if (isDef) {
              out.push({ kind: 'mark', from: ref.from, to: ref.to + 1, cls: 'cm-live-footnote-def' });
            } else {
              out.push({ kind: 'mark', from: marks[0].to + 1, to: marks[1].from, cls: 'cm-live-footnote-ref' });
              if (!editing) {
                out.push({ kind: 'hide', from: ref.from, to: marks[0].to + 1 });
                out.push({ kind: 'hide', from: marks[1].from, to: ref.to });
              }
            }
            return false;
          }

          // Callout markers are handled by their Blockquote.
          if (!label && CALLOUT.test(doc.sliceString(ref.from, ref.to))) return false;

          // Reference links: [text][label], [text][] and [text] (when the label is defined).
          const key = normLabel(label && label.to - label.from > 2 ? doc.sliceString(label.from, label.to) : text);
          const href = linkRefs(state).get(key);
          if (href === undefined && !label) return; // just brackets
          if (marks[1].from > marks[0].to)
            out.push({ kind: 'mark', from: marks[0].to, to: marks[1].from, cls: 'cm-live-link', href: href ?? '' });
          if (!editing) {
            out.push({ kind: 'hide', from: marks[0].from, to: marks[0].to });
            out.push({ kind: 'hide', from: marks[1].from, to: ref.to });
          }
          return;
        }

        case 'Image': {
          const marks = children(node, 'LinkMark');
          const url = node.getChild('URL');
          if (!url || marks.length < 2) return false;
          const alt = doc.sliceString(marks[0].to, marks[1].from);
          const src = doc.sliceString(url.from, url.to);
          if (parseEmbed(src)) {
            // Videos: a click-to-load card. While editing, the source alone (cards are tall).
            if (!touches(state, ref.from, ref.to)) out.push({ kind: 'embed', from: ref.from, to: ref.to, src, alt });
            return false;
          }
          // While editing the source, keep the picture visible right after it, so revealing
          // adds one line instead of swapping a tall image for text.
          if (touches(state, ref.from, ref.to)) out.push({ kind: 'image-after', at: ref.to, src, alt });
          else out.push({ kind: 'image', from: ref.from, to: ref.to, src, alt });
          return false;
        }

        case 'Autolink': {
          const url = node.getChild('URL');
          if (url) out.push({ kind: 'mark', from: url.from, to: url.to, cls: 'cm-live-link', href: doc.sliceString(url.from, url.to) });
          if (!touches(state, ref.from, ref.to))
            for (const m of children(node, 'LinkMark')) out.push({ kind: 'hide', from: m.from, to: m.to });
          return false;
        }

        case 'URL': {
          // Bare autolinks (GFM). URLs inside links and images are handled above.
          const parent = node.parent?.name;
          if (parent !== 'Link' && parent !== 'Image' && parent !== 'Autolink')
            out.push({ kind: 'mark', from: ref.from, to: ref.to, cls: 'cm-live-link', href: doc.sliceString(ref.from, ref.to) });
          return;
        }

        case 'ListMark': {
          const item = node.parent;
          const list = item?.parent?.name;
          const task = item?.getChild('Task');
          if (list === 'BulletList') {
            if (task) {
              // Task items show only the checkbox.
              const marker = task.getChild('TaskMarker');
              if (!touches(state, ref.from, marker ? marker.to : ref.to)) hideWithSpace(state, out, ref.from, ref.to);
            } else if (!touches(state, ref.from, ref.to + 1)) {
              out.push({ kind: 'bullet', from: ref.from, to: ref.to });
            }
          } else if (list === 'OrderedList') {
            out.push({ kind: 'mark', from: ref.from, to: ref.to, cls: 'cm-live-ol-mark' });
          }
          return;
        }

        case 'TaskMarker': {
          const checked = doc.sliceString(ref.from + 1, ref.from + 2).toLowerCase() === 'x';
          if (checked) out.push({ kind: 'line', at: doc.lineAt(ref.from).from, cls: 'cm-live-task-done' });
          if (!touches(state, ref.from, ref.to)) out.push({ kind: 'task', from: ref.from, to: ref.to, checked });
          return;
        }

        case 'QuoteMark': {
          const line = doc.lineAt(ref.from);
          const before = doc.sliceString(line.from, ref.from);
          // One line decoration per line, carrying the nesting depth ("> > text" is depth 2).
          if (!before.includes('>')) {
            const depth = (/^(?:\s*>)+/.exec(line.text)?.[0].match(/>/g)?.length ?? 1);
            out.push({ kind: 'line', at: line.from, cls: `cm-live-quote cm-live-quote-${Math.min(depth, 3)}` });
          }
          if (!touches(state, line.from, line.to)) hideWithSpace(state, out, ref.from, ref.to);
          return;
        }

        case 'HorizontalRule': {
          const line = doc.lineAt(ref.from);
          if (!touches(state, line.from, line.to)) out.push({ kind: 'hr', from: ref.from, to: ref.to });
          return false;
        }

        case 'FencedCode':
        case 'CodeBlock': {
          const first = doc.lineAt(ref.from).number;
          const last = doc.lineAt(ref.to).number;
          for (let n = first; n <= last; n++) {
            let cls = 'cm-live-codeblock';
            if (n === first) cls += ' cm-live-codeblock-first';
            if (n === last) cls += ' cm-live-codeblock-last';
            if (name === 'FencedCode' && (n === first || n === last)) cls += ' cm-live-fence';
            out.push({ kind: 'line', at: doc.line(n).from, cls });
          }
          // Away from the block, the fences fade to empty padding lines and the language becomes a
          // small label. The lines stay, so revealing them doesn't move anything.
          if (name === 'FencedCode') {
            const info = node.getChild('CodeInfo');
            if (!touchesLines(state, ref.from, ref.to)) {
              if (info) out.push({ kind: 'mark', from: info.from, to: info.to, cls: 'cm-live-code-lang' });
              const codeMarks = children(node, 'CodeMark');
              const open = codeMarks[0];
              const close = codeMarks.length > 1 ? codeMarks[codeMarks.length - 1] : null;
              if (open) out.push({ kind: 'hide', from: open.from, to: info ? info.from : doc.lineAt(open.from).to });
              if (info) out.push({ kind: 'hide', from: info.to, to: doc.lineAt(info.from).to });
              if (close && doc.lineAt(close.from).number === last && last !== first) out.push({ kind: 'hide', from: doc.line(last).from, to: doc.line(last).to });
            }
          }
          return false;
        }

        case 'Table': {
          // Rendered as a block widget (see analyzeBlocks). While editing, show the source in monospace.
          if (touchesLines(state, ref.from, ref.to)) {
            const first = doc.lineAt(ref.from).number;
            const last = doc.lineAt(ref.to).number;
            for (let n = first; n <= last; n++) out.push({ kind: 'line', at: doc.line(n).from, cls: 'cm-live-table-src' });
          }
          return false;
        }

        case 'InlineMath': {
          if (touches(state, ref.from, ref.to)) {
            out.push({ kind: 'mark', from: ref.from, to: ref.to, cls: 'cm-live-math-src' });
          } else {
            const display = doc.sliceString(ref.from, ref.from + 2) === '$$';
            const m = display ? 2 : 1;
            out.push({ kind: 'math', from: ref.from, to: ref.to, tex: doc.sliceString(ref.from + m, ref.to - m), display });
          }
          return false;
        }

        case 'BlockMath': {
          // Rendered as a block widget when the cursor is away (analyzeBlocks). While editing, the
          // source is shown in monospace with a live preview below it.
          if (touchesLines(state, ref.from, ref.to)) {
            const first = doc.lineAt(ref.from).number;
            const last = doc.lineAt(ref.to).number;
            for (let n = first; n <= last; n++) out.push({ kind: 'line', at: doc.line(n).from, cls: 'cm-live-math-src' });
          }
          return false;
        }

        case 'HTMLBlock':
        case 'CommentBlock':
        case 'ProcessingInstructionBlock':
          return false;
      }
      return;
    },
  });
  pairInlineHtml(state, htmlTags, out);
  blankGaps(state, from, to, out);
  return out;
}

/**
 * Blank lines between blocks draw as a short paragraph gap, as in the preview, so Enter (which
 * writes one to start a new paragraph) doesn't leave a full empty line. The line under the cursor
 * keeps its full height. Blank lines inside code, lists and quotes are left alone.
 */
function blankGaps(state: EditorState, from: number, to: number, out: LiveItem[]) {
  const doc = state.doc;
  const tree = syntaxTree(state);
  for (let pos = from; pos <= to; ) {
    const line = doc.lineAt(pos);
    if (line.number > 1 && line.number < doc.lines && !line.text.trim() && tree.resolve(line.from, 1).name === 'Document' && !touches(state, line.from, line.to))
      out.push({ kind: 'line', at: line.from, cls: 'cm-live-gap' });
    pos = line.to + 1;
  }
}

/** <kbd>x</kbd>, <mark>x</mark>, …: hide the tags and style the content, like the preview does. */
function pairInlineHtml(state: EditorState, tags: SyntaxNode[], out: LiveItem[]) {
  const open = new Map<string, SyntaxNode[]>();
  for (const tag of tags) {
    const text = state.sliceDoc(tag.from, tag.to);
    const o = OPEN_TAG.exec(text);
    const c = o ? null : CLOSE_TAG.exec(text);
    const name = (o?.[1] ?? c?.[1])?.toLowerCase();
    if (!name || !INLINE_HTML.has(name)) continue;
    if (o) {
      const list = open.get(name) ?? [];
      list.push(tag);
      open.set(name, list);
      continue;
    }
    const start = open.get(name)?.pop();
    // Both tags must sit in the same block (a paragraph, heading or table cell).
    if (!start || start.parent?.from !== tag.parent?.from) continue;
    // Colours (<span style="color">, <mark style="background">) carry over, filtered to safe values.
    const style = colorStyleOf(state.sliceDoc(start.from, start.to)) || undefined;
    if (tag.from > start.to) out.push({ kind: 'mark', from: start.to, to: tag.from, cls: `cm-live-html cm-live-html-${name}`, style });
    if (!touches(state, start.from, tag.to)) {
      out.push({ kind: 'hide', from: start.from, to: start.to });
      out.push({ kind: 'hide', from: tag.from, to: tag.to });
    }
  }
}

/** For an HTML block that opens a tag it doesn't close, the sibling block that closes it. */
function htmlBlockEnd(state: EditorState, node: SyntaxNode): SyntaxNode | null {
  const text = state.sliceDoc(node.from, node.to);
  const tag = /^<([a-z][a-z0-9-]*)/i.exec(text)?.[1].toLowerCase();
  if (!tag) return null; // closing tags and declarations stay as source
  const closeRe = new RegExp(`</${tag}\\s*>`, 'i');
  const openRe = new RegExp(`<${tag}[\\s>]`, 'gi');
  let depth = (text.match(openRe)?.length ?? 1) - (text.match(new RegExp(`</${tag}\\s*>`, 'gi'))?.length ?? 0);
  if (depth <= 0 || /\/>\s*$/.test(text) || /^<(br|hr|img|input|source|wbr|col|area|track|meta|link)\b/i.test(text)) return node;
  for (let sib = node.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.name !== 'HTMLBlock' && sib.name !== 'Paragraph') continue;
    const t = state.sliceDoc(sib.from, sib.to);
    depth += (t.match(openRe)?.length ?? 0) - (t.match(new RegExp(`</${tag}\\s*>`, 'gi'))?.length ?? 0);
    if (depth <= 0 && closeRe.test(t)) return sib;
  }
  return null;
}

/**
 * Block-level replacements (tables). These span whole lines, so CodeMirror needs them from a
 * state field rather than a view plugin, and they're computed for the whole document.
 */
export function analyzeBlocks(state: EditorState): BlockItem[] {
  const out: BlockItem[] = [];
  const doc = state.doc;
  let skipTo = -1;
  syntaxTree(state).iterate({
    enter: (ref) => {
      if (ref.from < skipTo) return false;
      // Raw HTML blocks render in place (sanitised, like the preview), grouped with the blocks
      // up to their closing tag so <details>…</details> with Markdown inside works.
      if (ref.name === 'HTMLBlock' && ref.node.parent?.name === 'Document') {
        const text = doc.sliceString(ref.from, ref.to);
        const end = UNSAFE_BLOCK.test(text) ? null : htmlBlockEnd(state, ref.node);
        if (end) {
          const from = doc.lineAt(ref.from).from;
          const to = doc.lineAt(end.to).to;
          if (!touches(state, from, to)) out.push({ kind: 'html', from, to });
          skipTo = end.to;
        }
        return false;
      }
      if (ref.name === 'Table' || ref.name === 'BlockMath' || (ref.name === 'FencedCode' && isMermaid(state, ref.node))) {
        const from = doc.lineAt(ref.from).from;
        const to = doc.lineAt(ref.to).to;
        const editing = touches(state, from, to);
        if (ref.name === 'Table') {
          out.push({ kind: 'table', from, to }); // editable in place (tableWidget.ts)
        } else if (ref.name === 'BlockMath') {
          const tex = blockMathTex(doc.sliceString(ref.from, ref.to));
          out.push(editing ? { kind: 'math-preview', at: to, tex } : { kind: 'math', from, to, tex });
        } else {
          const code = fenceBody(state, ref.from, ref.to);
          out.push(editing ? { kind: 'diagram-preview', at: to, code } : { kind: 'diagram', from, to, code });
        }
        return false;
      }
      // Tables can only live in these containers.
      if (ref.name !== 'Document' && ref.name !== 'BulletList' && ref.name !== 'OrderedList' && ref.name !== 'ListItem' && ref.name !== 'Blockquote')
        return false;
      return;
    },
  });
  return out;
}
