/**
 * Everything the app needs from the host OS. The UI only talks to this interface, so it
 * runs unchanged in Tauri, in a plain browser (dev), and in unit tests.
 */
import type { SearchHit, SearchOptions } from '../core/search';

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

  // ---------- Export ----------
  /** Path of a Chromium-family browser for PDF printing, or null. */
  findBrowser(): Promise<string | null>;
  /** Prints self-contained HTML to a PDF file. Rejects with "NO_BROWSER" if there's no engine. */
  printPdf(html: string, outPath: string): Promise<void>;
  readImageDataUrl(path: string): Promise<string>;
  /** Writes binary data (a pasted image), creating missing folders. */
  writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
  /** Copies a file, creating missing folders. Rejects if the target exists. */
  copyFile(from: string, to: string): Promise<void>;
  /** Where images pasted into untitled documents wait until the first save. */
  pendingAssetsDir(): Promise<string>;
  findPandoc(): Promise<string | null>;
  /**
   * Asks the OS spellchecker about one word (lang: BCP 47, or undefined for the system language).
   * Null when this system has no checker the app can ask (the webview may still underline).
   */
  spellCheck(word: string, lang?: string): Promise<{ misspelled: boolean; suggestions: string[] } | null>;
  /** Misspelled ranges in text ([from, to) string offsets), or null when there's no OS checker to ask. */
  spellCheckText(text: string, lang?: string): Promise<[number, number][] | null>;
  /** Adds a word to the OS user dictionary. */
  spellLearn(word: string, lang?: string): Promise<void>;
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
  /** Desktop only: opens a drawing in its own window (or focuses it). Without it, drawings open in the page. */
  openDrawingWindow?(path: string, title: string): Promise<void>;
  /** The drawing this window was opened for, if it's a drawing window. */
  initialDrawing?(): string | null;
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

  setWindowTitle(title: string): Promise<void>;
  /** The handler runs to completion before the window closes. */
  onCloseRequested(handler: () => Promise<void>): void;
  onFileDrop(handler: (paths: string[]) => void): void;
  /** Files passed on the command line or via "Open with". */
  launchPaths(): Promise<string[]>;
}
