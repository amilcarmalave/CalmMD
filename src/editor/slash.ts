import { autocompletion, type Completion, type CompletionContext, type CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

export interface SlashItem {
  label: string;
  detail?: string;
  /** Extra words to match ("hr" for Divider). */
  keywords?: string;
  /** Runs after the "/query" text has been removed. */
  run: (view: EditorView) => void;
}

/** "/" at the start of a line (optionally indented), followed by an optional filter word. */
export function slashQuery(lineTextBeforeCursor: string): { start: number; query: string } | null {
  const m = /^(\s*)\/([\w-]*)$/.exec(lineTextBeforeCursor);
  return m ? { start: m[1].length, query: m[2] } : null;
}

/**
 * Slash commands: typing "/" on an empty line offers blocks to insert. Escape or typing past a
 * space dismisses it. It's built on CodeMirror's autocomplete, so keyboard navigation and
 * accessibility come for free.
 */
export function slashCommands(items: () => SlashItem[], enabled: () => boolean, more: CompletionSource[] = []): Extension {
  const source = (ctx: CompletionContext) => {
    if (!enabled()) return null;
    const line = ctx.state.doc.lineAt(ctx.pos);
    const q = slashQuery(line.text.slice(0, ctx.pos - line.from));
    if (!q) return null;
    const slashAt = line.from + q.start;
    const options: Completion[] = items().map((item) => ({
      label: item.label,
      detail: item.detail,
      // Keywords take part in matching but aren't shown.
      ...(item.keywords ? { displayLabel: item.label, label: `${item.label} ${item.keywords}` } : {}),
      apply: (view: EditorView, _c: Completion, _from: number, to: number) => {
        view.dispatch({ changes: { from: slashAt, to } });
        item.run(view);
      },
    }));
    return { from: slashAt + 1, options, validFor: /^[\w-]*$/ };
  };
  return autocompletion({
    // One autocomplete for the editor: slash commands, plus other sources (the [[ note picker).
    override: [source, ...more],
    icons: false,
    activateOnTyping: true,
    closeOnBlur: true,
    maxRenderedOptions: 30,
    tooltipClass: () => 'cm-slash-menu',
  });
}
