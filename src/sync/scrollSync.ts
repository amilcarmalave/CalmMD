import { EditorView } from '@codemirror/view';
import {
  blockForLine,
  buildAnchors,
  editorToPreview,
  previewToEditor,
  type Anchor,
  type BlockBox,
  type EditorGeometry,
} from './scrollMap';

export type Pane = 'editor' | 'preview';
type Block = BlockBox & { el: HTMLElement };

// Events that mean "the user is driving this pane now".
const INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Keeps the editor and the preview scrolled to the same place, in both directions.
 *
 * - The *leader* is the pane the user last interacted with. Only the leader drives, and the
 *   follower's resulting scroll event is recognised as an echo and ignored, so the panes never
 *   fight or drift.
 * - Anchors (see scrollMap.ts) are rebuilt lazily after renders, resizes, image loads and
 *   editor height changes. At most one sync runs per animation frame.
 */
export class ScrollSync {
  private enabled = true;
  private anchors: Anchor[] | null = null;
  /** Scroll extents the cached anchors were built with. Any change invalidates them. */
  private builtFor = { a: -1, b: -1 };
  private blocks: Block[] | null = null;
  private leader: Pane = 'editor';
  private expected: Record<Pane, number | null> = { editor: null, preview: null };
  private frame = 0;
  private cursorEl: HTMLElement | null = null;
  private disposers: (() => void)[] = [];

  constructor(
    private readonly view: EditorView,
    private readonly preview: HTMLElement,
    private readonly content: HTMLElement,
  ) {
    const panes: [Pane, HTMLElement][] = [
      ['editor', view.scrollDOM],
      ['preview', preview],
    ];
    for (const [pane, el] of panes) {
      const onInput = () => {
        this.leader = pane;
        this.expected[pane] = null;
      };
      const onScroll = () => this.onScroll(pane);
      for (const type of INPUT_EVENTS) el.addEventListener(type, onInput, { passive: true, capture: true });
      el.addEventListener('scroll', onScroll, { passive: true });
      this.disposers.push(() => {
        for (const type of INPUT_EVENTS) el.removeEventListener(type, onInput, { capture: true });
        el.removeEventListener('scroll', onScroll);
      });
    }

    const ro = new ResizeObserver(() => this.refresh());
    ro.observe(content);
    ro.observe(preview);
    ro.observe(view.scrollDOM);
    // Images and other media change height when they load. 'load' doesn't bubble, so capture it.
    const onLoad = () => this.refresh();
    content.addEventListener('load', onLoad, true);
    this.disposers.push(() => {
      ro.disconnect();
      content.removeEventListener('load', onLoad, true);
    });
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on) this.refresh();
  }

  /** Geometry changed (new render, editor heights). Rebuild anchors and re-align from the leader. */
  refresh() {
    this.anchors = null;
    this.blocks = null;
    this.schedule();
  }

  /** Align the other pane to `pane` now (used after switching tabs or view modes). */
  alignFrom(pane: Pane) {
    this.leader = pane;
    this.refresh();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    for (const d of this.disposers) d();
  }

  /** Marks the preview block for the editor's cursor line. */
  highlightLine(line: number | null) {
    const el = line === null || !this.visible() ? null : (blockForLine(this.getBlocks(), line)?.el ?? null);
    if (el === this.cursorEl && el?.isConnected) return;
    this.cursorEl?.removeAttribute('data-cursor');
    el?.setAttribute('data-cursor', '');
    this.cursorEl = el;
    // With sync on, the preview already follows the editor. Without it, reveal the block.
    if (el && !this.enabled) {
      const r = el.getBoundingClientRect();
      const p = this.preview.getBoundingClientRect();
      if (r.bottom < p.top || r.top > p.bottom) el.scrollIntoView({ block: 'center' });
    }
  }

  /**
   * The source line at the top of a pane's viewport. Only that pane needs to be visible, so this
   * hands the reading position over when switching between Source and Preview.
   */
  topLine(pane: Pane): number {
    if (pane === 'editor') {
      const view = this.view;
      const scroller = view.scrollDOM;
      const docOffset = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const block = view.lineBlockAtHeight(Math.max(0, scroller.scrollTop - docOffset));
      return view.state.doc.lineAt(block.from).number - 1;
    }
    this.blocks = null;
    const y = this.preview.scrollTop;
    let line = 0;
    for (const b of this.getBlocks()) if (b.top <= y + 1 && b.start > line) line = b.start;
    return line;
  }

  scrollToLine(pane: Pane, line: number) {
    if (pane === 'editor') {
      const doc = this.view.state.doc;
      if (line <= 0) this.view.scrollDOM.scrollTop = 0;
      else {
        const pos = doc.line(Math.min(line + 1, doc.lines)).from;
        this.view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 }) });
      }
      return;
    }
    this.blocks = null;
    let target: Block | null = null;
    for (const b of this.getBlocks()) if (b.start <= line && (!target || b.start > target.start)) target = b;
    this.preview.scrollTop = line <= 0 || !target ? 0 : target.top;
  }

  /** The source line of the block under a preview element (for click-to-locate). */
  static lineAt(target: EventTarget | null): number | null {
    const el = (target as Element | null)?.closest?.('[data-line-start]') as HTMLElement | null;
    return el ? Number(el.dataset.lineStart) : null;
  }

  private visible(): boolean {
    return this.preview.offsetParent !== null && this.view.scrollDOM.offsetParent !== null;
  }

  private onScroll(pane: Pane) {
    const el = pane === 'editor' ? this.view.scrollDOM : this.preview;
    const exp = this.expected[pane];
    if (exp !== null && Math.abs(el.scrollTop - exp) <= 2) {
      this.expected[pane] = null; // echo of our own programmatic scroll
      return;
    }
    this.expected[pane] = null;
    this.leader = pane;
    this.schedule();
  }

  private schedule() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.syncNow();
    });
  }

  private syncNow() {
    if (!this.enabled || !this.visible()) return;
    const anchors = this.getAnchors();
    if (this.leader === 'editor') {
      this.setScroll('preview', editorToPreview(anchors, this.view.scrollDOM.scrollTop));
    } else {
      this.setScroll('editor', previewToEditor(anchors, this.preview.scrollTop));
    }
  }

  private setScroll(pane: Pane, y: number) {
    const el = pane === 'editor' ? this.view.scrollDOM : this.preview;
    const max = el.scrollHeight - el.clientHeight;
    const target = Math.max(0, Math.min(max, y));
    if (Math.abs(el.scrollTop - target) < 1) return;
    el.scrollTop = target;
    this.expected[pane] = el.scrollTop; // read back: the browser may round
  }

  private getBlocks(): Block[] {
    if (this.blocks) return this.blocks;
    const pRect = this.preview.getBoundingClientRect();
    const base = pRect.top - this.preview.scrollTop;
    const out: Block[] = [];
    for (const el of this.content.querySelectorAll<HTMLElement>('[data-line-start]')) {
      const r = el.getBoundingClientRect();
      out.push({
        el,
        start: Number(el.dataset.lineStart),
        end: Number(el.dataset.lineEnd),
        top: r.top - base,
        bottom: r.bottom - base,
      });
    }
    return (this.blocks = out);
  }

  private getAnchors(): Anchor[] {
    const view = this.view;
    const scroller = view.scrollDOM;
    const aMax = scroller.scrollHeight - scroller.clientHeight;
    const bMax = this.preview.scrollHeight - this.preview.clientHeight;
    // Cheap staleness check: layout can change without any event we hear about (late font
    // loads, CodeMirror re-measuring estimated line heights). If either scroll extent moved,
    // the anchors are stale.
    if (this.anchors && this.builtFor.a === aMax && this.builtFor.b === bMax) return this.anchors;
    this.blocks = null;
    this.builtFor = { a: aMax, b: bMax };
    const doc = view.state.doc;
    // Document y=0 in the scroller's content coordinates.
    const docOffset = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const geometry: EditorGeometry = {
      lineCount: doc.lines,
      lineTop: (l) => docOffset + view.lineBlockAt(doc.line(l + 1).from).top,
      lineBottom: (l) => docOffset + view.lineBlockAt(doc.line(l + 1).to).bottom,
    };
    this.anchors = buildAnchors(this.getBlocks(), geometry, { aMax, bMax });
    return this.anchors;
  }
}
