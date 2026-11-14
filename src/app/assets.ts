import {
  assetFolderFor,
  extForMime,
  findImageLinks,
  hashedName,
  markdownUrl,
  planRelocation,
  relativePath,
  resolveLink,
  safeStem,
  sha256Hex,
  uniqueName,
  type ImageFolderMode,
} from '../core/assets';
import { basename, dirname, joinPath } from '../core/paths';
import type { Platform } from '../platform/types';

/**
 * Saves pasted, dropped and picked images, and keeps links working when a document moves.
 * The path rules are pure and tested in core/assets.ts; this does the file work.
 */
export interface AssetDeps {
  platform: Platform;
  mode: () => ImageFolderMode;
  /** The open folder (or Space root), for the "root" mode. */
  root: () => string | null;
  notify: (msg: string) => void;
}

export type Assets = ReturnType<typeof createAssets>;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createAssets(deps: AssetDeps) {
  const { platform } = deps;
  let pending: string | null = null;
  const pendingDir = async () => (pending ??= await platform.pendingAssetsDir());

  /** Where a document's new images go: its asset folder, or the pending folder if untitled. */
  async function folderFor(docPath: string | null) {
    return docPath ? assetFolderFor(docPath, deps.mode(), deps.root()) : await pendingDir();
  }

  async function namesIn(dir: string): Promise<Set<string>> {
    const list = await platform.listDir(dir, true).catch(() => []);
    return new Set(list.map((e) => e.name.toLowerCase()));
  }

  /** The link a document uses for a saved file: relative, or absolute while it's untitled. */
  function linkFor(docPath: string | null, file: string): string {
    if (!docPath) return markdownUrl(file.replace(/\\/g, '/'));
    const rel = relativePath(dirname(docPath), file);
    return markdownUrl(rel ?? file.replace(/\\/g, '/'));
  }

  /** Saves image data (a paste). Returns the link, or null if it couldn't be saved. */
  async function saveData(docPath: string | null, data: Uint8Array, mime: string, name?: string): Promise<string | null> {
    const ext = extForMime(mime) ?? (name?.split('.').pop()?.toLowerCase() || null);
    if (!ext) {
      deps.notify('That image type isn’t supported');
      return null;
    }
    try {
      const dir = await folderFor(docPath);
      const taken = await namesIn(dir);
      // Screenshots have no real name ("image.png"): name them by content, so pasting the same
      // picture twice reuses one file. Files copied from disk keep a cleaned-up version of their name.
      const generic = !name || /^image\.\w+$/i.test(name);
      let file: string;
      if (generic) {
        file = hashedName(await sha256Hex(data), ext);
        if (taken.has(file.toLowerCase())) return linkFor(docPath, joinPath(dir, file));
      } else {
        file = uniqueName(`${safeStem(name)}.${ext}`, (n) => taken.has(n.toLowerCase()));
      }
      const path = joinPath(dir, file);
      await platform.writeBinaryFile(path, data);
      return linkFor(docPath, path);
    } catch (e) {
      deps.notify(`Couldn't save the image: ${errText(e)}`);
      return null;
    }
  }

  /** Copies an image file into the document's asset folder. Returns the link. */
  async function importFile(docPath: string | null, source: string): Promise<string | null> {
    try {
      const dir = await folderFor(docPath);
      // Already in the asset folder (or anywhere under the document's folder): just link it.
      if (docPath && dirname(source).toLowerCase().startsWith(dirname(docPath).toLowerCase())) return linkFor(docPath, source);
      const taken = await namesIn(dir);
      const ext = basename(source).split('.').pop()?.toLowerCase() ?? 'png';
      const file = uniqueName(`${safeStem(source)}.${ext}`, (n) => taken.has(n.toLowerCase()));
      const path = joinPath(dir, file);
      await platform.copyFile(source, path);
      return linkFor(docPath, path);
    } catch (e) {
      deps.notify(`Couldn't add ${basename(source)}: ${errText(e)}`);
      return null;
    }
  }

  /**
   * Called before a document is written to a new location (first save, Save As). Copies images it
   * owns next to the new file and rewrites links. Returns the new text, or null if nothing changed.
   */
  async function relocate(text: string, from: string | null, to: string): Promise<string | null> {
    const links = findImageLinks(text);
    if (!links.length) return null;
    const oldDir = from ? dirname(from) : null;
    const candidates = [...new Set(links.map((l) => resolveLink(l.url, oldDir)).filter((p): p is string => !!p))];
    const target = assetFolderFor(to, deps.mode(), deps.root());
    const present = new Set<string>();
    await Promise.all(
      candidates.map(async (p) => {
        if (await platform.stat(p).catch(() => null)) present.add(p);
      }),
    );
    const targetNames = await namesIn(target);
    const plan = planRelocation({
      text,
      from,
      to,
      pendingDir: await pendingDir(),
      mode: deps.mode(),
      root: deps.root(),
      exists: (p) => present.has(p) || (dirname(p) === target && targetNames.has(basename(p).toLowerCase())),
    });
    if (!plan) return null;
    for (const c of plan.copies) {
      try {
        await platform.copyFile(c.from, c.to);
      } catch (e) {
        deps.notify(`Couldn't copy ${basename(c.from)} next to the document: ${errText(e)}`);
        return null;
      }
    }
    if (plan.copies.length) deps.notify(plan.copies.length === 1 ? 'Copied 1 image next to the document' : `Copied ${plan.copies.length} images next to the document`);
    return plan.text;
  }

  return { saveData, importFile, relocate, folderFor };
}
