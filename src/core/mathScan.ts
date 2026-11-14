/**
 * Shared rules for `$…$` inline math (Pandoc-style), used by both the renderer and the editor
 * grammar so they always agree:
 * - the opening `$` must not be followed by whitespace,
 * - the closing `$` must not be preceded by whitespace or followed by a digit (so "$5 and $10" is text),
 * - `\$` is a literal dollar,
 * - `$$…$$` inside a paragraph is display math.
 *
 * Returns the index just past the closing delimiter, or -1.
 */
export function scanInlineMath(src: string, pos: number, end = src.length): { to: number; display: boolean } | -1 {
  if (src.charCodeAt(pos) !== 36 /* $ */) return -1;
  if (pos > 0 && src.charCodeAt(pos - 1) === 92 /* \ */) return -1;

  if (src.charCodeAt(pos + 1) === 36) {
    const close = src.indexOf('$$', pos + 2);
    if (close === -1 || close >= end || close === pos + 2) return -1;
    return { to: close + 2, display: true };
  }

  const first = src.charCodeAt(pos + 1);
  if (Number.isNaN(first) || pos + 1 >= end || first === 32 || first === 9 || first === 10) return -1;
  for (let i = pos + 1; i < end; i++) {
    const c = src.charCodeAt(i);
    if (c === 92) {
      i++;
      continue;
    }
    if (c === 10 && src.charCodeAt(i + 1) === 10) return -1; // never across paragraphs
    if (c === 36) {
      const prev = src.charCodeAt(i - 1);
      const next = src.charCodeAt(i + 1);
      if (prev === 32 || prev === 9 || prev === 10) continue;
      if (next >= 48 && next <= 57) continue;
      if (i === pos + 1) return -1;
      return { to: i + 1, display: false };
    }
  }
  return -1;
}

/** A `$$` block: opening line starts with `$$`; closes on a line ending in `$$` (or the same line). */
export function isMathBlockStart(lineText: string): boolean {
  return /^ {0,3}\$\$/.test(lineText);
}
