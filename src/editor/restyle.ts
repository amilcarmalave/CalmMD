import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type SelectionRange, type TransactionSpec } from '@codemirror/state';

/**
 * Formatting a selection that overlaps existing formatting (part of a bold phrase, half of a coloured
 * word). Wrapping it in new marks would cross the old ones (`<span>a <span>b</span> c</span>`), so
 * instead the affected part of the line is read as runs of styled text, the change is applied to
 * just the selected characters, and the part is written back with properly nested marks.
 *
 * Styles: bold, italic, strikethrough, highlight (`==` or a coloured <mark>) and text colour (<span>).
 * Code, links, images, math and other inline syntax are kept whole: a selection that cuts into one
 * takes in all of it.
 */
export interface Style {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  /** 'default' for ==text==, otherwise a CSS colour from <mark style="background: …">. */
  highlight: string | null;
  color: string | null;
}
export type StyleChange = (current: Style[]) => (s: Style) => Style;

const PLAIN: Style = { bold: false, italic: false, strike: false, highlight: null, color: null };

/** Inline syntax that's kept whole. */
const ATOMIC = new Set(['InlineCode', 'Link', 'Image', 'Autolink', 'URL', 'InlineMath', 'WikiLink', 'Escape', 'Entity', 'Superscript', 'Subscript', 'HardBreak', 'FootnoteReference']);
const MARK_NODES: Record<string, keyof Style> = { StrongEmphasis: 'bold', Emphasis: 'italic', Strikethrough: 'strike', Highlight: 'highlight' };
const MARK_CHILDREN = new Set(['EmphasisMark', 'StrikethroughMark', 'HighlightMark']);

const OPEN_COLOR = /^<span\s+style="color:\s*([^";]+?)\s*;?\s*"\s*>/i;
const OPEN_MARK = /^<mark(?:\s+style="background(?:-color)?:\s*([^";]+?)\s*;?\s*")?\s*>/i;

interface Element {
  from: number;
  to: number;
  /** Positions that are syntax (marks, tags) and disappear when the text is rebuilt. */
  marks: [number, number][];
  key?: keyof Style;
  value?: string;
  atomic?: boolean;
}

/** Styled elements and atomic syntax on one line, from the syntax tree and the colour tags. */
function elementsOn(state: EditorState, from: number, to: number): Element[] {
  const out: Element[] = [];
  syntaxTree(state).iterate({
    from,
    to,
    enter: (n) => {
      if (n.from < from || n.to > to) return; // block nodes around the line
      if (ATOMIC.has(n.name)) {
        out.push({ from: n.from, to: n.to, marks: [], atomic: true });
        return false;
      }
      const key = MARK_NODES[n.name];
      if (key) {
        const marks: [number, number][] = [];
        for (let c = n.node.firstChild; c; c = c.nextSibling) if (MARK_CHILDREN.has(c.name)) marks.push([c.from, c.to]);
        out.push({ from: n.from, to: n.to, marks, key, value: key === 'highlight' ? 'default' : undefined });
      }
      if (n.name === 'HTMLTag') return false;
      return;
    },
  });
  // Colour tags: pair <span style="color"> / <mark> with their closing tags (other spans too, to keep count).
  const text = state.sliceDoc(from, to);
  const stack: { tag: string; at: number; len: number; key?: keyof Style; value?: string }[] = [];
  const re = /<(\/?)(span|mark)\b[^>]*>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
    const tag = m[2].toLowerCase();
    const at = from + m.index;
    if (!m[1]) {
      const color = tag === 'span' ? OPEN_COLOR.exec(m[0]) : null;
      const mark = tag === 'mark' ? OPEN_MARK.exec(m[0]) : null;
      stack.push({ tag, at, len: m[0].length, key: color ? 'color' : mark ? 'highlight' : undefined, value: color?.[1] ?? mark?.[1] ?? (mark ? 'default' : undefined) });
      continue;
    }
    const i = stack.map((s) => s.tag).lastIndexOf(tag);
    if (i === -1) continue;
    const open = stack.splice(i)[0];
    const end = at + m[0].length;
    if (open.key) out.push({ from: open.at, to: end, marks: [[open.at, open.at + open.len], [at, end]], key: open.key, value: open.value });
    else out.push({ from: open.at, to: end, marks: [], atomic: true }); // a span we don't understand: keep it whole
  }
  return out;
}

interface Token {
  text: string;
  from: number;
  to: number;
  style: Style;
  atomic: boolean;
}

/** Rewrites [region.from, region.to) with `change` applied to the tokens inside the selection. */
function rewrite(state: EditorState, range: SelectionRange, change: StyleChange): { from: number; to: number; insert: string; selFrom: number; selTo: number } | null {
  const line = state.doc.lineAt(range.from);
  if (state.doc.lineAt(range.to).number !== line.number) return null; // one line at a time
  const elements = elementsOn(state, line.from, line.to);

  // The region: the selection, grown until no element crosses its edges.
  let from = range.from;
  let to = range.to;
  for (let changed = true; changed; ) {
    changed = false;
    for (const e of elements) {
      if (e.from < to && e.to > from && (e.from < from || e.to > to)) {
        from = Math.min(from, e.from);
        to = Math.max(to, e.to);
        changed = true;
      }
    }
  }
  // Selection edges inside a mark or atomic element snap outward.
  let selFrom = range.from;
  let selTo = range.to;
  for (const e of elements) {
    if (e.atomic && e.from < selTo && e.to > selFrom) {
      selFrom = Math.min(selFrom, e.from);
      selTo = Math.max(selTo, e.to);
    }
  }

  const inside = elements.filter((e) => e.from >= from && e.to <= to);
  const isMark = (p: number) => inside.some((e) => e.marks.some(([a, b]) => p >= a && p < b));
  const tokens: Token[] = [];
  for (let p = from; p < to; ) {
    const atom = inside.find((e) => e.atomic && e.from === p);
    const style = { ...PLAIN };
    for (const e of inside) if (e.key && e.from <= p && p < e.to) (style[e.key] as unknown) = e.key === 'bold' || e.key === 'italic' || e.key === 'strike' ? true : (e.value ?? null);
    if (atom) {
      tokens.push({ text: state.sliceDoc(atom.from, atom.to), from: atom.from, to: atom.to, style, atomic: true });
      p = atom.to;
      continue;
    }
    if (!isMark(p)) tokens.push({ text: state.sliceDoc(p, p + 1), from: p, to: p + 1, style, atomic: false });
    p++;
  }
  const selected = tokens.filter((t) => t.from < selTo && t.to > selFrom);
  if (!selected.length) return null;
  const letters = selected.filter((t) => t.text.trim());
  const apply = change((letters.length ? letters : selected).map((t) => t.style));
  for (const t of selected) t.style = apply(t.style);

  const { text, offsets } = serialize(tokens, state.sliceDoc(from - 1, from), state.sliceDoc(to, to + 1));
  const first = tokens.indexOf(selected.find((t) => t.text.trim()) ?? selected[0]);
  const lastTok = [...selected].reverse().find((t) => t.text.trim()) ?? selected[selected.length - 1];
  const last = tokens.indexOf(lastTok);
  return { from, to, insert: text, selFrom: from + offsets[first][0], selTo: from + offsets[last][1] };
}

const KEYS = ['color', 'highlight', 'strike', 'bold', 'italic'] as const;
type Key = (typeof KEYS)[number];
const has = (s: Style, k: Key) => (k === 'color' || k === 'highlight' ? s[k] !== null : s[k]);
const same = (a: Style, b: Style, k: Key) => a[k] === b[k];

/** Text with nested marks for the tokens, and each token's [start, end) in that text. */
export function serialize(
  tokens: { text: string; style: Style }[],
  /** The characters just outside, for choosing marks that work there. */
  before = '',
  after = '',
): { text: string; offsets: [number, number][] } {
  // Whitespace never starts or ends a style (Markdown wouldn't accept "** bold**").
  const styles = tokens.map((t) => t.style);
  const isWs = (i: number) => !tokens[i].text.trim();
  const effective = styles.map((s, i) => {
    if (!isWs(i)) return s;
    let a = i - 1;
    while (a >= 0 && isWs(a)) a--;
    let b = i + 1;
    while (b < tokens.length && isWs(b)) b++;
    if (a < 0 || b >= tokens.length) return PLAIN;
    const pa = styles[a];
    const pb = styles[b];
    return {
      bold: pa.bold && pb.bold,
      italic: pa.italic && pb.italic,
      strike: pa.strike && pb.strike,
      highlight: pa.highlight === pb.highlight ? pa.highlight : null,
      color: pa.color === pb.color ? pa.color : null,
    };
  });

  let out = '';
  const offsets: [number, number][] = [];
  const open: { key: Key; style: Style }[] = [];
  const opener = (k: Key, s: Style, i: number) => {
    if (k === 'color') return `<span style="color: ${s.color}">`;
    if (k === 'highlight') return s.highlight === 'default' ? '==' : `<mark style="background: ${s.highlight}">`;
    if (k === 'strike') return '~~';
    if (k === 'bold') return '**';
    // Italic: _ reads better, but only * works when the run touches letters outside it (inside a word).
    let j = i;
    while (j < tokens.length && effective[j].italic) j++;
    const word = /[\p{L}\p{N}]/u;
    return word.test(out.slice(-1) || before) || word.test(j < tokens.length ? tokens[j].text[0] : after) ? '*' : '_';
  };
  const closer = (k: Key, s: Style, mark: string) => {
    if (k === 'color') return '</span>';
    if (k === 'highlight') return s.highlight === 'default' ? '==' : '</mark>';
    return mark;
  };
  const marksOpen: string[] = [];
  const closeFrom = (i: number) => {
    while (open.length > i) {
      const o = open.pop()!;
      out += closer(o.key, o.style, marksOpen.pop()!);
    }
  };
  tokens.forEach((t, i) => {
    const s = effective[i];
    const keep = open.findIndex((o) => !has(s, o.key) || !same(o.style, s, o.key));
    if (keep !== -1) closeFrom(keep);
    for (const k of KEYS) {
      if (!has(s, k) || open.some((o) => o.key === k)) continue;
      const m = opener(k, s, i);
      out += m;
      marksOpen.push(m);
      open.push({ key: k, style: s });
    }
    const start = out.length;
    out += t.text;
    offsets.push([start, out.length]);
  });
  closeFrom(0);
  return { text: out, offsets };
}

/** Applies a style change to every selection; null when there's nothing to do this way. */
export function restyle(state: EditorState, change: StyleChange): TransactionSpec | null {
  if (syntaxTree(state).length < state.doc.length) return null; // not parsed yet (or no Markdown language)
  if (state.selection.ranges.some((r) => r.empty)) return null;
  const edits: { from: number; to: number; insert: string; selFrom: number; selTo: number }[] = [];
  for (const r of state.selection.ranges) {
    const e = rewrite(state, r, change);
    if (!e) return null;
    edits.push(e);
  }
  let shift = 0;
  const ranges = edits.map((e) => {
    const r = EditorSelection.range(e.selFrom + shift, e.selTo + shift);
    shift += e.insert.length - (e.to - e.from);
    return r;
  });
  return {
    changes: edits.map((e) => ({ from: e.from, to: e.to, insert: e.insert })),
    selection: EditorSelection.create(ranges, state.selection.mainIndex),
    scrollIntoView: true,
  };
}

/** Toggle: off when every selected letter already has it, otherwise on. */
export const toggleStyle =
  (key: 'bold' | 'italic' | 'strike'): StyleChange =>
  (current) => {
    const on = !current.every((s) => s[key]);
    return (s) => ({ ...s, [key]: on });
  };

/** Sets (or with null removes) the text colour or highlight. */
export const setColorStyle =
  (key: 'color' | 'highlight', value: string | null): StyleChange =>
  () =>
  (s) => ({ ...s, [key]: value });

/** Toggles the default ==highlight==. */
export const toggleHighlight: StyleChange = (current) => {
  const on = !current.every((s) => s.highlight === 'default');
  return (s) => ({ ...s, highlight: on ? 'default' : null });
};
