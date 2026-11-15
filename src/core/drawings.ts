import { markdownUrl, relativePath } from './assets';
import { basename, dirname } from './paths';

/**
 * Drawings are their own files next to your notes: `Name.excalidraw.svg`, an SVG picture (so
 * GitHub, Obsidian and any viewer show it) with the editable Excalidraw scene inside. CalmMD also
 * opens Excalidraw's own `.excalidraw` JSON files.
 */
export const DRAWING_EXT = '.excalidraw.svg';

export function isDrawingPath(p: string): boolean {
  return /\.excalidraw(\.svg)?$/i.test(p);
}

/** The drawing's name without its extension ("Kitchen layout"). */
export function drawingTitle(p: string): string {
  return basename(p).replace(/\.excalidraw(\.svg)?$/i, '');
}

/** A file name for a new drawing, from what the user typed: unsafe characters out, extension added. */
export function drawingFileName(name: string): string | null {
  const clean = name
    .replace(/\.excalidraw(\.svg)?$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return clean ? clean + DRAWING_EXT : null;
}

/** The Markdown for a drawing inside a note: an image whose alt text is the drawing's name. */
export function drawingMarkdown(docPath: string | null, drawingPath: string): string {
  const rel = docPath ? relativePath(dirname(docPath), drawingPath) : null;
  const url = markdownUrl(rel ?? drawingPath);
  const alt = drawingTitle(drawingPath).replace(/[[\]|]/g, ' ');
  return `![${alt}](${url})`;
}
