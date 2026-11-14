import type { EditorView } from '@codemirror/view';
import { MIN_IMAGE_WIDTH, nthImageAlt, withAltSize } from '../core/imageSize';

/**
 * Resizing images in the preview: hovering an image shows a corner handle; dragging it resizes the
 * picture, and the width is written into the source (`![alt|300](…)`) when the drag ends.
 * Double-clicking the handle restores the natural size. The handle lives in the scroller (not the
 * rendered content), so re-renders never remove it mid-drag.
 */
export function previewImageResize(view: EditorView, scroller: HTMLElement, content: HTMLElement): () => void {
  const handle = document.createElement('span');
  handle.className = 'preview-image-handle';
  handle.title = 'Drag to resize · double-click for the original size';
  handle.hidden = true;
  scroller.append(handle);
  let target: HTMLImageElement | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const place = (img: HTMLImageElement) => {
    const s = scroller.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    handle.style.left = `${r.right - s.left + scroller.scrollLeft - 9}px`;
    handle.style.top = `${r.bottom - s.top + scroller.scrollTop - 9}px`;
    handle.hidden = false;
  };
  const hide = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!handle.classList.contains('dragging')) handle.hidden = true;
    }, 250);
  };
  /** Markdown images only (not embeds or raw <img> tags, whose size lives elsewhere). */
  const resizable = (el: Element | null): el is HTMLImageElement =>
    el instanceof HTMLImageElement && !el.closest('.embed, .html-block, .mermaid-block') && !!el.closest('[data-line-start]');

  const onOver = (e: MouseEvent) => {
    const img = e.target as Element;
    if (!resizable(img)) return;
    clearTimeout(hideTimer);
    target = img;
    place(img);
  };
  const onOut = (e: MouseEvent) => {
    if (resizable(e.target as Element) && e.relatedTarget !== handle) hide();
  };

  /** Writes a width (or null) for the hovered image into the document. */
  const write = (img: HTMLImageElement, width: number | null) => {
    const block = img.closest<HTMLElement>('[data-line-start]');
    if (!block) return;
    const start = Number(block.dataset.lineStart);
    const end = Number(block.dataset.lineEnd);
    const doc = view.state.doc;
    if (!(start >= 0) || end > doc.lines || end <= start) return;
    const from = doc.line(start + 1).from;
    const text = view.state.sliceDoc(from, doc.line(end).to);
    // The image's position among the Markdown images of its block.
    const index = [...block.querySelectorAll('img')].filter((i) => resizable(i)).indexOf(img);
    const r = index >= 0 ? nthImageAlt(text, index) : null;
    if (!r) return;
    view.dispatch({ changes: { from: from + r.from, to: from + r.to, insert: withAltSize(r.alt, width) }, userEvent: 'input.resize' });
  };

  const onDown = (e: PointerEvent) => {
    const img = target;
    if (!img) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {
      // synthetic or already-released pointers can't be captured; the drag still works while over the handle
    }
    handle.classList.add('dragging');
    const startX = e.clientX;
    const startW = img.getBoundingClientRect().width;
    const maxW = content.getBoundingClientRect().width;
    const move = (ev: PointerEvent) => {
      img.style.width = `${Math.round(Math.min(maxW, Math.max(MIN_IMAGE_WIDTH, startW + ev.clientX - startX)))}px`;
      img.style.height = 'auto';
      place(img);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.classList.remove('dragging');
      const w = parseFloat(img.style.width);
      if (Math.abs(w - startW) >= 2) write(img, w);
      hide();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
  };
  const onDbl = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (target) write(target, null);
  };
  const onScroll = () => {
    if (!handle.classList.contains('dragging')) handle.hidden = true;
  };

  content.addEventListener('mouseover', onOver);
  content.addEventListener('mouseout', onOut);
  handle.addEventListener('mouseleave', hide);
  handle.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  handle.addEventListener('pointerdown', onDown);
  handle.addEventListener('dblclick', onDbl);
  // Clicks on the handle must not reach the preview's click-to-locate.
  handle.addEventListener('click', (e) => e.stopPropagation());
  scroller.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    content.removeEventListener('mouseover', onOver);
    content.removeEventListener('mouseout', onOut);
    scroller.removeEventListener('scroll', onScroll);
    handle.remove();
  };
}
