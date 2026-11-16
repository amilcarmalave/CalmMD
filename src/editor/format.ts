import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { restyle, toggleHighlight, toggleStyle } from './restyle';

/**
 * Formatting operations as pure functions: (state) → transaction spec. Commands dispatch them,
 * and tests call them directly. Every operation handles multiple selections.
 */

/** Toggles an inline marker (** for bold, _ for italic, ~~, `) around each selection. */
export function toggleInline(state: EditorState, marker: string): TransactionSpec {
  // A selection over existing formatting: restyle the runs so marks never cross (editor/restyle.ts).
  const change =
    marker === '**' ? toggleStyle('bold') : marker === '_' || marker === '*' ? toggleStyle('italic') : marker === '~~' ? toggleStyle('strike') : marker === '==' ? toggleHighlight : null;
  const restyled = change && restyle(state, change);
  if (restyled) return restyled;
  const m = marker.length;
  return state.changeByRange((range) => {
    const before = state.sliceDoc(range.from - m, range.from);
    const after = state.sliceDoc(range.to, range.to + m);
    const inner = state.sliceDoc(range.from, range.to);

    // Already wrapped just outside the selection: unwrap.
    if (before === marker && after === marker && !(marker === '*' && state.sliceDoc(range.from - 2, range.from) === '**')) {
      return {
        changes: [
          { from: range.from - m, to: range.from },
          { from: range.to, to: range.to + m },
        ],
        range: EditorSelection.range(range.from - m, range.to - m),
      };
    }
    // The selection includes the markers: unwrap.
    if (inner.length >= 2 * m && inner.startsWith(marker) && inner.endsWith(marker)) {
      return {
        changes: { from: range.from, to: range.to, insert: inner.slice(m, inner.length - m) },
        range: EditorSelection.range(range.from, range.to - 2 * m),
      };
    }
    if (range.empty) {
      // Toggling with an empty selection: insert a pair and put the cursor between.
      return {
        changes: { from: range.from, insert: marker + marker },
        range: EditorSelection.cursor(range.from + m),
      };
    }
    // Wrap without swallowing surrounding whitespace ("**word** " not "**word **").
    const lead = inner.length - inner.trimStart().length;
    const trail = inner.length - inner.trimEnd().length;
    const from = range.from + lead;
    const to = range.to - trail;
    return {
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      range: EditorSelection.range(from + m, to + m),
    };
  });
}

/** Line numbers (1-based) touched by the selection, without duplicates. */
function selectedLines(state: EditorState): number[] {
  const set = new Set<number>();
  for (const r of state.selection.ranges) {
    const a = state.doc.lineAt(r.from).number;
    // A selection ending at the start of a line doesn't include that line.
    const endLine = state.doc.lineAt(r.to);
    const b = r.to > r.from && endLine.from === r.to ? endLine.number - 1 : endLine.number;
    for (let n = a; n <= Math.max(a, b); n++) set.add(n);
  }
  return [...set].sort((x, y) => x - y);
}

const HEADING = /^(\s{0,3})(#{1,6})\s+/;
const LIST = /^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;
const QUOTE = /^(\s*)>\s?/;

/** Sets heading level (0 = paragraph). Applying the current level again toggles it off. */
export function setHeading(state: EditorState, level: number): TransactionSpec {
  const lines = selectedLines(state).map((n) => state.doc.line(n));
  const allSame = level > 0 && lines.every((l) => HEADING.exec(l.text)?.[2].length === level);
  const changes = lines.map((l) => {
    const m = HEADING.exec(l.text);
    const indent = m?.[1] ?? '';
    const prefix = allSame || level === 0 ? '' : '#'.repeat(level) + ' ';
    return { from: l.from, to: l.from + (m ? m[0].length : 0), insert: indent + prefix };
  });
  return prefixed(state, changes);
}

/** Line prefix changes, with cursors at the start of a line moved after the new prefix so typing goes into it. */
function prefixed(state: EditorState, changes: { from: number; to?: number; insert: string }[]): TransactionSpec {
  const set = state.changes(changes);
  return { changes: set, selection: state.selection.map(set, 1), scrollIntoView: true };
}

export type LineKind = 'bullet' | 'ordered' | 'task' | 'quote';

const prefixOf = (kind: LineKind, i: number) =>
  kind === 'bullet' ? '- ' : kind === 'ordered' ? `${i + 1}. ` : kind === 'task' ? '- [ ] ' : '> ';

function hasKind(text: string, kind: LineKind): boolean {
  if (kind === 'quote') return QUOTE.test(text);
  const m = LIST.exec(text);
  if (!m) return false;
  const p = m[2];
  if (kind === 'task') return /\[[ xX]\]/.test(p);
  if (kind === 'ordered') return /^\d/.test(p);
  return /^[-*+]/.test(p) && !/\[[ xX]\]/.test(p);
}

/**
 * Toggles a line prefix on every selected line. If all non-empty lines already have that kind,
 * it's removed. Otherwise lines are converted (bullet ↔ ordered ↔ task), and numbering restarts at 1.
 */
export function toggleLineKind(state: EditorState, kind: LineKind): TransactionSpec {
  const lines = selectedLines(state).map((n) => state.doc.line(n));
  const content = lines.filter((l) => l.text.trim() !== '' || lines.length === 1);
  const remove = content.length > 0 && content.every((l) => hasKind(l.text, kind));
  let i = 0;
  const changes = content.map((l) => {
    if (kind === 'quote') {
      const q = QUOTE.exec(l.text);
      if (remove) return { from: l.from, to: l.from + (q ? q[0].length : 0), insert: q?.[1] ?? '' };
      return { from: l.from, insert: '> ' };
    }
    const m = LIST.exec(l.text);
    const indent = m?.[1] ?? /^\s*/.exec(l.text)![0];
    const insert = remove ? indent : indent + prefixOf(kind, i++);
    return { from: l.from, to: l.from + (m ? m[0].length : indent.length), insert };
  });
  return prefixed(state, changes);
}

/** `[text](url)`: selects "url" for typing. A selected URL becomes the target with the cursor in the text. */
export function insertLink(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    if (/^(https?:\/\/|mailto:|www\.)\S+$/.test(text)) {
      const insert = `[](${text})`;
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.cursor(range.from + 1) };
    }
    const insert = `[${text}](url)`;
    const urlStart = range.from + text.length + 3;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: text ? EditorSelection.range(urlStart, urlStart + 3) : EditorSelection.cursor(range.from + 1),
    };
  });
}

export function insertImage(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const alt = state.sliceDoc(range.from, range.to);
    const insert = `![${alt}](image.png)`;
    const at = range.from + alt.length + 4;
    return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(at, at + 9) };
  });
}

/**
 * Inserts a block on its own lines, with a blank line before and after where needed.
 * `cursor` is an offset into `block`, or [from, to] to select a placeholder.
 */
export function insertBlock(state: EditorState, block: string, cursor: number | [number, number]): TransactionSpec {
  const r = state.selection.main;
  const line = state.doc.lineAt(r.from);
  const atEmptyLine = line.text.trim() === '';
  const from = atEmptyLine ? line.from : line.to;
  const prevLine = line.number > 1 ? state.doc.line(line.number - 1).text : '';
  const lead = atEmptyLine ? (line.number > 1 && prevLine.trim() !== '' ? '\n' : '') : '\n\n';
  const after = state.doc.sliceString(atEmptyLine ? line.to : line.to, (atEmptyLine ? line.to : line.to) + 2);
  const trail = after.startsWith('\n\n') || (after === '' && false) ? '' : after.startsWith('\n') ? '\n' : '\n';
  const to = atEmptyLine ? line.to : line.to;
  const insert = lead + block + trail;
  const base = from + lead.length;
  const sel = typeof cursor === 'number' ? EditorSelection.cursor(base + cursor) : EditorSelection.range(base + cursor[0], base + cursor[1]);
  return { changes: { from, to, insert }, selection: sel, scrollIntoView: true };
}

/** Wraps the selected lines in a fenced code block, or inserts an empty one. */
export function toggleCodeBlock(state: EditorState): TransactionSpec {
  const r = state.selection.main;
  if (r.empty) return insertBlock(state, '```\n\n```', 4);
  const a = state.doc.lineAt(r.from);
  const b = state.doc.lineAt(r.to);
  return {
    changes: [
      { from: a.from, insert: '```\n' },
      { from: b.to, insert: '\n```' },
    ],
    selection: EditorSelection.cursor(a.from + 3),
    scrollIntoView: true,
  };
}

export const TABLE_TEMPLATE = '| Column 1 | Column 2 |\n| --- | --- |\n|  |  |';

/** Removes inline formatting markers from the selection (keeps the text). */
export function clearFormatting(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to);
    const plain = text
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/(\*|_)(.+?)\1/g, '$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
    return { changes: { from: range.from, to: range.to, insert: plain }, range: EditorSelection.range(range.from, range.from + plain.length) };
  });
}
