import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { restyle, setColorStyle } from './restyle';

/**
 * Highlight and text colours, written as plain inline HTML so they survive in other editors and
 * exports (GitHub drops the colour but keeps the text):
 *
 *   <mark style="background: rgba(…)">text</mark>     <span style="color: #…">text</span>
 *
 * The palette is chosen to read on both light and dark themes: highlights are translucent, text
 * colours are mid-tones. The default highlight stays the Markdown `==text==`.
 */
export type ColorKind = 'highlight' | 'text';

export interface Swatch {
  id: string;
  label: string;
  value: string;
}

export const HIGHLIGHT_COLORS: Swatch[] = [
  { id: 'yellow', label: 'Yellow', value: 'rgba(250, 204, 21, 0.4)' },
  { id: 'green', label: 'Green', value: 'rgba(74, 222, 128, 0.34)' },
  { id: 'blue', label: 'Blue', value: 'rgba(96, 165, 250, 0.34)' },
  { id: 'pink', label: 'Pink', value: 'rgba(244, 114, 182, 0.34)' },
  { id: 'purple', label: 'Purple', value: 'rgba(167, 139, 250, 0.36)' },
  { id: 'orange', label: 'Orange', value: 'rgba(251, 146, 60, 0.36)' },
];

export const TEXT_COLORS: Swatch[] = [
  { id: 'red', label: 'Red', value: '#e5484d' },
  { id: 'orange', label: 'Orange', value: '#e2781f' },
  { id: 'green', label: 'Green', value: '#2f9e57' },
  { id: 'blue', label: 'Blue', value: '#3b82e0' },
  { id: 'purple', label: 'Purple', value: '#9061f0' },
  { id: 'gray', label: 'Gray', value: '#8a8f98' },
];

/** A custom colour from the picker: "#rrggbb". */
export const isCustomColor = (id: string) => /^#[0-9a-f]{6}$/i.test(id);

/** "#rrggbb" → translucent rgba, so a custom highlight reads on light and dark themes like the palette. */
export function highlightFromHex(hex: string, alpha = 0.4): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The CSS value for a palette id or a custom "#rrggbb" (highlights become translucent). */
export function colorValue(kind: ColorKind, id: string): string | undefined {
  if (isCustomColor(id)) return kind === 'highlight' ? highlightFromHex(id) : id.toLowerCase();
  return swatchById(kind, id)?.value;
}

export const swatches = (kind: ColorKind) => (kind === 'highlight' ? HIGHLIGHT_COLORS : TEXT_COLORS);
export const swatchById = (kind: ColorKind, id: string) => swatches(kind).find((s) => s.id === id);

const openTag = (kind: ColorKind, value: string) =>
  kind === 'highlight' ? `<mark style="background: ${value}">` : `<span style="color: ${value}">`;
const closeTag = (kind: ColorKind) => (kind === 'highlight' ? '</mark>' : '</span>');
/** An opening tag of this kind that sets a colour (or a bare <mark>). */
const OPEN: Record<ColorKind, RegExp> = {
  highlight: /<mark(?:\s+style="background(?:-color)?:\s*[^"]*")?\s*>$/i,
  text: /<span\s+style="color:\s*[^"]*"\s*>$/i,
};
const OPEN_AT_START: Record<ColorKind, RegExp> = {
  highlight: /^<mark(?:\s+style="background(?:-color)?:\s*[^"]*")?\s*>/i,
  text: /^<span\s+style="color:\s*[^"]*"\s*>/i,
};

/**
 * Colours each selection, recolours an existing coloured run, or removes the colour (`value`
 * null). For highlights, `value` "default" means the Markdown `==text==` form.
 */
export function applyColor(state: EditorState, kind: ColorKind, value: string | null): TransactionSpec {
  // A selection over existing colours or formatting: restyle the runs so tags never cross.
  const restyled = restyle(state, setColorStyle(kind === 'text' ? 'color' : 'highlight', value));
  if (restyled) return restyled;
  const close = closeTag(kind);
  const wrap = (inner: string) => {
    if (value === null) return { text: inner, offset: 0 };
    if (kind === 'highlight' && value === 'default') return { text: `==${inner}==`, offset: 2 };
    const open = openTag(kind, value);
    return { text: `${open}${inner}${close}`, offset: open.length };
  };

  return state.changeByRange((range) => {
    const inner = state.sliceDoc(range.from, range.to);
    const before = state.sliceDoc(Math.max(0, range.from - 120), range.from);
    const after = state.sliceDoc(range.to, range.to + close.length);

    // Already coloured just outside the selection: replace or remove the tags.
    const m = OPEN[kind].exec(before);
    if (m && after.toLowerCase() === close) {
      const from = range.from - m[0].length;
      const w = wrap(inner);
      return {
        changes: { from, to: range.to + close.length, insert: w.text },
        range: EditorSelection.range(from + w.offset, from + w.offset + inner.length),
      };
    }
    // The selection includes the tags.
    const s = OPEN_AT_START[kind].exec(inner);
    if (s && inner.toLowerCase().endsWith(close)) {
      const body = inner.slice(s[0].length, inner.length - close.length);
      const w = wrap(body);
      return {
        changes: { from: range.from, to: range.to, insert: w.text },
        range: EditorSelection.range(range.from + w.offset, range.from + w.offset + body.length),
      };
    }
    // ==text== highlights count as highlights too.
    if (kind === 'highlight') {
      if (state.sliceDoc(range.from - 2, range.from) === '==' && state.sliceDoc(range.to, range.to + 2) === '==') {
        const w = wrap(inner);
        return {
          changes: { from: range.from - 2, to: range.to + 2, insert: w.text },
          range: EditorSelection.range(range.from - 2 + w.offset, range.from - 2 + w.offset + inner.length),
        };
      }
      if (inner.length > 4 && inner.startsWith('==') && inner.endsWith('==')) {
        const body = inner.slice(2, -2);
        const w = wrap(body);
        return {
          changes: { from: range.from, to: range.to, insert: w.text },
          range: EditorSelection.range(range.from + w.offset, range.from + w.offset + body.length),
        };
      }
    }
    if (value === null) return { range };

    // Wrap, leaving surrounding whitespace outside the colour.
    const lead = inner.length - inner.trimStart().length;
    const trail = inner.length - inner.trimEnd().length;
    const from = range.from + lead;
    const to = Math.max(from, range.to - trail);
    const body = state.sliceDoc(from, to);
    const w = wrap(body);
    return {
      changes: { from, to, insert: w.text },
      range: body ? EditorSelection.range(from + w.offset, from + w.offset + body.length) : EditorSelection.cursor(from + w.offset),
    };
  });
}

/** Safe colour values for inline styles shown in Live mode (anything else is ignored). */
const SAFE_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i;

/** The colour and background from a tag's style attribute, as a safe style string (or ''). */
export function colorStyleOf(tag: string): string {
  const style = /\sstyle\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? /\sstyle\s*=\s*'([^']*)'/i.exec(tag)?.[1];
  if (!style) return '';
  const out: string[] = [];
  for (const decl of style.split(';')) {
    const [prop, ...rest] = decl.split(':');
    const name = prop?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (!name || !SAFE_VALUE.test(value)) continue;
    if (name === 'color') out.push(`color: ${value}`);
    else if (name === 'background' || name === 'background-color') out.push(`background-color: ${value}`);
  }
  return out.join('; ');
}
