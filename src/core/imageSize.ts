/**
 * Image sizes, written after a "|" in the alt text: `![A photo|300](photo.png)` (width in pixels)
 * or `![A photo|300x200](photo.png)`. Obsidian uses the same form; other Markdown apps simply show
 * the image at its natural size, so nothing breaks elsewhere.
 */
export interface AltSize {
  alt: string;
  width: number | null;
  height: number | null;
}

const SIZE = /^(.*?)\s*\|\s*(\d{1,5})(?:\s*x\s*(\d{1,5}))?\s*$/s;

export function parseAltSize(raw: string): AltSize {
  const m = SIZE.exec(raw);
  if (!m) return { alt: raw, width: null, height: null };
  const width = Number(m[2]);
  return { alt: m[1], width: width > 0 ? width : null, height: m[3] ? Number(m[3]) || null : null };
}

/** The alt text with a new width (null removes the size). */
export function withAltSize(raw: string, width: number | null): string {
  const { alt } = parseAltSize(raw);
  return width ? `${alt}|${Math.round(width)}` : alt;
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
