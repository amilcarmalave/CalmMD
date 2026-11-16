import { EditorView, WidgetType } from '@codemirror/view';
import katex from 'katex';
import { diagramFor } from '../../render/diagrams';
import { activateEmbed, embedPageUrl, parseEmbed } from '../../render/embeds';
import { liveConfig } from './config';
import { altRangeAt, MIN_IMAGE_WIDTH, parseAltSize, withAltSize } from '../../core/imageSize';

/** Rendered TeX. Inline or display. */
export class MathWidget extends WidgetType {
  constructor(
    readonly tex: string,
    readonly display: boolean,
    readonly block = false,
  ) {
    super();
  }
  eq(o: MathWidget) {
    return o.tex === this.tex && o.display === this.display && o.block === this.block;
  }
  toDOM() {
    const el = document.createElement(this.block ? 'div' : 'span');
    el.className = this.block ? 'cm-live-math-block' : 'cm-live-math';
    if (!this.tex.trim()) {
      el.textContent = this.block ? 'Empty equation' : '';
      el.classList.add('empty');
      return el;
    }
    katex.render(this.tex, el, { displayMode: this.display || this.block, throwOnError: false, strict: 'ignore', trust: false });
    return el;
  }
  get estimatedHeight() {
    return this.block ? 56 : -1;
  }
  ignoreEvent() {
    return false; // clicking puts the cursor there, which reveals the source
  }
}

/** A Mermaid diagram. Fills itself in when the (lazy) render finishes. */
export class DiagramWidget extends WidgetType {
  constructor(
    readonly code: string,
    readonly theme: 'light' | 'dark',
    readonly companion = false,
  ) {
    super();
  }
  eq(o: DiagramWidget) {
    return o.code === this.code && o.companion === this.companion && o.theme === this.theme;
  }
  toDOM(view: EditorView) {
    const el = document.createElement('div');
    el.className = 'cm-live-diagram' + (this.companion ? ' companion' : '');
    const theme = this.theme;
    const show = (r: { svg?: string; error?: string }) => {
      if (r.svg) el.innerHTML = r.svg;
      else {
        el.textContent = `Diagram error: ${r.error}`;
        el.classList.add('error');
      }
      view.requestMeasure();
    };
    if (!this.code.trim()) {
      el.textContent = 'Empty diagram';
      el.classList.add('empty');
      return el;
    }
    const ready = diagramFor(this.code, theme, () => {
      const r = diagramFor(this.code, theme);
      if (r && el.isConnected) show(r);
    });
    if (ready) show(ready);
    else {
      el.textContent = 'Rendering diagram…';
      el.classList.add('pending');
    }
    return el;
  }
  get estimatedHeight() {
    return 180;
  }
  ignoreEvent() {
    return false;
  }
}

/** Video: a click-to-load card for YouTube or Vimeo, a player for video files. */
export class EmbedWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(o: EmbedWidget) {
    return o.src === this.src && o.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const e = parseEmbed(this.src)!;
    const wrap = document.createElement('span');
    if (e.kind === 'video') {
      wrap.className = 'cm-live-embed embed embed-video';
      const v = document.createElement('video');
      v.controls = true;
      v.preload = 'metadata';
      v.src = view.state.facet(liveConfig).resolveImage(this.src);
      v.onloadedmetadata = () => view.requestMeasure();
      wrap.append(v);
      return wrap;
    }
    const provider = e.kind === 'youtube' ? 'YouTube' : 'Vimeo';
    wrap.className = 'cm-live-embed embed embed-card';
    wrap.dataset.embedKind = e.kind;
    wrap.dataset.embedId = e.id;
    if (e.kind === 'youtube' && e.start) wrap.dataset.embedStart = String(e.start);
    wrap.dataset.embedTitle = this.alt;
    wrap.dataset.embedUrl = embedPageUrl(e);
    wrap.innerHTML =
      `<button type="button" class="embed-play"><span class="embed-icon" aria-hidden="true"></span>` +
      `<span class="embed-text"><span class="embed-title"></span><span class="embed-provider">${provider} · loads when you click</span></span></button>`;
    wrap.querySelector('.embed-title')!.textContent = this.alt || `${provider} video`;
    // The editor ignores events on the button (see ignoreEvent), so it handles its own click.
    wrap.querySelector('.embed-play')!.addEventListener('click', (ev) => {
      ev.preventDefault();
      activateEmbed(wrap);
      view.requestMeasure();
    });
    return wrap;
  }
  get estimatedHeight() {
    return 76;
  }
  ignoreEvent(e: Event) {
    // Let the editor see clicks outside the play button (to edit the source).
    return !!(e.target as Element).closest?.('.embed-play, iframe, video');
  }
}

export class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-live-bullet';
    el.textContent = '•';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
}

export class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: TaskWidget) {
    return other.checked === this.checked && other.pos === this.pos;
  }
  toDOM() {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-live-task';
    box.checked = this.checked;
    box.dataset.pos = String(this.pos);
    box.setAttribute('aria-label', this.checked ? 'Completed task' : 'Open task');
    return box;
  }
  ignoreEvent() {
    // false: let the editor see the event so the mousedown handler in decorations.ts toggles it.
    return false;
  }
}

export class HrWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-live-hr';
    return el;
  }
}

/** Bumped when an image file changes on disk (a drawing was saved), so image widgets redraw. */
let imageEpoch = 0;
export function imagesChanged() {
  imageEpoch++;
}

export class ImageWidget extends WidgetType {
  readonly epoch = imageEpoch;
  constructor(
    readonly src: string,
    readonly alt: string,
    /** Shown after the revealed source while editing it. */
    readonly companion = false,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt && other.companion === this.companion && other.epoch === this.epoch;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = this.companion ? 'cm-live-image cm-live-image-companion' : 'cm-live-image';
    const img = document.createElement('img');
    const size = parseAltSize(this.alt);
    img.alt = size.alt;
    img.title = size.alt;
    if (size.width) img.style.width = `${size.width}px`;
    if (size.align === 'center' || size.align === 'right') wrap.classList.add(`align-${size.align}`);
    img.decoding = 'async';
    img.src = view.state.facet(liveConfig).resolveImage(this.src);
    // Height changes when the image arrives. Let CodeMirror re-measure so the scroll doesn't jump.
    img.onload = () => view.requestMeasure();
    img.onerror = () => {
      wrap.classList.add('broken');
      wrap.textContent = '';
      const label = document.createElement('span');
      label.textContent = `Image not found: ${this.alt || this.src}`;
      wrap.append(label);
      // Local images can be found again; the button picks the file and fixes the link.
      if (view.state.facet(liveConfig).locateImage && !/^[a-z][a-z0-9+.-]*:/i.test(this.src.replace(/^[a-zA-Z]:[\\/]/, ''))) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cm-live-image-locate';
        btn.textContent = 'Locate…';
        btn.dataset.src = this.src;
        wrap.append(btn);
      }
      view.requestMeasure();
    };
    wrap.append(img);
    if (!this.companion) wrap.append(resizeHandle(view, wrap, img));
    return wrap;
  }
  ignoreEvent(e: Event) {
    // The resize handle handles its own pointer events; other clicks place the cursor (CodeMirror).
    return !!(e.target as Element | null)?.closest?.('.cm-live-image-handle');
  }
}

/**
 * A corner handle that resizes an image by dragging; the width is written into the alt text when
 * the drag ends (`![alt|300](…)`). Double-click the handle to go back to the natural size.
 */
function resizeHandle(view: EditorView, wrap: HTMLElement, img: HTMLImageElement): HTMLElement {
  const handle = document.createElement('span');
  handle.className = 'cm-live-image-handle';
  handle.title = 'Drag to resize · double-click for the original size';
  const write = (width: number | null) => {
    const pos = view.posAtDOM(wrap);
    const r = altRangeAt(view.state.doc.toString(), pos);
    if (!r) return;
    view.dispatch({ changes: { from: r.from, to: r.to, insert: withAltSize(r.alt, width) }, userEvent: 'input.resize' });
  };
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // synthetic or already-released pointers can't be captured; the drag still works while over the handle
    }
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    const maxW = (wrap.parentElement?.getBoundingClientRect().width ?? 2000) - 8;
    wrap.classList.add('resizing');
    const move = (ev: PointerEvent) => {
      img.style.width = `${Math.round(Math.min(maxW, Math.max(MIN_IMAGE_WIDTH, startW + ev.clientX - startX)))}px`;
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      wrap.classList.remove('resizing');
      const w = parseFloat(img.style.width);
      if (Math.abs(w - startW) >= 2) write(w);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  });
  handle.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    write(null);
  });
  return handle;
}

/** A raw HTML block (with any Markdown inside it), rendered and sanitised like the preview. */
export class HtmlBlockWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: HtmlBlockWidget) {
    return other.source === this.source && other.pos === this.pos;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('div');
    wrap.className = 'cm-live-htmlblock md-body';
    wrap.dataset.pos = String(this.pos);
    wrap.innerHTML = view.state.facet(liveConfig).renderMarkdown(this.source);
    for (const el of wrap.querySelectorAll('[data-line-start]')) {
      el.removeAttribute('data-line-start');
      el.removeAttribute('data-line-end');
    }
    return wrap;
  }
  get estimatedHeight() {
    return this.source.split('\n').length * 28;
  }
  ignoreEvent(e: Event) {
    // <summary> clicks toggle the <details> natively instead of revealing the source.
    if ((e.target as Element | null)?.closest?.('summary')) return true;
    return e.type !== 'mousedown';
  }
}

export { TableWidget } from './tableWidget';
