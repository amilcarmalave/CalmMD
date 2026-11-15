import { syntaxTree } from '@codemirror/language';
import { StateEffect, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * Misspelling underlines from the OS spellchecker. The webview's own underlines vanish whenever Live
 * mode redraws a line, and they can disagree with the suggestions in our right-click menu, so we
 * check the visible lines ourselves (in one batch, cached by line text) and draw the underlines.
 * Code, links, URLs, math, HTML and front matter are never marked, nor the word being typed.
 */
export interface SpellingOptions {
  /** Misspelled ranges in `text` as [from, to) string offsets, or null when there's no checker. */
  check: (text: string) => Promise<[number, number][] | null>;
}

/** Forget cached results and check again (a word was added to the dictionary, or the language changed). */
export const recheckSpelling = StateEffect.define<null>();
const resultsArrived = StateEffect.define<null>();

const misspelled = Decoration.mark({ class: 'cm-misspelled' });

/** Syntax that isn't prose. */
const SKIP = new Set([
  'InlineCode', 'FencedCode', 'CodeBlock', 'CodeText', 'CodeInfo', 'URL', 'Autolink', 'LinkLabel', 'LinkReference',
  'HTMLTag', 'HTMLBlock', 'CommentBlock', 'Comment', 'ProcessingInstruction', 'InlineMath', 'BlockMath', 'FrontMatter', 'WikiLink',
]);

function isProse(state: EditorState, pos: number): boolean {
  for (let n: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(state).resolveInner(pos, 1); n; n = n.parent)
    if (SKIP.has(n.name)) return false;
  return true;
}

/** Joins lines for one request and maps result offsets back to [line index, from, to]. */
export function splitResults(lines: string[], ranges: [number, number][]): [number, number, number][] {
  const starts: number[] = [];
  let at = 0;
  for (const l of lines) {
    starts.push(at);
    at += l.length + 1;
  }
  const out: [number, number, number][] = [];
  let i = 0;
  for (const [a, b] of [...ranges].sort((x, y) => x[0] - y[0])) {
    while (i + 1 < starts.length && starts[i + 1] <= a) i++;
    const from = a - starts[i];
    const to = Math.min(b - starts[i], lines[i].length);
    if (to > from) out.push([i, from, to]);
  }
  return out;
}

const MAX_CACHE = 5000;
const MAX_LINES_PER_CHECK = 300;

export function spelling(opts: SpellingOptions): Extension {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;
      cache = new Map<string, [number, number][]>();
      timer: ReturnType<typeof setTimeout> | undefined;
      unavailable = false;
      /** While typing a word, it isn't marked until the cursor leaves it. */
      typingAt: number | null = null;

      constructor(readonly view: EditorView) {
        this.decorations = this.build();
        this.schedule();
      }

      update(u: ViewUpdate) {
        let rebuild = u.transactions.some((t) => t.effects.some((e) => e.is(resultsArrived)));
        if (u.transactions.some((t) => t.effects.some((e) => e.is(recheckSpelling)))) {
          this.cache.clear();
          rebuild = true;
        }
        if (u.docChanged) {
          const typed = u.transactions.some((t) => t.isUserEvent('input.type'));
          this.typingAt = typed ? u.state.selection.main.head : null;
        } else if (u.selectionSet && this.typingAt !== null) {
          this.typingAt = null;
          rebuild = true;
        }
        if (rebuild || u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = this.build();
          this.schedule();
        }
      }

      build(): DecorationSet {
        if (this.unavailable) return Decoration.none;
        const { state } = this.view;
        const ranges: Range<Decoration>[] = [];
        for (const { from, to } of this.view.visibleRanges) {
          for (let pos = from; pos <= to; ) {
            const line = state.doc.lineAt(pos);
            for (const [a, b] of this.cache.get(line.text) ?? []) {
              const s = line.from + a;
              const e = line.from + b;
              if (this.typingAt !== null && this.typingAt >= s && this.typingAt <= e) continue;
              if (isProse(state, s)) ranges.push(misspelled.range(s, e));
            }
            pos = line.to + 1;
          }
        }
        return Decoration.set(ranges, true);
      }

      schedule() {
        if (this.unavailable) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.checkVisible(), 250);
      }

      async checkVisible() {
        const { state } = this.view;
        const wanted = new Set<string>();
        for (const { from, to } of this.view.visibleRanges) {
          for (let pos = from; pos <= to && wanted.size < MAX_LINES_PER_CHECK; ) {
            const line = state.doc.lineAt(pos);
            if (/\p{L}/u.test(line.text) && !this.cache.has(line.text)) wanted.add(line.text);
            pos = line.to + 1;
          }
        }
        if (!wanted.size) return;
        const lines = [...wanted];
        const result = await opts.check(lines.join('\n')).catch(() => null);
        if (result === null) {
          this.unavailable = true;
          return;
        }
        if (this.cache.size > MAX_CACHE) this.cache.clear();
        for (const l of lines) this.cache.set(l, []);
        for (const [i, a, b] of splitResults(lines, result)) this.cache.get(lines[i])!.push([a, b]);
        this.view.dispatch({ effects: resultsArrived.of(null) });
      }

      destroy() {
        clearTimeout(this.timer);
      }
    },
    { decorations: (p) => p.decorations },
  );
  return [plugin, EditorView.baseTheme({ '.cm-misspelled': { textDecoration: 'underline wavy #e5484d', textDecorationSkipInk: 'none', textUnderlineOffset: '3px' } })];
}
