import { syntaxTree } from '@codemirror/language';
import { StateEffect, StateField, type EditorState, type Extension, type Range, type Transaction } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { analyzeBlocks, analyzeInline } from './analyze';
import { liveConfig, type LiveConfig } from './config';
import { paragraphKeymap } from '../paragraphs';
import { BulletWidget, DiagramWidget, EmbedWidget, HrWidget, HtmlBlockWidget, ImageWidget, MathWidget, TableWidget, TaskWidget } from './widgets';

/** Forces live decorations to rebuild (for example after the colour scheme changes, for diagrams). */
export const refreshLive = StateEffect.define<null>();
const wantsRefresh = (tr: Transaction) => tr.effects.some((e) => e.is(refreshLive));

const hidden = Decoration.replace({});
const bullet = Decoration.replace({ widget: new BulletWidget() });
const hr = Decoration.replace({ widget: new HrWidget() });
const lineCache = new Map<string, Decoration>();
const lineDeco = (cls: string) => {
  let d = lineCache.get(cls);
  if (!d) lineCache.set(cls, (d = Decoration.line({ class: cls })));
  return d;
};

function buildInline(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const state = view.state;
  for (const { from, to } of view.visibleRanges) {
    for (const item of analyzeInline(state, from, to)) {
      switch (item.kind) {
        case 'hide':
          if (item.to > item.from) ranges.push(hidden.range(item.from, item.to));
          break;
        case 'mark':
          if (item.to > item.from)
            ranges.push(
              Decoration.mark({
                class: item.cls,
                attributes: item.href
                  ? { 'data-href': item.href, title: item.href }
                  : item.style
                    ? { style: item.style }
                    : undefined,
              }).range(item.from, item.to),
            );
          break;
        case 'line':
          ranges.push(lineDeco(item.cls).range(item.at));
          break;
        case 'bullet':
          ranges.push(bullet.range(item.from, item.to));
          break;
        case 'task':
          ranges.push(Decoration.replace({ widget: new TaskWidget(item.checked, item.from) }).range(item.from, item.to));
          break;
        case 'image':
          ranges.push(Decoration.replace({ widget: new ImageWidget(item.src, item.alt) }).range(item.from, item.to));
          break;
        case 'embed':
          ranges.push(Decoration.replace({ widget: new EmbedWidget(item.src, item.alt) }).range(item.from, item.to));
          break;
        case 'math':
          ranges.push(Decoration.replace({ widget: new MathWidget(item.tex, item.display) }).range(item.from, item.to));
          break;
        case 'image-after':
          ranges.push(Decoration.widget({ widget: new ImageWidget(item.src, item.alt, true), side: 1 }).range(item.at));
          break;
        case 'hr':
          ranges.push(hr.range(item.from, item.to));
          break;
      }
    }
  }
  return Decoration.set(ranges, true);
}

const inlinePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildInline(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.selectionSet ||
        syntaxTree(u.startState) !== syntaxTree(u.state) ||
        u.transactions.some(wantsRefresh)
      )
        this.decorations = buildInline(u.view);
    }
  },
  { decorations: (p) => p.decorations },
);

function buildBlocks(state: EditorState): DecorationSet {
  const theme = state.facet(liveConfig).colorScheme();
  return Decoration.set(
    analyzeBlocks(state).map((b) => {
      switch (b.kind) {
        case 'table':
          return Decoration.replace({ widget: new TableWidget(state.sliceDoc(b.from, b.to), b.from), block: true }).range(b.from, b.to);
        case 'html':
          return Decoration.replace({ widget: new HtmlBlockWidget(state.sliceDoc(b.from, b.to), b.from), block: true }).range(b.from, b.to);
        case 'math':
          return Decoration.replace({ widget: new MathWidget(b.tex, true, true), block: true }).range(b.from, b.to);
        case 'diagram':
          return Decoration.replace({ widget: new DiagramWidget(b.code, theme), block: true }).range(b.from, b.to);
        case 'math-preview':
          return Decoration.widget({ widget: new MathWidget(b.tex, true, true), block: true, side: 1 }).range(b.at);
        case 'diagram-preview':
          return Decoration.widget({ widget: new DiagramWidget(b.code, theme, true), block: true, side: 1 }).range(b.at);
      }
    }),
    true,
  );
}

const blockField = StateField.define<DecorationSet>({
  create: buildBlocks,
  update(deco, tr) {
    if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state) || wantsRefresh(tr))
      return buildBlocks(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const handlers = EditorView.domEventHandlers({
  mousedown(e, view) {
    const target = e.target as HTMLElement;

    const task = target.closest('.cm-live-task') as HTMLInputElement | null;
    if (task) {
      e.preventDefault();
      const pos = Number(task.dataset.pos);
      const ch = view.state.sliceDoc(pos + 1, pos + 2);
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: ch === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' });
      return true;
    }

    const table = target.closest('.cm-live-table') as HTMLElement | null;
    if (table) {
      e.preventDefault();
      // Put the cursor in the clicked cell's row if we can find it, otherwise at the table start.
      const pos = Number(table.dataset.pos);
      const rows = [...table.querySelectorAll('tr')];
      const row = target.closest('tr');
      const rowIndex = row ? rows.indexOf(row) : 0;
      const doc = view.state.doc;
      const first = doc.lineAt(pos).number;
      // Source line for the row: the header is line 0, then the delimiter, then the body rows.
      const lineNo = Math.min(doc.lines, first + (rowIndex <= 0 ? 0 : rowIndex + 1));
      const line = doc.line(lineNo);
      view.dispatch({ selection: { anchor: Math.min(line.to, line.from + 2) } });
      view.focus();
      return true;
    }

    const locate = target.closest('.cm-live-image-locate') as HTMLElement | null;
    if (locate) {
      e.preventDefault();
      view.state.facet(liveConfig).locateImage?.(locate.dataset.src ?? '');
      return true;
    }

    const html = target.closest('.cm-live-htmlblock') as HTMLElement | null;
    if (html) {
      e.preventDefault();
      view.dispatch({ selection: { anchor: Number(html.dataset.pos) } });
      view.focus();
      return true;
    }

    const link = target.closest('.cm-live-link') as HTMLElement | null;
    const mod = navigator.userAgent.includes('Mac') ? e.metaKey : e.ctrlKey;
    if (link && mod && link.dataset.href) {
      e.preventDefault();
      view.state.facet(liveConfig).openLink(link.dataset.href);
      return true;
    }
    return false;
  },
});

/** Live (hybrid) mode: Markdown renders in place, and syntax reappears where the cursor is. */
export function livePreview(config: LiveConfig): Extension {
  return [
    liveConfig.of(config),
    inlinePlugin,
    blockField,
    handlers,
    paragraphKeymap,
    EditorView.editorAttributes.of({ class: 'cm-live' }),
  ];
}
