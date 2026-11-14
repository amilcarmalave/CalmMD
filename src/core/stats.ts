export interface TextStats {
  words: number;
  chars: number;
  lines: number;
}

// Scripts written without spaces between words: count each character as a word.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu;
// A word is a run of letters/digits/marks, optionally joined by ' ’ . - _ (don't, e.g, 3.14, well-known).
const WORD = /[\p{L}\p{N}\p{M}]+(?:['’.\-_][\p{L}\p{N}\p{M}]+)*/gu;

export function countStats(text: string): TextStats {
  if (text.length === 0) return { words: 0, chars: 0, lines: 1 };

  let lines = 1;
  let chars = 0;
  for (const ch of text) {
    // Code points, not UTF-16 units, so emoji and astral characters count once.
    if (ch === '\n') lines++;
    else if (ch !== '\r') chars++;
  }

  let cjk = 0;
  const latin = text.replace(CJK, () => {
    cjk++;
    return ' ';
  });
  let words = cjk;
  WORD.lastIndex = 0;
  while (WORD.exec(latin) !== null) words++;

  return { words, chars, lines };
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}
