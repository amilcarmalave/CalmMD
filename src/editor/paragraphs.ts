import { syntaxTree } from '@codemirror/language';
import { EditorSelection, Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

/**
 * Live mode's Enter, so the text reads the same everywhere (GitHub included): in Markdown one line
 * break doesn't start a new paragraph, so Enter writes a blank line, and Shift+Enter writes a
 * hard line break (a trailing backslash, hidden in Live mode). Lists, quotes, code, tables and
 * everything else keep the usual Enter.
 */
function inTopParagraph(state: EditorState, pos: number): boolean {
  const line = state.doc.lineAt(pos);
  if (!line.text.trim()) return false;
  const tree = syntaxTree(state);
  for (let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, pos === line.from ? 1 : -1); node; node = node.parent) {
    if (node.name === 'Paragraph') return node.parent?.name === 'Document';
  }
  return false;
}

function insertAll(view: EditorView, text: string, userEvent: string): boolean {
  const { state } = view;
  if (!state.selection.ranges.every((r) => inTopParagraph(state, r.head) && inTopParagraph(state, r.anchor))) return false;
  view.dispatch(
    state.changeByRange((r) => ({ changes: { from: r.from, to: r.to, insert: text }, range: EditorSelection.cursor(r.from + text.length) })),
    { scrollIntoView: true, userEvent },
  );
  return true;
}

export const paragraphEnter = (view: EditorView) => insertAll(view, '\n\n', 'input');
export const lineBreakEnter = (view: EditorView) => insertAll(view, '\\\n', 'input');

export const paragraphKeymap: Extension = Prec.high(
  keymap.of([
    { key: 'Enter', run: paragraphEnter },
    { key: 'Shift-Enter', run: lineBreakEnter },
  ]),
);
