import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { noteLink } from '../core/noteLinks';
import { basename, dirname, isWithin, samePath, stem } from '../core/paths';

/** "[[" followed by a filter (no brackets, pipe, hash or newline) right before the cursor. */
export function notePickerQuery(beforeCursor: string): string | null {
  const m = /\[\[([^\[\]|#\n]*)$/.exec(beforeCursor);
  return m ? m[1] : null;
}

/**
 * Typing `[[` lists the notes in the open folder (and open tabs); picking one inserts a standard
 * relative Markdown link to it, which works in any Markdown app and when the folder is shared.
 */
export function notePicker(opts: {
  files: () => Promise<string[]>;
  docPath: () => string | null;
  root: () => string | null;
}): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const q = notePickerQuery(line.text.slice(0, ctx.pos - line.from));
    if (q === null) return null;
    const start = ctx.pos - q.length - 2;
    const doc = opts.docPath();
    const root = opts.root();
    const files = (await opts.files()).filter((f) => !doc || !samePath(f, doc));
    if (ctx.aborted) return null;
    const rel = (p: string) => {
      const d = dirname(p);
      return root && isWithin(d, root) ? d.slice(root.length).replace(/^[\\/]/, '') || '/' : d;
    };
    const options: Completion[] = files.map((path) => ({
      label: stem(basename(path)),
      detail: rel(path),
      apply: (view: EditorView, _c: Completion, _from: number, to: number) => {
        // Swallow a "]]" the user may already have typed after the cursor.
        const end = view.state.sliceDoc(to, to + 2) === ']]' ? to + 2 : to;
        const link = noteLink(opts.docPath(), path);
        view.dispatch({ changes: { from: start, to: end, insert: link }, selection: { anchor: start + link.length }, userEvent: 'input.complete' });
      },
    }));
    if (!options.length) return null;
    return { from: start + 2, options, validFor: /^[^\[\]|#\n]*$/ };
  };
}
