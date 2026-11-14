import { basename, dirname, isWithin, joinPath, samePath } from './paths';

/**
 * Image assets: where pasted and dropped images go, and how documents link to them.
 *
 * The one rule that keeps this robust: links are always *relative to the document* (forward
 * slashes, URL-escaped), so a folder can move, sync or be zipped and shared and still work. Only
 * the folder the files land in changes:
 *
 *   document  <document folder>/assets/
 *   root      <open folder or Space root>/assets/ (falls back to `document` outside the root)
 *
 * Untitled documents have no folder yet. Their images wait in the app's pending folder with
 * absolute links, and move next to the document on its first save (see planRelocation).
 */
export type ImageFolderMode = 'document' | 'root';
export const ASSETS_DIR = 'assets';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
export const isImagePath = (p: string) => IMAGE_EXT.test(p);

export function extForMime(mime: string): string | null {
  const m = mime.toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/gif') return 'gif';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/avif') return 'avif';
  if (m === 'image/svg+xml') return 'svg';
  if (m === 'image/bmp') return 'bmp';
  return null;
}

/** The folder new images for this document go in. */
export function assetFolderFor(docPath: string, mode: ImageFolderMode, root: string | null): string {
  const docDir = dirname(docPath);
  if (mode === 'root' && root && isWithin(docPath, root)) return joinPath(root, ASSETS_DIR);
  return joinPath(docDir, ASSETS_DIR);
}

const isWindowsPath = (p: string) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
const segments = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/');

/** Path from `fromDir` to `target`, with forward slashes. Null across drives (no relative path). */
export function relativePath(fromDir: string, target: string): string | null {
  const win = isWindowsPath(fromDir) || isWindowsPath(target);
  const a = segments(fromDir);
  const b = segments(target);
  const eq = (x: string, y: string) => (win ? x.toLowerCase() === y.toLowerCase() : x === y);
  if (win && !eq(a[0], b[0])) return null;
  let i = 0;
  while (i < a.length && i < b.length && eq(a[i], b[i])) i++;
  const up = a.slice(i).filter(Boolean).map(() => '..');
  const down = b.slice(i);
  return [...up, ...down].join('/') || '.';
}

/** A path made safe for a Markdown link destination (spaces, parentheses, …), keeping Unicode. */
export function markdownUrl(path: string): string {
  return path.replace(/\\/g, '/').replace(/[ ()<>#?%[\]]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

/** A link destination back to a path, for resolving existing links. */
export function decodeLinkPath(url: string): string {
  try {
    return decodeURI(url).replace(/%23/g, '#').replace(/%3F/g, '?');
  } catch {
    return url;
  }
}

/** File-system-safe stem for a pasted file's own name. */
export function safeStem(name: string): string {
  const stem = basename(name).replace(/\.[^.]+$/, '');
  const clean = stem
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return clean.slice(0, 80) || 'image';
}

/** `name.png`, or `name-2.png`, `name-3.png`, … if taken. */
export function uniqueName(name: string, taken: (n: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 10_000; i++) {
    const n = `${stem}-${i}${ext}`;
    if (!taken(n)) return n;
  }
  return `${stem}-${Date.now()}${ext}`;
}

/** Name for image data without a usable name (screenshots): content-addressed, so pasting the same image twice reuses it. */
export const hashedName = (hashHex: string, ext: string) => `image-${hashHex.slice(0, 12)}.${ext}`;

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Finding and rewriting image links ----------

export interface ImageLink {
  /** Offsets of the destination (inside the parentheses or the src quotes). */
  from: number;
  to: number;
  url: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Image destinations in Markdown (`![alt](url "title")`) and HTML (`<img src="url">`), outside code. */
export function findImageLinks(text: string): ImageLink[] {
  const out: ImageLink[] = [];
  let pos = 0;
  let fence: string | null = null;
  for (const line of text.split('\n')) {
    const start = pos;
    pos += line.length + 1;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !line.slice(f[0].length).trim()) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    if (/^( {4}|\t)/.test(line)) continue;
    // Skip inline code spans.
    const masked = line.replace(/(`+)[^`]*?\1/g, (m) => ' '.repeat(m.length));
    const md = /!\[[^\]]*\]\(\s*(<[^>]*>|[^\s)]+)/g;
    for (let m; (m = md.exec(masked)); ) {
      const raw = m[1];
      const offset = m.index + m[0].length - raw.length;
      const angled = raw.startsWith('<');
      out.push({ from: start + offset + (angled ? 1 : 0), to: start + offset + raw.length - (angled ? 1 : 0), url: angled ? raw.slice(1, -1) : raw });
    }
    const html = /<img\b[^>]*?\ssrc\s*=\s*(["'])(.*?)\1/gi;
    for (let m; (m = html.exec(masked)); ) {
      const url = m[2];
      const offset = m.index + m[0].length - url.length - 1;
      out.push({ from: start + offset, to: start + offset + url.length, url });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** A link destination that points at a local file (not a URL, anchor or data URI). */
export const isLocalLink = (url: string) => !!url && !url.startsWith('#') && !url.startsWith('//') && (!SCHEME.test(url) || /^[a-zA-Z]:[\\/]/.test(url));
export const isAbsolutePath = (p: string) => p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');

/** The file a local link points at, from a document in `docDir` (null for untitled docs and relative links). */
export function resolveLink(url: string, docDir: string | null): string | null {
  if (!isLocalLink(url)) return null;
  const p = decodeLinkPath(url);
  if (isAbsolutePath(p)) return p;
  if (!docDir) return null;
  const parts = segments(docDir);
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.length > 1 && parts.pop();
    else parts.push(seg);
  }
  const joined = parts.join('/');
  return docDir.includes('\\') && !docDir.includes('/') ? joined.replace(/\//g, '\\') : joined;
}

export interface Relocation {
  /** Copy these files (pending or owned by the old folder) into the new asset folder. */
  copies: { from: string; to: string }[];
  /** The text with every moved or re-pointed link rewritten. */
  text: string;
}

/**
 * What to do when a document gets a new location (first save of an untitled document, or Save As
 * to another folder), so every local image keeps working:
 *
 * - images in the pending folder are copied next to the new file;
 * - images that lived inside the old document's folder are copied along (they belonged to it);
 * - any other local image stays where it is, and its link is re-pointed from the new location.
 *
 * Pure: `exists` reports which files are present; the caller does the copies.
 */
export function planRelocation(opts: {
  text: string;
  from: string | null;
  to: string;
  pendingDir: string | null;
  mode: ImageFolderMode;
  root: string | null;
  exists: (path: string) => boolean;
}): Relocation | null {
  const { text, from, to } = opts;
  const oldDir = from ? dirname(from) : null;
  const newDir = dirname(to);
  if (oldDir && samePath(oldDir, newDir)) return null;
  const target = assetFolderFor(to, opts.mode, opts.root);
  const copies: { from: string; to: string }[] = [];
  const taken = new Set<string>();
  const edits: { from: number; to: number; insert: string }[] = [];

  for (const link of findImageLinks(text)) {
    const abs = resolveLink(link.url, oldDir);
    if (!abs || !opts.exists(abs)) continue;
    const pending = !!opts.pendingDir && isWithin(abs, opts.pendingDir);
    const owned = !!oldDir && isWithin(abs, oldDir);
    let dest = abs;
    if (pending || owned) {
      const already = copies.find((c) => samePath(c.from, abs));
      if (already) dest = already.to;
      else {
        const name = uniqueName(basename(abs), (n) => taken.has(n.toLowerCase()) || opts.exists(joinPath(target, n)));
        taken.add(name.toLowerCase());
        dest = joinPath(target, name);
        copies.push({ from: abs, to: dest });
      }
    }
    const rel = relativePath(newDir, dest);
    const url = rel ? markdownUrl(rel) : markdownUrl(dest);
    if (url !== link.url) edits.push({ from: link.from, to: link.to, insert: url });
  }
  if (!edits.length) return null;
  let out = text;
  for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
  return { copies, text: out };
}
