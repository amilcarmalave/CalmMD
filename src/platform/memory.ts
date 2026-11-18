import { naturalCompare } from '../core/paths';
import { SEARCH_MAX_HITS, searchText, type SearchHit } from '../core/search';
import type { McpConnectionInfo } from '../mcp/types';
import type { DirEntry, Platform, StatResult } from './types';

export interface MemoryPlatformOptions {
  files?: Record<string, string>;
  /** Backing store for files and kv; pass `localStorage` to persist across reloads. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
  kind?: 'web' | 'memory';
  pickOpen?: () => Promise<string[]>;
  pickImages?: () => Promise<string[]>;
  pickSave?: (suggested: string) => Promise<string | null>;
  pickFolder?: () => Promise<string | null>;
  /** Simulated window identity (browser dev: from the URL). */
  windowLabel?: string;
  spaceId?: string | null;
  /** Shared across simulated windows in tests (label → space id). */
  claims?: Map<string, string>;
}

/**
 * An in-memory (optionally localStorage-backed) platform. It's used for browser dev and tests.
 * Files live under keys `fs:<path>` and the kv store under `kv:<key>`.
 */
export function createMemoryPlatform(opts: MemoryPlatformOptions = {}) {
  const learned = new Set<string>();
  const store = opts.storage ?? mapStorage();
  const mtimes = new Map<string, number>();
  let clock = Date.now();
  // Each write moves mtime forward by a clearly detectable amount, even within one millisecond.
  const tick = () => (clock = Math.max(clock + 10, Date.now()));

  for (const [path, text] of Object.entries(opts.files ?? {})) {
    if (store.getItem('fs:' + path) === null) store.setItem('fs:' + path, text);
  }

  const label = opts.windowLabel ?? 'main';
  const claims = opts.claims ?? new Map<string, string>();
  const channel =
    typeof BroadcastChannel !== 'undefined' && opts.kind === 'web' ? new BroadcastChannel('calmmd') : null;
  const handlers = new Map<string, ((p: unknown) => void)[]>();
  channel?.addEventListener('message', (e: MessageEvent<{ channel: string; from: string; payload: unknown }>) => {
    if (e.data.from !== label) for (const h of handlers.get(e.data.channel) ?? []) h(e.data.payload);
  });

  const keys = (prefix: string) => {
    const out: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(prefix)) out.push(k);
    }
    return out;
  };
  const mtimeOf = (path: string) => {
    let m = mtimes.get(path);
    if (m === undefined) mtimes.set(path, (m = tick()));
    return m;
  };

  const platform: Platform & {
    /** Test helper: simulate another program editing a file. */
    externalWrite(path: string, text: string): void;
    files(): Record<string, string>;
    writes: { path: string; text: string }[];
  } = {
    kind: opts.kind ?? 'memory',
    isMac: typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac'),
    nativeMenu: false,
    async setAppMenu() {},
    async closeWindow() {
      if (typeof window !== 'undefined') window.close();
    },
    writes: [],

    async readTextFile(path) {
      const text = store.getItem('fs:' + path);
      if (text === null) throw new Error('File not found');
      return { text, mtimeMs: mtimeOf(path) };
    },
    async writeTextFile(path, text) {
      store.setItem('fs:' + path, text);
      const mtimeMs = tick();
      mtimes.set(path, mtimeMs);
      platform.writes.push({ path, text });
      return { mtimeMs };
    },
    async stat(path): Promise<StatResult | null> {
      const text = store.getItem('fs:' + path);
      if (text === null) return null;
      return { mtimeMs: mtimeOf(path), size: text.length, isDir: false };
    },

    async searchFiles(root, query, opts) {
      const prefix = root.endsWith('/') ? root : root + '/';
      const hits: SearchHit[] = [];
      for (const k of keys('fs:' + prefix).sort((a, b) => naturalCompare(a, b))) {
        const path = k.slice(3);
        if (!/.(md|markdown|mdown|mkd|mdx|txt)$/i.test(path) || path.split('/').some((seg) => seg.startsWith('.') || seg === 'node_modules')) continue;
        const text = store.getItem(k) ?? '';
        if (text.startsWith('data:')) continue;
        hits.push(...searchText(path, text, query, opts, SEARCH_MAX_HITS - hits.length));
        if (hits.length >= SEARCH_MAX_HITS) break;
      }
      return hits;
    },
    async listDir(dir, showHidden = false) {
      const prefix = dir.replace(/\/+$/, '') + '/';
      const seen = new Map<string, DirEntry>();
      for (const k of [...keys('fs:'), ...keys('dir:')]) {
        const p = k.slice(k.indexOf(':') + 1);
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        if (!rest) continue;
        const name = rest.split('/')[0];
        const isDir = rest.includes('/') || k.startsWith('dir:');
        if (!showHidden && name.startsWith('.')) continue;
        if (!seen.has(name) || isDir) seen.set(name, { name, path: prefix + name, isDir });
      }
      if (seen.size === 0 && store.getItem('dir:' + dir) === null && !keys('fs:' + prefix).length)
        throw new Error('Folder not found');
      return [...seen.values()].sort((a, b) => Number(b.isDir) - Number(a.isDir) || naturalCompare(a.name, b.name));
    },
    async createFile(path) {
      if (store.getItem('fs:' + path) !== null) throw new Error('A file with that name already exists.');
      store.setItem('fs:' + path, '');
      mtimes.set(path, tick());
    },
    async createDir(path) {
      if (store.getItem('dir:' + path) !== null) throw new Error('A folder with that name already exists.');
      store.setItem('dir:' + path, '1');
    },
    async renamePath(from, to) {
      const exists = (p: string) =>
        store.getItem('fs:' + p) !== null || store.getItem('dir:' + p) !== null || keys('fs:' + p + '/').length > 0;
      if (exists(to)) throw new Error('Something with that name already exists.');
      for (const k of [...keys('fs:'), ...keys('dir:')]) {
        const [kind, p] = [k.slice(0, k.indexOf(':') + 1), k.slice(k.indexOf(':') + 1)];
        if (p === from || p.startsWith(from + '/')) {
          const v = store.getItem(k)!;
          const np = to + p.slice(from.length);
          store.removeItem(k);
          store.setItem(kind + np, v);
          // Like a real rename, keep the modification time.
          const m = mtimes.get(p);
          if (m !== undefined) mtimes.set(np, m);
          mtimes.delete(p);
        }
      }
    },
    async trashPath(path) {
      for (const k of [...keys('fs:'), ...keys('dir:')]) {
        const p = k.slice(k.indexOf(':') + 1);
        if (p === path || p.startsWith(path + '/')) store.removeItem(k);
      }
    },
    async revealPath() {},

    async findBrowser() {
      return null;
    },
    async printPdf() {
      throw new Error('NO_BROWSER');
    },
    async openPath() {},
    async readImageDataUrl(path) {
      const text = store.getItem('fs:' + path);
      if (text === null) throw new Error('File not found');
      if (text.startsWith('data:')) return text;
      return 'data:image/svg+xml;utf8,' + encodeURIComponent(text);
    },
    // Binary files are kept as data URLs, so assetUrl can show them in the browser build.
    async writeBinaryFile(path, data) {
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext || 'png'}`;
      let bin = '';
      for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
      store.setItem('fs:' + path, `data:${mime};base64,${btoa(bin)}`);
      mtimes.set(path, tick());
    },
    async copyFile(from, to) {
      const v = store.getItem('fs:' + from);
      if (v === null) throw new Error('The file no longer exists.');
      if (store.getItem('fs:' + to) !== null) throw new Error('A file with that name already exists.');
      store.setItem('fs:' + to, v);
      mtimes.set(to, tick());
    },
    async pendingAssetsDir() {
      return '/appdata/pending-assets';
    },
    openImageDialog: opts.pickImages ?? (async () => []),
    async findPandoc() {
      return null;
    },
    // A stand-in spellchecker that knows a few common misspellings.
    async spellCheck(word) {
      const fixes: Record<string, string[]> = { recieve: ['receive', 'relieve'], teh: ['the', 'ten', 'tech'], wierd: ['weird', 'wired'] };
      const s = learned.has(word.toLowerCase()) ? undefined : fixes[word.toLowerCase()];
      return { misspelled: !!s, suggestions: s ?? [] };
    },
    async spellCheckText(text) {
      const out: [number, number][] = [];
      for (const m of text.matchAll(/\p{L}+/gu)) {
        const w = m[0].toLowerCase();
        if (!learned.has(w) && ['recieve', 'teh', 'wierd'].includes(w)) out.push([m.index!, m.index! + m[0].length]);
      }
      return out;
    },
    async spellLearn(word) {
      learned.add(word.toLowerCase());
    },
    async pandocConvert() {
      throw new Error("Pandoc isn't available here");
    },
    async themesDir() {
      const dir = '/appdata/themes';
      if (store.getItem('dir:' + dir) === null) {
        store.setItem('dir:' + dir, '1');
        store.setItem(
          'fs:' + dir + '/Sepia.css',
          '/*\n  @name Sepia\n  @base paper\n*/\n:root { --preview-bg: #f5ecdc; }\n.md-body { --fg: #46382a; --fg-strong: #2d2219; --link: #9a4d12; }\n',
        );
      }
      return dir;
    },
    async writeClipboardHtml(_html, plain) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(plain);
    },

    openFolderDialog: opts.pickFolder ?? (async () => null),
    openFileDialog: opts.pickOpen ?? (async () => []),
    saveFileDialog: opts.pickSave ?? (async () => null),

    async kvGet(key) {
      return store.getItem('kv:' + key);
    },
    async kvSet(key, value) {
      store.setItem('kv:' + key, value);
    },
    async kvDelete(key) {
      store.removeItem('kv:' + key);
    },
    async kvList(prefix) {
      return keys('kv:' + prefix).map((k) => k.slice(3));
    },

    async readClipboard() {
      return typeof navigator !== 'undefined' && navigator.clipboard ? navigator.clipboard.readText() : '';
    },
    async writeClipboard(text) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(text);
    },
    assetUrl: (absPath) => {
      const v = store.getItem('fs:' + absPath);
      if (v && v.startsWith('data:')) return v;
      // SVG written as text (drawings): show it as a picture too.
      if (v && /\.svg$/i.test(absPath) && /^\s*</.test(v)) return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(v);
      return absPath;
    },
    async openExternal(url) {
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    },

    windowLabel: label,
    initialSpaceId: () => opts.spaceId ?? null,
    async openWindow(spaceId) {
      if (typeof window === 'undefined') return;
      const id = 'space-' + Math.random().toString(36).slice(2, 7);
      const q = new URLSearchParams({ window: id, ...(spaceId ? { space: spaceId } : {}) });
      window.open(`${location.pathname}?${q}`, '_blank');
    },
    async claimSpace(spaceId) {
      if (spaceId) {
        for (const [w, s] of claims) if (s === spaceId && w !== label) return w;
        claims.set(label, spaceId);
      } else claims.delete(label);
      return null;
    },
    async spaceWindow(spaceId) {
      for (const [w, s] of claims) if (s === spaceId) return w;
      return null;
    },
    async focusWindow() {},
    async windowLabels() {
      return [label, ...[...claims.keys()].filter((l) => l !== label)];
    },
    broadcast(name, payload) {
      channel?.postMessage({ channel: name, from: label, payload });
    },
    onBroadcast(name, handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    onOpenPaths() {},

    // The browser/memory platforms have no embedded server; the bridge stays inert there.
    async mcpStatus(): Promise<McpConnectionInfo> {
      return { enabled: false, url: null, token: null, windowLabel: label };
    },
    async mcpStart(): Promise<McpConnectionInfo> {
      return this.mcpStatus();
    },
    async mcpStop(): Promise<McpConnectionInfo> {
      return this.mcpStatus();
    },
    onMcpRequest() {},
    async mcpRespond() {},

    async setWindowTitle(title) {
      if (typeof document !== 'undefined') document.title = title;
    },
    onCloseRequested(handler) {
      if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => void handler());
    },
    onFileDrop() {},
    async launchPaths() {
      return [];
    },

    externalWrite(path, text) {
      store.setItem('fs:' + path, text);
      mtimes.set(path, tick());
    },
    files() {
      return Object.fromEntries(keys('fs:').map((k) => [k.slice(3), store.getItem(k) ?? '']));
    },
  };
  return platform;
}

function mapStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
