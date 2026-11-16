import { dirname, isMarkdownPath, joinPath, samePath, separatorOf } from '../core/paths';
import type { Platform } from '../platform/types';

export interface LinkContext {
  platform: Platform;
  docPath: string | null;
  /** Opens a note, then scrolls to the heading the anchor names ("Plan.md#budget"). */
  openPath: (path: string, anchor?: string) => void;
  /** Opens a file that isn't a note (picture, PDF, drawing) in a tab. */
  openFile?: (path: string) => void;
  /** In-document anchors ("#section"). */
  gotoAnchor: (id: string) => void;
  /** `[[Wiki links]]`: the target as written ("Note#Heading"). */
  openWiki?: (target: string) => void;
}

/** Absolute file path for a relative image or link target, or null for URLs. */
export function resolveLocalPath(target: string, docPath: string | null): string | null {
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//') || target.startsWith('#')) return null;
  let t = target.split('#')[0];
  try {
    t = decodeURI(t);
  } catch {
    // keep as written
  }
  if (/^([a-zA-Z]:)?[\\/]/.test(t)) return t;
  if (!docPath) return null;
  return joinPath(dirname(docPath), t.replace(/^\.[\\/]/, '').replace(/[\\/]/g, separatorOf(docPath)));
}

/**
 * One policy for links everywhere (preview and live mode):
 * - `#id` jumps within the document
 * - http(s) and mailto open in the default browser or mail app
 * - relative Markdown paths open in CalmMD
 * - anything else (javascript:, file:, …) is ignored
 */
export function openLink(href: string, ctx: LinkContext) {
  if (href.startsWith('wiki:')) {
    ctx.openWiki?.(decodeURIComponent(href.slice(5)));
    return;
  }
  if (href.startsWith('#')) {
    ctx.gotoAnchor(decodeURIComponent(href.slice(1)));
    return;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    if (/^(https?|mailto):/i.test(href)) void ctx.platform.openExternal(href);
    return;
  }
  if (!ctx.docPath) return;
  const hashAt = href.indexOf('#');
  const anchor = hashAt === -1 ? undefined : href.slice(hashAt + 1) || undefined;
  let target = hashAt === -1 ? href : href.slice(0, hashAt);
  try {
    target = decodeURI(target);
  } catch {
    // keep as written
  }
  if (!target) return;
  const abs = /^([a-zA-Z]:)?[\\/]/.test(target)
    ? target
    : joinPath(dirname(ctx.docPath), target.replace(/^\.[\\/]/, '').replace(/[\\/]/g, separatorOf(ctx.docPath)));
  if (!isMarkdownPath(target)) return ctx.openFile?.(abs);
  if (!samePath(abs, ctx.docPath)) ctx.openPath(abs, anchor);
  else if (anchor) ctx.gotoAnchor(anchor);
}
