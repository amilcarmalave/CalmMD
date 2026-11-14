/**
 * YAML (---) or TOML (+++) front matter at the very top of a document. One rule shared by the
 * outline, the renderer and the editor grammar, so they always agree on where it ends.
 *
 * Returns the number of lines it spans, closing fence included, or 0 when there is none.
 */
export const FRONT_MATTER_MAX_LINES = 400;

export function frontMatterLines(lines: readonly string[]): number {
  const open = lines[0]?.trimEnd();
  if (open !== '---' && open !== '+++') return 0;
  const limit = Math.min(lines.length, FRONT_MATTER_MAX_LINES);
  for (let i = 1; i < limit; i++) {
    const l = lines[i].trimEnd();
    if (l === open || (open === '---' && l === '...')) return i + 1;
  }
  return 0;
}

/** Same, for a whole document string (only the first lines are split). */
export function frontMatterLinesOf(text: string): number {
  if (!text.startsWith('---') && !text.startsWith('+++')) return 0;
  return frontMatterLines(text.split(/\r?\n/, FRONT_MATTER_MAX_LINES));
}
