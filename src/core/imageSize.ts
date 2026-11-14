/**
 * Image size and alignment, written after a "|" in the alt text: `![A photo|300](photo.png)`
 * (width in pixels), `|300x200`, and `|center` or `|right`, as in `![A photo|300|center](photo.png)`.
 * Obsidian uses the same size form; other Markdown apps simply show the image at its natural size,
 * so nothing breaks elsewhere.
 */
export type ImageAlign = 'left' | 'center' | 'right';

export interface AltSize {
  alt: string;
  width: number | null;
  height: number | null;
  align: ImageAlign | null;
}

const SIZE_PART = /\s*\|\s*(\d{1,5})(?:\s*x\s*(\d{1,5}))?\s*$/;
const ALIGN_PART = /\s*\|\s*(left|center|right)\s*$/i;

export function parseAltSize(raw: string): AltSize {
  const out: AltSize = { alt: raw, width: null, height: null, align: null };
  let rest = raw;
  let sized = false;
  // Up to two trailing parts, a size and an alignment, in either order.
  for (let i = 0; i < 2; i++) {
    const s = !sized ? SIZE_PART.exec(rest) : null;
    if (s) {
      sized = true;
      const w = Number(s[1]);
      out.width = w > 0 ? w : null;
      out.height = s[2] ? Number(s[2]) || null : null;
      rest = rest.slice(0, s.index);
      continue;
    }
    const a = !out.align ? ALIGN_PART.exec(rest) : null;
    if (!a) break;
    out.align = a[1].toLowerCase() as ImageAlign;
    rest = rest.slice(0, a.index);
  }
  out.alt = rest;
  return out;
}

/**
 * The alt text with a new width and/or alignment. `undefined` keeps the current value, `null`
 * removes it. Left is the default, so it's written as nothing.
 */
export function withAltOptions(raw: string, opts: { width?: number | null; align?: ImageAlign | null }): string {
  const cur = parseAltSize(raw);
  const width = opts.width === undefined ? cur.width : opts.width;
  const height = opts.width === undefined ? cur.height : null;
  const align = opts.align === undefined ? cur.align : opts.align;
  let out = cur.alt;
  if (width) out += `|${Math.round(width)}${height ? `x${height}` : ''}`;
  if (align && align !== 'left') out += `|${align}`;
  return out;
}

/** The alt text with a new width (null removes the size). Keeps the alignment. */
export function withAltSize(raw: string, width: number | null): string {
  return withAltOptions(raw, { width });
}

/** Sizes offered in the image menu. */
export const IMAGE_SIZE_PRESETS: { label: string; width: number }[] = [
  { label: 'Small', width: 240 },
  { label: 'Medium', width: 480 },
  { label: 'Large', width: 720 },
];

export const MIN_IMAGE_WIDTH = 48;

/** `![alt](…)` at `pos` in `text`: where its alt text is, or null. */
export function altRangeAt(text: string, pos: number): { from: number; to: number; alt: string } | null {
  const m = /^!\[((?:[^\]\\]|\\.)*)\]\(/.exec(text.slice(pos, pos + 2000));
  if (!m) return null;
  return { from: pos + 2, to: pos + 2 + m[1].length, alt: m[1] };
}

/** The n-th Markdown image (`![…](…)`) in `text`, outside inline code. */
export function nthImageAlt(text: string, n: number): { from: number; to: number; alt: string } | null {
  const masked = text.replace(/(`+)[^`]*?\1/g, (s) => ' '.repeat(s.length));
  const re = /!\[((?:[^\]\\]|\\.)*)\]\(/g;
  let i = 0;
  for (let m; (m = re.exec(masked)); i++) if (i === n) return { from: m.index + 2, to: m.index + 2 + m[1].length, alt: text.slice(m.index + 2, m.index + 2 + m[1].length) };
  return null;
}
