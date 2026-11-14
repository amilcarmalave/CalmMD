import { EditorView } from '@codemirror/view';

/** Document y=0 in the scroller's content coordinates. */
function docOffset(view: EditorView): number {
  const s = view.scrollDOM;
  return view.documentTop - s.getBoundingClientRect().top + s.scrollTop;
}

/** 0-based line at the top of the editor viewport. */
export function topLineOf(view: EditorView): number {
  const y = Math.max(0, view.scrollDOM.scrollTop - docOffset(view));
  return view.state.doc.lineAt(view.lineBlockAtHeight(y).from).number - 1;
}

/** Scrolls so that a 0-based line sits at the top of the viewport. */
export function scrollLineToTop(view: EditorView, line: number) {
  if (line <= 0) {
    view.scrollDOM.scrollTop = 0;
    return;
  }
  const doc = view.state.doc;
  const pos = doc.line(Math.min(line + 1, doc.lines)).from;
  view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }) });
}
