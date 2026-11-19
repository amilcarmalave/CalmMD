import { createKvHistory } from '../app/history';
import type { Session } from '../app/session';
import { parseSession } from '../app/session';
import { parseSpace, type SpaceRecord } from '../app/spaces';
import type {
  BufferAutosaveEvent,
  BufferAutosaveRequest,
  BufferAutosaveResolveResult,
  BufferAutosaveState,
  BufferDraft,
  BufferDraftEntry,
  BufferFile,
  BufferPersistRequest,
  BufferPersistResult,
} from '../buffers/types';
import { decodeFromDisk, encodeForDisk } from '../core/text';
import { naturalCompare } from '../core/paths';
import { SEARCH_MAX_HITS, searchText, type SearchHit } from '../core/search';
import type { McpConnectionInfo } from '../mcp/types';
import type { WorkspaceDocument, WorkspaceEvent, WorkspaceSnapshot } from '../workspace/types';
import type { HistoryUsage } from '../history/types';
import type { SpellDictionary } from '../core/spellDictionaries';
import type {
  HeadingDto,
  HighlightCodeResult,
  MarkdownParseResult,
  MarkdownRenderOptions,
  MarkdownRenderResult,
  SourceBlockDto,
} from '../markdown/types';
import { createRenderer } from '../render/markdown';
import { escapeHtml, highlightToHtml } from '../render/highlight';
import type { DirEntry, Platform, StatResult } from './types';

/** Browser/test stand-in for the Rust Markdown service. */
const browserRenderer = createRenderer();

function slugify(text: string): string {
  const out: string[] = [];
  let pendingDash = false;
  for (const ch of text.trim().toLocaleLowerCase()) {
    if (/\s/u.test(ch)) {
      pendingDash = out.length > 0;
      continue;
    }
    if (/[\p{L}\p{N}_-]/u.test(ch)) {
      if (pendingDash) out.push('-');
      pendingDash = false;
      out.push(ch);
    }
  }
  return out.join('') || 'section';
}

function parseSimpleFrontMatter(lines: readonly string[]): Record<string, unknown> {
  if (lines[0]?.trimEnd() !== '---') return {};
  const result: Record<string, unknown> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trimEnd() === '---' || line.trimEnd() === '...') break;
    const m = /^([\w.-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const raw = m[2].trim();
    if (raw === 'true') result[m[1]] = true;
    else if (raw === 'false') result[m[1]] = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) result[m[1]] = Number(raw);
    else if (raw.startsWith('[') && raw.endsWith(']'))
      result[m[1]] = raw
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    else result[m[1]] = raw.replace(/^['"]|['"]$/g, '');
  }
  return result;
}

function browserMarkdownParse(text: string): MarkdownParseResult {
  const lines = text.split(/\r?\n/);
  const seen = new Map<string, number>();
  const headings: HeadingDto[] = [];
  const blocks: SourceBlockDto[] = [];
  let paragraphStart: number | null = null;
  let i = 0;
  if (lines[0]?.trimEnd() === '---') {
    while (i < lines.length && i < 400 && lines[i].trimEnd() !== '---' && lines[i].trimEnd() !== '...') i++;
    if (i < lines.length) i++;
  }
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (paragraphStart !== null) {
        blocks.push({ kind: 'Paragraph', startLine: paragraphStart, endLine: i - 1, byteStart: 0 });
        paragraphStart = null;
      }
      const start = i;
      const marker = fence[1][0];
      i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker}{3,}`).test(lines[i] ?? '')) i++;
      blocks.push({ kind: 'CodeBlock', startLine: start, endLine: Math.min(i, lines.length - 1), byteStart: 0 });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      if (paragraphStart !== null) {
        blocks.push({ kind: 'Paragraph', startLine: paragraphStart, endLine: i - 1, byteStart: 0 });
        paragraphStart = null;
      }
      const raw = heading[2];
      const base = slugify(raw);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      headings.push({
        level: heading[1].length,
        text: raw,
        id: count === 0 ? base : `${base}-${count}`,
        line: i,
        byteStart: 0,
      });
      blocks.push({ kind: 'Heading', startLine: i, endLine: i, byteStart: 0 });
      continue;
    }
    if (!line.trim()) {
      if (paragraphStart !== null) {
        blocks.push({ kind: 'Paragraph', startLine: paragraphStart, endLine: i - 1, byteStart: 0 });
        paragraphStart = null;
      }
      continue;
    }
    if (paragraphStart === null) paragraphStart = i;
    if (line.trimStart().startsWith('|')) {
      blocks.push({ kind: 'Table', startLine: i, endLine: i, byteStart: 0 });
      paragraphStart = null;
    }
  }
  if (paragraphStart !== null)
    blocks.push({ kind: 'Paragraph', startLine: paragraphStart, endLine: lines.length - 1, byteStart: 0 });
  blocks.sort((a, b) => a.startLine - b.startLine);
  return {
    headings,
    frontMatter: parseSimpleFrontMatter(lines),
    blocks,
  };
}

const SPELL_DICTIONARIES: SpellDictionary[] = [
  { id: 'en_US', label: 'English (US)', languages: ['en-US', 'en'], license: 'MIT AND BSD', installed: true, bundled: true, source: '' },
  { id: 'en_GB', label: 'English (UK)', languages: ['en-GB'], license: 'MIT AND BSD', installed: true, bundled: true, source: '' },
  { id: 'de_DE', label: 'German', languages: ['de-DE', 'de'], license: 'Apache-2.0', installed: true, bundled: true, source: '' },
  { id: 'fr_FR', label: 'French', languages: ['fr-FR', 'fr-BE', 'fr'], license: 'Apache-2.0', installed: true, bundled: true, source: '' },
  { id: 'es_ES', label: 'Spanish', languages: ['es-ES', 'es'], license: 'Apache-2.0', installed: true, bundled: true, source: '' },
  { id: 'it_IT', label: 'Italian', languages: ['it-IT', 'it'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'pt_PT', label: 'Portuguese', languages: ['pt-PT', 'pt-BR', 'pt'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'nl_NL', label: 'Dutch / Flemish', languages: ['nl-NL', 'nl-BE', 'nl'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'fi_FI', label: 'Finnish', languages: ['fi-FI', 'fi'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'nb_NO', label: 'Norwegian (Bokmål)', languages: ['nb-NO', 'nb', 'no'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'da_DK', label: 'Danish', languages: ['da-DK', 'da'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'pl_PL', label: 'Polish', languages: ['pl-PL', 'pl'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'zh_CN', label: 'Chinese', languages: ['zh-CN', 'zh'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'ja_JP', label: 'Japanese', languages: ['ja-JP', 'ja'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'ko_KR', label: 'Korean', languages: ['ko-KR', 'ko'], license: 'Apache-2.0', installed: false, bundled: false, source: '' },
  { id: 'ru_RU', label: 'Russian', languages: ['ru-RU', 'ru'], license: 'BSD-3-Clause', installed: false, bundled: false, source: '' },
  { id: 'en_CA', label: 'English (Canada)', languages: ['en-CA'], license: 'MIT AND BSD', installed: false, bundled: false, source: '' },
  { id: 'en_AU', label: 'English (Australia)', languages: ['en-AU'], license: 'MIT AND BSD', installed: false, bundled: false, source: '' },
  { id: 'tr_TR', label: 'Turkish', languages: ['tr-TR', 'tr'], license: 'MIT', installed: false, bundled: false, source: '' },
];

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

  interface PendingAutosave {
    request: BufferAutosaveRequest;
    firstDirtyAt: number;
    generation: number;
    timer: ReturnType<typeof setTimeout>;
    state: BufferAutosaveState;
  }
  let kvHistory: ReturnType<typeof createKvHistory>;
  const pendingAutosaves = new Map<string, PendingAutosave>();
  const autosaveHandlers = new Set<(event: BufferAutosaveEvent) => void>();
  const emitAutosave = (event: BufferAutosaveEvent) => {
    for (const handler of autosaveHandlers) handler(event);
  };
  async function flushAutosave(id: string): Promise<BufferAutosaveState> {
    const pending = pendingAutosaves.get(id);
    if (!pending) {
      return { id, status: 'clean', dirty: false, conflict: false, mtimeMs: null, lastError: null };
    }
    clearTimeout(pending.timer);
    pending.state = { ...pending.state, status: 'saving' };
    emitAutosave({ kind: 'status', state: pending.state });
    try {
      const result = await platform.bufferPersist(pending.request);
      pending.state = {
        ...pending.state,
        status: 'clean',
        dirty: false,
        conflict: result.conflict,
        mtimeMs: result.mtimeMs,
        lastError: null,
      };
      emitAutosave({ kind: 'saved', state: pending.state });
    } catch (err) {
      pending.state = {
        ...pending.state,
        status: 'error',
        dirty: true,
        lastError: err instanceof Error ? err.message : String(err),
      };
      emitAutosave({ kind: 'status', state: pending.state });
    }
    return pending.state;
  }

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

    async markdownParse(text) {
      return browserMarkdownParse(text);
    },
    async markdownRender(text, _options?: MarkdownRenderOptions): Promise<MarkdownRenderResult> {
      return {
        html: browserRenderer.render(text, { docPath: null }),
        sourceMap: browserMarkdownParse(text).blocks,
      };
    },
    async markdownHighlightCode(language, code): Promise<HighlightCodeResult> {
      return { html: `<pre class="code-block" data-lang="${escapeHtml(language)}"><code>${highlightToHtml(code, language)}</code></pre>` };
    },
    async workspaceSync(_snapshot: WorkspaceSnapshot) {},
    async workspaceUpsert(_document: WorkspaceDocument, _activeDocument?: string | null) {},
    onWorkspaceEvent(_handler: (event: WorkspaceEvent) => void) {},

    async sessionGet(key): Promise<Session | null> {
      const raw = await this.kvGet(key);
      return raw === null ? null : parseSession(raw);
    },
    async sessionSet(key, session) {
      await this.kvSet(key, JSON.stringify(session));
    },
    async spaceGet(id): Promise<SpaceRecord | null> {
      const raw = await this.kvGet('space/' + id);
      return raw === null ? null : parseSpace(raw);
    },
    async spaceSave(space) {
      await this.kvSet('space/' + space.id, JSON.stringify(space));
    },
    async spaceRemove(id) {
      await this.kvDelete('space/' + id);
    },
    async spaces(): Promise<SpaceRecord[]> {
      const keys = await this.kvList('space/');
      const recs = await Promise.all(keys.map((key) => this.spaceGet(key.slice('space/'.length))));
      return recs.filter((r): r is SpaceRecord => !!r).sort((a, b) => b.lastOpened - a.lastOpened);
    },

    historyList: (path) => kvHistory.list(path),
    historyRead: (path, id) => kvHistory.read(path, id),
    historySave: (path, text, name) => kvHistory.save(path, text, name),
    historyRemove: (path, id) => kvHistory.remove(path, id),
    historyRename: (from, to) => kvHistory.rename(from, to),
    historyClearFile: (path) => kvHistory.clearFile(path),
    historyClearAll: () => kvHistory.clearAll(),
    historyUsage: (): Promise<HistoryUsage> => kvHistory.usage(),

    async bufferDraftWrite(id, record) {
      store.setItem('kv:draft/' + id, JSON.stringify(record));
    },
    async bufferDraftDelete(id) {
      store.removeItem('kv:draft/' + id);
    },
    async bufferDrafts(): Promise<BufferDraftEntry[]> {
      const out: BufferDraftEntry[] = [];
      for (const key of keys('kv:draft/')) {
        try {
          const record = JSON.parse(store.getItem(key) ?? '') as BufferDraft;
          if (record.v !== 1 || typeof record.text !== 'string' || !record.text) continue;
          out.push({ id: key.slice('kv:draft/'.length), record });
        } catch {
          // A corrupt draft shouldn't block startup.
        }
      }
      return out.sort((a, b) => a.record.updatedAt - b.record.updatedAt);
    },
    async bufferPersist(req: BufferPersistRequest): Promise<BufferPersistResult> {
      const draft: BufferDraft = {
        v: 1,
        owner: req.owner,
        text: req.text,
        untitledIndex: req.untitledIndex,
        path: req.path,
        updatedAt: Date.now(),
      };
      if (!req.path) {
        if (!req.text) await this.bufferDraftDelete(req.id);
        else await this.bufferDraftWrite(req.id, draft);
        return { mtimeMs: null, conflict: false, wrote: false, draft: null };
      }
      if (req.conflict) {
        await this.bufferDraftWrite(req.id, draft);
        return { mtimeMs: null, conflict: true, wrote: false, draft };
      }
      const st = await this.stat(req.path);
      if (st && req.mtimeMs !== null && Math.abs(st.mtimeMs - req.mtimeMs) > 1) {
        await this.bufferDraftWrite(req.id, draft);
        return { mtimeMs: null, conflict: true, wrote: false, draft };
      }
      const { mtimeMs } = await this.writeTextFile(req.path, encodeForDisk(req.text, req.eol, req.bom));
      await this.bufferDraftDelete(req.id);
      return { mtimeMs, conflict: false, wrote: true, draft: null };
    },
    async bufferLoad(path): Promise<BufferFile> {
      const { text: raw, mtimeMs } = await this.readTextFile(path);
      return { ...decodeFromDisk(raw), mtimeMs };
    },

    async bufferAutosaveTouch(request): Promise<BufferAutosaveState> {
      const previous = pendingAutosaves.get(request.id);
      if (previous) clearTimeout(previous.timer);
      const idle = request.idleMs ?? 1000;
      const maxWait = request.maxWaitMs ?? 10_000;
      const now = Date.now();
      const firstDirtyAt = previous?.firstDirtyAt ?? now;
      const generation = (previous?.generation ?? 0) + 1;
      const state: BufferAutosaveState = {
        id: request.id,
        status: 'dirty',
        dirty: true,
        conflict: false,
        mtimeMs: request.mtimeMs,
        lastError: null,
      };
      const delay = Math.max(0, Math.min(idle, maxWait - (now - firstDirtyAt)));
      const timer = setTimeout(() => {
        const pending = pendingAutosaves.get(request.id);
        if (pending?.generation === generation) void flushAutosave(request.id);
      }, delay);
      pendingAutosaves.set(request.id, { request, firstDirtyAt, generation, timer, state });
      return state;
    },
    async bufferAutosaveFlush(id): Promise<BufferAutosaveState> {
      return flushAutosave(id);
    },
    async bufferAutosaveStatus(id): Promise<BufferAutosaveState | null> {
      return pendingAutosaves.get(id)?.state ?? null;
    },
    async bufferAutosaveResolve(id, choice): Promise<BufferAutosaveResolveResult> {
      const pending = pendingAutosaves.get(id);
      if (!pending) throw new Error('No pending autosave for this document');
      const path = pending.request.path;
      if (!path) throw new Error('This draft has no file path');
      const file = await this.bufferLoad(path);
      if (choice === 'loadTheirs') {
        await this.bufferAutosaveDispose(id);
        const state: BufferAutosaveState = {
          id,
          status: 'clean',
          dirty: false,
          conflict: false,
          mtimeMs: file.mtimeMs,
          lastError: null,
        };
        emitAutosave({ kind: 'saved', state });
        return { state, file };
      }
      pending.request.conflict = false;
      pending.request.mtimeMs = file.mtimeMs;
      const state = await flushAutosave(id);
      return { state, file: null };
    },
    async bufferAutosaveDispose(id) {
      const pending = pendingAutosaves.get(id);
      if (pending) clearTimeout(pending.timer);
      pendingAutosaves.delete(id);
    },
    onBufferAutosave(handler) {
      autosaveHandlers.add(handler);
    },

    async findBrowser() {
      return null;
    },
    async printPdf() {
      throw new Error('NO_BROWSER');
    },
    async takumiPdf(html, out, options) {
      // The browser build has no Tauri commands, so it keeps Takumi's local WASM engine.
      const { renderPdf } = await import('../export/takumi');
      const bytes = await renderPdf(html, options);
      await platform.writeBinaryFile(out, bytes);
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
    async spellDictionaries() {
      return SPELL_DICTIONARIES.map((d) => ({
        ...d,
        installed: d.bundled || store.getItem('spell:installed:' + d.id) === '1',
      }));
    },
    async spellInstallDictionary(id) {
      if (!SPELL_DICTIONARIES.some((d) => d.id === id && !d.bundled)) throw new Error(`Unknown optional dictionary: ${id}`);
      store.setItem('spell:installed:' + id, '1');
    },
    async spellRemoveDictionary(id) {
      if (!SPELL_DICTIONARIES.some((d) => d.id === id && !d.bundled)) throw new Error(`Built-in dictionary cannot be removed: ${id}`);
      store.removeItem('spell:installed:' + id);
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
  kvHistory = createKvHistory({ platform });
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
