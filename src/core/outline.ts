import { frontMatterLines } from './frontMatter';

export interface Heading {
  level: number;
  text: string;
  /** 0-based source line. */
  line: number;
}

const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const BLOCK_START = /^ {0,3}([-*+]\s|\d+[.)]\s|>|#|`{3,}|~{3,}|\||<)/;

/** Plain text for the outline: drops inline markup. */
export function plainHeadingText(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Headings in a Markdown document, skipping fenced code, indented code and front matter.
 * This is a line scanner, so it's fast enough to run on every edit of a large document and
 * doesn't depend on the editor's lazy parse.
 */
export function extractHeadings(text: string): Heading[] {
  const lines = text.split('\n');
  const out: Heading[] = [];
  // YAML (---) or TOML (+++) front matter at the very top.
  let i = frontMatterLines(lines);

  let fence: { char: string; len: number } | null = null;
  let prevParagraph = false; // previous line could be a setext heading's text

  for (; i < lines.length; i++) {
    const line = lines[i];

    if (fence) {
      const m = FENCE.exec(line);
      if (m && m[1][0] === fence.char && m[1].length >= fence.len && line.trim() === m[1]) fence = null;
      prevParagraph = false;
      continue;
    }
    const f = FENCE.exec(line);
    if (f) {
      fence = { char: f[1][0], len: f[1].length };
      prevParagraph = false;
      continue;
    }
    if (line.trim() === '') {
      prevParagraph = false;
      continue;
    }
    if (/^( {4}|\t)/.test(line) && !prevParagraph) continue; // indented code

    const atx = ATX.exec(line);
    if (atx) {
      out.push({ level: atx[1].length, text: plainHeadingText(atx[2] ?? ''), line: i });
      prevParagraph = false;
      continue;
    }
    const st = SETEXT.exec(line);
    if (st && prevParagraph) {
      // Underlines a paragraph. A '---' after a blank line is a rule, handled by prevParagraph.
      const level = st[1][0] === '=' ? 1 : 2;
      out.push({ level, text: plainHeadingText(lines[i - 1]), line: i - 1 });
      prevParagraph = false;
      continue;
    }
    prevParagraph = !BLOCK_START.test(line);
  }
  return out;
}

/** Index of the heading that contains `line` (the last one at or before it), or -1. */
export function headingIndexAt(headings: Heading[], line: number): number {
  let lo = 0;
  let hi = headings.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (headings[mid].line <= line) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
