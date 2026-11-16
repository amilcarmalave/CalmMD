import { slugify } from '../render/markdown';

/** A heading in a note, for links to it ("Plan.md#budget"). */
export interface NoteHeading {
  level: number;
  /** The heading as text, without inline Markdown ("**Big** plan" → "Big plan"). */
  text: string;
  /** The anchor GitHub and CalmMD use for it. */
  slug: string;
  /** 0-based line. */
  line: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

/** The ATX headings of a note (outside code blocks), in order. */
export function headingsOf(text: string): NoteHeading[] {
  const out: NoteHeading[] = [];
  let fence: string | null = null;
  text.split('\n').forEach((raw, line) => {
    const f = FENCE.exec(raw);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return;
    }
    if (fence) return;
    const m = ATX.exec(raw);
    if (!m) return;
    const plain = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~=`]+/g, '')
      .trim();
    if (plain) out.push({ level: m[1].length, text: plain, slug: slugify(plain), line });
  });
  return out;
}

/** The 0-based line of the heading an anchor points to, or null. */
export function headingLine(text: string, anchor: string): number | null {
  let id = anchor;
  try {
    id = decodeURIComponent(anchor);
  } catch {
    // keep as written
  }
  const want = id.toLowerCase();
  const h = headingsOf(text).find((x) => x.slug === want || slugify(x.text) === slugify(id));
  return h ? h.line : null;
}
