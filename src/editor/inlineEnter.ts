import { completionStatus } from '@codemirror/autocomplete';
import { EditorSelection, Prec, type EditorState, type Extension, type TransactionSpec } from '@codemirror/state';
import { keymap } from '@codemirror/view';

/**
 * Enter at the end of formatted text. Bold, italic and the rest start as an empty pair with the
 * cursor between (**‸**), so after typing, Enter would split the closing marks onto the next line.
 * When everything after the cursor is closing marks, Enter first steps past them (or removes an
 * empty pair), then the usual Enter runs on the new position.
 */

/** Closing marks and their openings: Markdown markers are symmetric, tags aren't. */
const CLOSERS: { close: RegExp; open: RegExp }[] = [
  { close: /^<\/span>/i, open: /<span\b[^>]*>/i },
  { close: /^<\/mark>/i, open: /<mark\b[^>]*>/i },
  { close: /^<\/(u|sub|sup|b|i|em|strong|s|del)>/i, open: /<(u|sub|sup|b|i|em|strong|s|del)\b[^>]*>/i },
  { close: /^(\*{1,3}|_{1,3}|~~|==|`+|\^|~)/, open: /(\*{1,3}|_{1,3}|~~|==|`+|\^|~)/ },
];

/** The closing marks that make up `rest` (all of it, apart from trailing spaces), or null. */
function closingMarks(rest: string, before: string): string[] | null {
  const marks: string[] = [];
  let s = rest.replace(/\s+$/, '');
  if (!s) return null;
  while (s) {
    const hit = CLOSERS.map((c) => ({ c, m: c.close.exec(s) })).find((x) => x.m);
    if (!hit) return null;
    const mark = hit.m![0];
    // Something must open it earlier on the line, or this isn't a closing mark at all.
    const opener = hit.c.close.source.startsWith('^<') ? hit.c.open : new RegExp(mark.replace(/[*^~`=_]/g, '\\$&'));
    if (!opener.test(before)) return null;
    marks.push(mark);
    s = s.slice(mark.length);
  }
  return marks;
}

export function stepOutOfInline(state: EditorState): TransactionSpec | null {
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return null;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  const rest = line.text.slice(pos - line.from);
  const marks = closingMarks(rest, before);
  if (!marks) return null;
  const closeLen = marks.join('').length;

  // An empty pair (nothing typed between): take the opening marks away too.
  let openLen = 0;
  let b = before;
  for (const mark of marks) {
    const tag = /^<\/(\w+)>$/.exec(mark);
    const open = tag ? new RegExp(`<${tag[1]}\\b[^>]*>$`, 'i').exec(b) : b.endsWith(mark) ? [mark] : null;
    if (!open) {
      openLen = 0;
      break;
    }
    openLen += open[0].length;
    b = b.slice(0, b.length - open[0].length);
  }
  if (openLen) return { changes: { from: pos - openLen, to: pos + closeLen }, selection: EditorSelection.cursor(pos - openLen) };
  return { selection: EditorSelection.cursor(pos + closeLen) };
}

/** Runs before every other Enter (Live paragraphs, list continuation, the default newline). */
export const inlineEnter: Extension = Prec.highest(
  keymap.of([
    {
      key: 'Enter',
      run: (view) => {
        if (completionStatus(view.state) === 'active') return false;
        const spec = stepOutOfInline(view.state);
        if (spec) view.dispatch({ ...spec, userEvent: spec.changes ? 'delete' : 'select' });
        return false; // the usual Enter now runs from the new position
      },
    },
  ]),
);
