/** Path helpers that work for both POSIX and Windows paths (the frontend never touches `node:path`). */

export function basename(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  return i === -1 ? trimmed : trimmed.slice(i + 1);
}

export function dirname(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const i = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (i === -1) return '';
  if (i === 0) return trimmed[0];
  return trimmed.slice(0, i);
}

export function stem(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(0, i) : b;
}

export function separatorOf(p: string): '/' | '\\' {
  return p.includes('\\') && !p.includes('/') ? '\\' : '/';
}

export function joinPath(dir: string, name: string): string {
  const sep = separatorOf(dir);
  return dir.endsWith('/') || dir.endsWith('\\') ? dir + name : dir + sep + name;
}

/** True if `child` is `parent` or lies inside it. */
export function isWithin(child: string, parent: string): boolean {
  if (samePath(child, parent)) return true;
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const c = norm(child);
  const p = norm(parent) + '/';
  const windowsish = /^[a-zA-Z]:/.test(parent) || parent.startsWith('\\\\');
  return windowsish ? c.toLowerCase().startsWith(p.toLowerCase()) : c.startsWith(p);
}

/** Re-bases `path` from `from` to `to` (used when a folder is renamed). */
export function rebase(path: string, from: string, to: string): string {
  if (samePath(path, from)) return to;
  return to + path.slice(from.replace(/[\\/]+$/, '').length);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** Natural, case-insensitive order ("Chapter 2" before "Chapter 10"). Matches the Rust side. */
export const naturalCompare = (a: string, b: string) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);

export function isMarkdownPath(p: string): boolean {
  return /\.(md|markdown|mdown|mkd|mdx|txt)$/i.test(p);
}

/** Plain text files: they open as text, without Markdown rendering. */
export function isPlainTextPath(p: string): boolean {
  return /.txt$/i.test(p);
}

/** Compares paths the way the OS would, case-insensitively for Windows-style paths. */
export function samePath(a: string, b: string): boolean {
  return pathKey(a) === pathKey(b);
}

/** A path in a form that's equal for every spelling of the same file (forward slashes; lowercase on Windows). */
export function pathKey(p: string): string {
  const windowsish = /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\');
  const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
  return windowsish ? s.toLowerCase() : s;
}
