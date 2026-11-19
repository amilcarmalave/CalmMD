/**
 * Everything the app needs from the host OS. The UI only talks to this interface, so it
 * runs unchanged in Tauri, in a plain browser (dev), and in unit tests.
 */
import type {
  BufferAutosaveChoice,
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
import type { Session } from '../app/session';
import type { SpaceRecord } from '../app/spaces';
import type { SearchHit, SearchOptions } from '../core/search';
import type { HistoryUsage, HistoryVersion } from '../history/types';
import type { SpellDictionary } from '../core/spellDictionaries';
import type { TakumiPdfOptions } from '../export/takumi';
import type { McpConnectionInfo, McpRequest, McpResponse } from '../mcp/types';
import type { WorkspaceDocument, WorkspaceEvent, WorkspaceSnapshot } from '../workspace/types';
import type {
  HighlightCodeResult,
  MarkdownParseResult,
  MarkdownRenderOptions,
  MarkdownRenderResult,
} from '../markdown/types';

export interface ReadResult {
  text: string;
  mtimeMs: number;
}

export interface StatResult {
  mtimeMs: number;
  size: number;
  isDir: boolean;
}

export type SaveKind = 'markdown' | 'html' | 'pdf' | 'docx' | 'odt' | 'epub' | 'zip';

export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

/** A native application menu (macOS), built from the same model as the in-window menu bar. */
export type NativeMenuItem =
  | { kind: 'item'; id: string; label: string; accelerator?: string; enabled: boolean; checked?: boolean }
  | { kind: 'submenu'; label: string; enabled: boolean; items: NativeMenuItem[] }
  | { kind: 'separator' }
  | { kind: 'predefined'; item: 'About' | 'Services' | 'Hide' | 'HideOthers' | 'ShowAll' | 'Quit' | 'Undo' | 'Redo' | 'Cut' | 'Copy' | 'Paste' | 'SelectAll' | 'Minimize' | 'Fullscreen' | 'CloseWindow' };
export interface NativeMenu {
  label: string;
  items: NativeMenuItem[];
}

export interface Platform {
  readonly kind: 'tauri' | 'web' | 'memory';
  readonly isMac: boolean;
  /** True where the app uses the OS menu bar (macOS desktop) instead of the in-window one. */
  readonly nativeMenu: boolean;
  /** Installs the native application menu. Only called when `nativeMenu` is true. */
  setAppMenu(menus: NativeMenu[], onSelect: (id: string) => void): Promise<void>;
  /** Asks this window to close (the close handler still runs first). */
  closeWindow(): Promise<void>;

  readTextFile(path: string): Promise<ReadResult>;
  /** Crash-safe write (temp file, fsync, rename). Resolves to the new mtime. */
  writeTextFile(path: string, text: string): Promise<{ mtimeMs: number }>;
  stat(path: string): Promise<StatResult | null>;

  /** Matching lines in the Markdown files under `root` (hidden and tool folders skipped). */
  searchFiles(root: string, query: string, opts: SearchOptions): Promise<SearchHit[]>;
  /** Folder contents: folders first, natural order, no hidden or tool folders unless asked. */
  listDir(path: string, showHidden?: boolean): Promise<DirEntry[]>;
  createFile(path: string): Promise<void>;
  createDir(path: string): Promise<void>;
  /** Never overwrites an existing target. */
  renamePath(from: string, to: string): Promise<void>;
  /** Moves to the OS trash. Never deletes permanently. */
  trashPath(path: string): Promise<void>;
  revealPath(path: string): Promise<void>;
  /** Opens a file with the app the OS associates with it. */
  openPath(path: string): Promise<void>;

  openFileDialog(): Promise<string[]>;
  /** Pick image files (Insert Image from File…). */
  openImageDialog(): Promise<string[]>;
  openFolderDialog(): Promise<string | null>;
  saveFileDialog(suggestedName: string, kind?: SaveKind): Promise<string | null>;

  // ---------- Rust core services (feature-flagged) ----------
  /** Parses Markdown into headings, front matter and a source map. */
  markdownParse(text: string): Promise<MarkdownParseResult>;
  /** Renders Markdown with Mordant and returns its source map. */
  markdownRender(text: string, options?: MarkdownRenderOptions): Promise<MarkdownRenderResult>;
  /** Standalone fenced-code highlighting via Mordant/syntect. */
  markdownHighlightCode(language: string, code: string, theme?: string): Promise<HighlightCodeResult>;

  // ---------- Rust-owned live workspace (Phase 6) ----------
  /** Mirrors the webview's live buffers into Rust so MCP can read unsaved edits. */
  workspaceSync(snapshot: WorkspaceSnapshot): Promise<void>;
  /** Sends one changed buffer without rebuilding the whole snapshot. */
  workspaceUpsert(document: WorkspaceDocument, activeDocument?: string | null): Promise<void>;
  /** Subscribes to state changes made directly by the Rust workspace services. */
  onWorkspaceEvent(handler: (event: WorkspaceEvent) => void): void;

  // ---------- Rust-owned session and Spaces ----------
  /** Reads a validated session record (`session` or `space/<id>`). */
  sessionGet(key: string): Promise<Session | null>;
  sessionSet(key: string, session: Session): Promise<void>;
  spaceGet(id: string): Promise<SpaceRecord | null>;
  spaceSave(space: SpaceRecord): Promise<void>;
  spaceRemove(id: string): Promise<void>;
  spaces(): Promise<SpaceRecord[]>;

  // ---------- Rust-owned file history ----------
  historyList(path: string): Promise<HistoryVersion[]>;
  historyRead(path: string, id: string): Promise<string | null>;
  historySave(path: string, text: string, name: string | null): Promise<HistoryVersion | null>;
  historyRemove(path: string, id: string): Promise<void>;
  historyRename(from: string, to: string): Promise<void>;
  historyClearFile(path: string): Promise<void>;
  historyClearAll(): Promise<void>;
  historyUsage(): Promise<HistoryUsage>;

  // ---------- Rust-owned drafts and autosave targets ----------
  /** Writes one durable draft record. */
  bufferDraftWrite(id: string, record: BufferDraft): Promise<void>;
  bufferDraftDelete(id: string): Promise<void>;
  bufferDrafts(): Promise<BufferDraftEntry[]>;
  /** Applies the Rust write/conflict decision for one autosave. */
  bufferPersist(request: BufferPersistRequest): Promise<BufferPersistResult>;
  /** Reads and decodes a file using the same EOL/BOM rules as the workspace. */
  bufferLoad(path: string): Promise<BufferFile>;
  /** Reports the latest buffer text; Rust owns debounce/max-wait and retries. */
  bufferAutosaveTouch(request: BufferAutosaveRequest): Promise<BufferAutosaveState>;
  bufferAutosaveFlush(id: string): Promise<BufferAutosaveState>;
  bufferAutosaveStatus(id: string): Promise<BufferAutosaveState | null>;
  bufferAutosaveDispose(id: string): Promise<void>;
  /** Applies a conflict choice to the pending Rust buffer. */
  bufferAutosaveResolve(id: string, choice: BufferAutosaveChoice): Promise<BufferAutosaveResolveResult>;
  onBufferAutosave(handler: (event: BufferAutosaveEvent) => void): void;

  // ---------- Export ----------
  /** Path of a Chromium-family browser for PDF printing, or null. */
  findBrowser(): Promise<string | null>;
  /** Prints self-contained HTML to a PDF file. Rejects with "NO_BROWSER" if there's no engine. */
  printPdf(html: string, outPath: string): Promise<void>;
  /** Writes a PDF with the native Rust Takumi engine (desktop only). */
  takumiPdf(html: string, outPath: string, options: TakumiPdfOptions): Promise<void>;
  readImageDataUrl(path: string): Promise<string>;
  /** Writes binary data (a pasted image), creating missing folders. */
  writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
  /** Copies a file, creating missing folders. Rejects if the target exists. */
  copyFile(from: string, to: string): Promise<void>;
  /** Where images pasted into untitled documents wait until the first save. */
  pendingAssetsDir(): Promise<string>;
  findPandoc(): Promise<string | null>;
  /**
   * Checks one word (lang: BCP 47, or undefined for the system language). Uses the bundled Rust
   * dictionary when `useRustSpell()` is on, otherwise the OS checker. Null when neither has a
   * dictionary for that language (the webview may still underline).
   */
  spellCheck(word: string, lang?: string): Promise<{ misspelled: boolean; suggestions: string[] } | null>;
  /** Misspelled ranges in text ([from, to) string offsets), or null when no checker is available. */
  spellCheckText(text: string, lang?: string): Promise<[number, number][] | null>;
  /** Adds a word to the active checker's user dictionary. */
  spellLearn(word: string, lang?: string): Promise<void>;
  /** Available and downloadable Hunspell dictionaries (desktop Rust service). */
  spellDictionaries(): Promise<SpellDictionary[]>;
  /** Downloads one curated dictionary into app data. Explicit user action only. */
  spellInstallDictionary(id: string): Promise<void>;
  /** Removes a previously downloaded dictionary. Built-ins cannot be removed. */
  spellRemoveDictionary(id: string): Promise<void>;
  pandocConvert(markdown: string, outPath: string, resourceDir: string | null): Promise<void>;
  /** User themes folder (created with an example on first use). */
  themesDir(): Promise<string>;
  writeClipboardHtml(html: string, plain: string): Promise<void>;

  /** Small durable key/value store in the app data folder (drafts, session, settings). */
  kvGet(key: string): Promise<string | null>;
  kvSet(key: string, value: string): Promise<void>;
  kvDelete(key: string): Promise<void>;
  kvList(prefix: string): Promise<string[]>;

  /** A URL the webview can load for a local file (images in the preview). */
  assetUrl(absPath: string): string;
  readClipboard(): Promise<string>;
  writeClipboard(text: string): Promise<void>;

  /** Opens an http(s)/mailto link in the user's default app. */
  openExternal(url: string): Promise<void>;

  // ---------- Windows and Spaces ----------
  /** This window's label: "main" for the first window. */
  readonly windowLabel: string;
  /** The Space this window was opened for, if any. */
  initialSpaceId(): string | null;
  openWindow(spaceId: string | null): Promise<void>;
  /** Binds a Space to this window (null releases it). Returns another window's label if it already holds the Space. */
  claimSpace(spaceId: string | null): Promise<string | null>;
  /** The window that currently holds a Space, if any. */
  spaceWindow(spaceId: string): Promise<string | null>;
  focusWindow(label: string): Promise<void>;
  windowLabels(): Promise<string[]>;
  /** Sends to every *other* window (settings, favorites and spaces changed). */
  broadcast(channel: string, payload?: unknown): void;
  onBroadcast(channel: string, handler: (payload: unknown) => void): void;
  /** Files opened while the app was already running (single instance). */
  onOpenPaths(handler: (paths: string[]) => void): void;

  // ---------- Local MCP bridge ----------
  /** Status of the embedded, loopback-only MCP server. */
  mcpStatus(): Promise<McpConnectionInfo>;
  mcpStart(): Promise<McpConnectionInfo>;
  mcpStop(): Promise<McpConnectionInfo>;
  /** Called for each tool call routed to this window. */
  onMcpRequest(handler: (request: McpRequest) => void): void;
  /** Sends the tool result back to the Rust server. */
  mcpRespond(response: McpResponse): Promise<void>;

  setWindowTitle(title: string): Promise<void>;
  /** The handler runs to completion before the window closes. */
  onCloseRequested(handler: () => Promise<void>): void;
  onFileDrop(handler: (paths: string[]) => void): void;
  /** Files passed on the command line or via "Open with". */
  launchPaths(): Promise<string[]>;
}
