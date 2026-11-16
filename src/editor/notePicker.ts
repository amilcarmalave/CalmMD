import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { markdownUrl, relativePath } from '../core/assets';
import { headingsOf } from '../core/headings';
import { noteLink } from '../core/noteLinks';
import { basename, dirname, isMarkdownPath, isWithin, samePath, stem } from '../core/paths';

/** "[[" followed by a filter (no brackets, pipe or newline) right before the cursor. */
export function notePickerQuery(beforeCursor: string): string | null {
  const m = /\[\[([^\[\]|\n]*)$/.exec(beforeCursor);
  return m ? m[1] : null;
}

/** A link from one note to a heading: "[Budget](Plan.md#budget)", or "[Budget](#budget)" in the same note. */
export function headingLink(fromDoc: string | null, target: string | null, heading: { text: string; slug: string }): string {
  const label = heading.text.replace(/[[\]]/g, '');
  if (!target || (fromDoc && samePath(fromDoc, target))) return `[${label}](#${heading.slug})`;
  const rel = fromDoc ? relativePath(dirname(fromDoc), target) : null;
  return `[${label}](${markdownUrl(rel ?? target)}#${heading.slug})`;
}

/** A link to any file: notes by title, other files by name. */
export function fileLink(fromDoc: string | null, target: string): string {
  if (isMarkdownPath(target)) return noteLink(fromDoc, target);
  const rel = fromDoc ? relativePath(dirname(fromDoc), target) : null;
  return `[${basename(target)}](${markdownUrl(rel ?? target)})`;
}

/**
 * Typing `[[` lists the files in the open folder (notes first, then pictures, PDFs and the rest);
 * picking one inserts a standard relative Markdown link. `[[Note#` lists that note's headings and
 * `[[#` the current note's, for a link straight to a section. Links work in any Markdown app,
 * GitHub included.
 */
export function notePicker(opts: {
  /** Notes (open tabs and the folder). */
  files: () => Promise<string[]>;
  /** Every file in the folder, notes or not. */
  allFiles?: () => Promise<string[]>;
  docPath: () => string | null;
  root: () => string | null;
  /** A note's text, for its headings. */
  readText: (path: string) => Promise<string>;
}): CompletionSource {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const line = ctx.state.doc.lineAt(ctx.pos);
    const q = notePickerQuery(line.text.slice(0, ctx.pos - line.from));
    if (q === null) return null;
    const start = ctx.pos - q.length - 2;
    const doc = opts.docPath();
    const root = opts.root();
    const insert = (link: string) => (view: EditorView, _c: Completion, _from: number, to: number) => {
      // Swallow a "]]" the user may already have typed after the cursor.
      const end = view.state.sliceDoc(to, to + 2) === ']]' ? to + 2 : to;
      view.dispatch({ changes: { from: start, to: end, insert: link }, selection: { anchor: start + link.length }, userEvent: 'input.complete' });
    };

    // [[Note#…: headings of that note (or of this one for [[#…).
    const hash = q.indexOf('#');
    if (hash !== -1) {
      const name = q.slice(0, hash).trim().toLowerCase();
      let target: string | null = null;
      let text: string;
      if (!name) text = ctx.state.doc.toString();
      else {
        const notes = await opts.files();
        target = notes.find((p) => stem(basename(p)).toLowerCase() === name) ?? notes.find((p) => stem(basename(p)).toLowerCase().startsWith(name)) ?? null;
        if (!target) return null;
        text = await opts.readText(target).catch(() => '');
      }
      if (ctx.aborted) return null;
      const options: Completion[] = headingsOf(text).map((h) => ({
        label: h.text,
        detail: '#'.repeat(h.level),
        apply: insert(headingLink(doc, target, h)),
      }));
      if (!options.length) return null;
      return { from: start + 2 + hash + 1, options, validFor: /^[^\[\]|\n#]*$/ };
    }

    const notes = (await opts.files()).filter((f) => !doc || !samePath(f, doc));
    const others = opts.allFiles ? (await opts.allFiles()).filter((f) => !isMarkdownPath(f)) : [];
    if (ctx.aborted) return null;
    const rel = (p: string) => {
      const d = dirname(p);
      return root && isWithin(d, root) ? d.slice(root.length).replace(/^[\\/]/, '') || '/' : d;
    };
    const options: Completion[] = [
      ...notes.map((path) => ({ label: stem(basename(path)), detail: rel(path), boost: 1, apply: insert(fileLink(opts.docPath(), path)) })),
      ...others.map((path) => ({ label: basename(path), detail: rel(path), apply: insert(fileLink(opts.docPath(), path)) })),
    ];
    if (!options.length) return null;
    return { from: start + 2, options, validFor: /^[^\[\]|#\n]*$/ };
  };
}
