import { findImageLinks, markdownUrl, resolveLink, uniqueName } from './assets';
import { basename, dirname } from './paths';

/**
 * Share bundles (CalmMD Pro): a document that travels with its images.
 *
 * - zip: the document plus `assets/<image>` for every local image it uses, links rewritten.
 * - single file: every local image inlined as a data: URL (one big but self-contained .md).
 *
 * Pure planning: which files go where and the rewritten text. The caller reads the images.
 */
export interface BundlePlan {
  text: string;
  /** Local image → name inside the bundle ("assets/photo.png"). */
  files: { from: string; name: string }[];
}

export function planZipBundle(text: string, docPath: string | null): BundlePlan {
  const dir = docPath ? dirname(docPath) : null;
  const files: { from: string; name: string }[] = [];
  const taken = new Set<string>();
  const byPath = new Map<string, string>();
  const edits: { from: number; to: number; insert: string }[] = [];
  for (const link of findImageLinks(text)) {
    const abs = resolveLink(link.url, dir);
    if (!abs) continue;
    let name = byPath.get(abs.toLowerCase());
    if (!name) {
      name = 'assets/' + uniqueName(basename(abs), (n) => taken.has(n.toLowerCase()));
      taken.add(name.slice(7).toLowerCase());
      byPath.set(abs.toLowerCase(), name);
      files.push({ from: abs, name });
    }
    edits.push({ from: link.from, to: link.to, insert: markdownUrl(name) });
  }
  return { text: applyEdits(text, edits), files };
}

/** Rewrites local image links to data: URLs. `dataUrls` maps a resolved file path to its data URL. */
export function inlineImages(text: string, docPath: string | null, dataUrls: Map<string, string>): { text: string; missing: string[] } {
  const dir = docPath ? dirname(docPath) : null;
  const edits: { from: number; to: number; insert: string }[] = [];
  const missing: string[] = [];
  for (const link of findImageLinks(text)) {
    const abs = resolveLink(link.url, dir);
    if (!abs) continue;
    const data = dataUrls.get(abs);
    if (data) edits.push({ from: link.from, to: link.to, insert: data });
    else missing.push(link.url);
  }
  return { text: applyEdits(text, edits), missing };
}

/** Local image files a document uses (resolved paths, no duplicates). */
export function localImages(text: string, docPath: string | null): string[] {
  const dir = docPath ? dirname(docPath) : null;
  const out = new Map<string, string>();
  for (const link of findImageLinks(text)) {
    const abs = resolveLink(link.url, dir);
    if (abs) out.set(abs.toLowerCase(), abs);
  }
  return [...out.values()];
}

function applyEdits(text: string, edits: { from: number; to: number; insert: string }[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  return out;
}
