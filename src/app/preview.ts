import type { ViewUpdate } from '@codemirror/view';
import { EditorView } from '@codemirror/view';
import { createRenderer } from '../render/markdown';
import { activateEmbed } from '../render/embeds';
import { patchChildren, rememberOriginal } from '../render/patch';
import { ScrollSync } from '../sync/scrollSync';
import type { Platform } from '../platform/types';
import { openLink as openLinkWith } from './links';
import { previewImageResize } from './previewImageResize';

export interface PreviewDeps {
  view: EditorView;
  platform: Platform;
  scroller: HTMLElement;
  content: HTMLElement;
  docPath: () => string | null;
  isVisible: () => boolean;
  openPath: (path: string) => void;
  /** Follows a [[wiki link]] (target as written). */
  openWiki?: (target: string) => void;
  colorScheme: () => 'light' | 'dark';
}

/**
 * Owns the rendered preview: debounced rendering, DOM patching, scroll and cursor sync, and
 * interaction (links, task checkboxes, click-to-locate).
 */
export function createPreview(deps: PreviewDeps) {
  const { view, platform, scroller, content } = deps;
  const renderer = createRenderer();
  const sync = new ScrollSync(view, scroller, content);
  const stopResize = previewImageResize(view, scroller, content);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastRendered: string | null = null;

  function cursorLine() {
    return view.state.doc.lineAt(view.state.selection.main.head).number - 1;
  }

  function renderNow() {
    clearTimeout(timer);
    if (!deps.isVisible()) return;
    const text = view.state.doc.toString();
    const key = text + '\u0000' + (deps.docPath() ?? '') + '\u0000' + deps.colorScheme();
    if (key === lastRendered) return;
    lastRendered = key;
    const html = renderer.render(text, {
      docPath: deps.docPath(),
      resolveAsset: platform.assetUrl,
      colorScheme: deps.colorScheme(),
      onAsyncUpdate: () => {
        lastRendered = null;
        schedule(30);
      },
    });
    patchChildren(content, html);
    sync.refresh();
    sync.highlightLine(cursorLine());
  }

  function schedule(delay?: number) {
    if (!deps.isVisible()) return;
    clearTimeout(timer);
    const len = view.state.doc.length;
    timer = setTimeout(renderNow, delay ?? (len < 20_000 ? 16 : len < 200_000 ? 90 : 250));
  }

  function onEditorUpdate(u: ViewUpdate) {
    if (u.docChanged) schedule();
    if (u.heightChanged || u.geometryChanged) sync.refresh();
    if (u.selectionSet && !u.docChanged) sync.highlightLine(cursorLine());
  }

  function toggleTask(line: number) {
    const doc = view.state.doc;
    if (line + 1 > doc.lines) return;
    const l = doc.line(line + 1);
    const m = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/.exec(l.text);
    if (!m) return;
    const at = l.from + m[1].length + 1;
    view.dispatch({ changes: { from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' }, userEvent: 'input.toggle' });
  }

  function openLink(href: string) {
    openLinkWith(href, {
      platform,
      docPath: deps.docPath(),
      openPath: deps.openPath,
      openWiki: deps.openWiki,
      gotoAnchor: (id) => content.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }),
    });
  }

  function onClick(e: MouseEvent, opts: { locate: boolean }) {
    const t = e.target as HTMLElement;
    const card = t.closest('.embed-play')?.closest('.embed-card') as HTMLElement | null;
    if (card) {
      e.preventDefault();
      rememberOriginal(card);
      activateEmbed(card);
      sync.refresh();
      return;
    }
    const checkbox = t.closest('input.task-checkbox') as HTMLInputElement | null;
    if (checkbox) {
      e.preventDefault();
      toggleTask(Number(checkbox.dataset.taskLine));
      return;
    }
    const a = t.closest('a[href]') as HTMLAnchorElement | null;
    if (a) {
      e.preventDefault();
      openLink(a.getAttribute('href')!);
      return;
    }
    if (!opts.locate || !window.getSelection()?.isCollapsed) return;
    const line = ScrollSync.lineAt(t);
    if (line === null) return;
    const doc = view.state.doc;
    const pos = doc.line(Math.min(line + 1, doc.lines)).from;
    view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'nearest' }) });
    view.focus();
  }

  return {
    sync,
    renderNow,
    schedule,
    onEditorUpdate,
    onClick,
    /** Forget the cache so the next render always runs (after tab switches or theme changes). */
    invalidate() {
      lastRendered = null;
    },
    dispose() {
      clearTimeout(timer);
      stopResize();
      sync.dispose();
    },
  };
}
