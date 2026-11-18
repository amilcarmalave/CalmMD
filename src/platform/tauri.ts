import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { readText, writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open, save } from '@tauri-apps/plugin-dialog';
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { useRustSpell } from '../core/rustFlags';
import type { SearchHit } from '../core/search';
import type { McpConnectionInfo, McpRequest } from '../mcp/types';
import type { HighlightCodeResult, MarkdownParseResult, MarkdownRenderResult } from '../markdown/types';
import type { DirEntry, NativeMenu, NativeMenuItem, Platform, ReadResult, SaveKind, StatResult } from './types';

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'txt'] },
  { name: 'All files', extensions: ['*'] },
];

type SpellCheckResult = { misspelled: boolean; suggestions: string[] } | null;

/**
 * When the Rust spell flag is on, the bundled zspell service answers for bundled languages and
 * supports learned words on every platform. Other languages still use the OS checker.
 */
async function spellCheck(word: string, lang: string | undefined): Promise<SpellCheckResult> {
  if (useRustSpell()) {
    const native = await invoke<SpellCheckResult>('core_spell_check', { word, lang: lang ?? null });
    if (native !== null) return native;
  }
  return invoke<SpellCheckResult>('spell_check', { word, lang: lang ?? null });
}

async function spellCheckText(text: string, lang: string | undefined): Promise<[number, number][] | null> {
  if (useRustSpell()) {
    const native = await invoke<[number, number][] | null>('core_spell_check_text', { text, lang: lang ?? null });
    if (native !== null) return native;
  }
  return invoke<[number, number][] | null>('spell_check_text', { text, lang: lang ?? null });
}

async function spellLearn(word: string, lang: string | undefined): Promise<void> {
  if (useRustSpell()) {
    const handled = await invoke<boolean>('core_spell_learn', { word, lang: lang ?? null });
    if (handled) return;
  }
  await invoke<void>('spell_learn', { word, lang: lang ?? null });
}

const SAVE_FILTERS: Record<Exclude<SaveKind, 'markdown'>, { name: string; extensions: string[] }> = {
  html: { name: 'Web page', extensions: ['html'] },
  pdf: { name: 'PDF document', extensions: ['pdf'] },
  docx: { name: 'Word document', extensions: ['docx'] },
  odt: { name: 'OpenDocument text', extensions: ['odt'] },
  epub: { name: 'EPUB book', extensions: ['epub'] },
  zip: { name: 'ZIP archive', extensions: ['zip'] },
};

/**
 * macOS application menu. Rebuilt whenever the model changes (enabled or checked states), since
 * that's simpler than diffing and menus are small. The first submenu is the app menu.
 */
async function installAppMenu(menus: NativeMenu[], onSelect: (id: string) => void) {
  const { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem, Submenu } = await import('@tauri-apps/api/menu');
  type Built = Awaited<ReturnType<typeof MenuItem.new>> | Awaited<ReturnType<typeof Submenu.new>> | Awaited<ReturnType<typeof PredefinedMenuItem.new>> | Awaited<ReturnType<typeof CheckMenuItem.new>>;
  const build = async (item: NativeMenuItem): Promise<Built> => {
    switch (item.kind) {
      case 'separator':
        return PredefinedMenuItem.new({ item: 'Separator' });
      case 'predefined':
        return PredefinedMenuItem.new({ item: item.item === 'About' ? { About: null } : item.item });
      case 'submenu':
        return Submenu.new({ text: item.label, enabled: item.enabled, items: await Promise.all(item.items.map(build)) });
      case 'item': {
        const base = { id: item.id, text: item.label, enabled: item.enabled, accelerator: item.accelerator, action: () => onSelect(item.id) };
        return item.checked === undefined ? MenuItem.new(base) : CheckMenuItem.new({ ...base, checked: item.checked });
      }
    }
  };
  const app = await Submenu.new({
    text: 'CalmMD',
    items: await Promise.all(
      (
        [
          { kind: 'predefined', item: 'About' },
          { kind: 'separator' },
          { kind: 'predefined', item: 'Services' },
          { kind: 'separator' },
          { kind: 'predefined', item: 'Hide' },
          { kind: 'predefined', item: 'HideOthers' },
          { kind: 'predefined', item: 'ShowAll' },
          { kind: 'separator' },
          { kind: 'predefined', item: 'Quit' },
        ] as NativeMenuItem[]
      ).map(build),
    ),
  });
  const top = await Promise.all(menus.map(async (m) => Submenu.new({ text: m.label, items: await Promise.all(m.items.map(build)) })));
  const menu = await Menu.new({ items: [app, ...top] });
  await menu.setAsAppMenu();
}

export function createTauriPlatform(): Platform {
  const isMac = navigator.userAgent.includes('Mac');
  return {
    kind: 'tauri',
    isMac,
    nativeMenu: isMac,
    setAppMenu: (menus, onSelect) => installAppMenu(menus, onSelect),
    closeWindow: () => getCurrentWindow().close(),
    readTextFile: (path) => invoke<ReadResult>('read_text_file', { path }),
    writeTextFile: (path, text) => invoke<{ mtimeMs: number }>('write_text_file', { path, text }),
    stat: (path) => invoke<StatResult | null>('stat_path', { path }),

    searchFiles: (root, query, opts) => invoke<SearchHit[]>('search_files', { root, query, caseSensitive: opts.caseSensitive, wholeWord: opts.wholeWord }),
    listDir: (path, showHidden = false) => invoke<DirEntry[]>('list_dir', { path, showHidden }),
    createFile: (path) => invoke<void>('create_file', { path }),
    createDir: (path) => invoke<void>('create_dir', { path }),
    renamePath: (from, to) => invoke<void>('rename_path', { from, to }),
    trashPath: (path) => invoke<void>('trash_path', { path }),
    revealPath: (path) => revealItemInDir(path),
    openPath: (path) => openPath(path),

    async openFolderDialog() {
      const picked = await open({ directory: true, multiple: false });
      return typeof picked === 'string' ? picked : null;
    },
    async openFileDialog() {
      const picked = await open({ multiple: true, directory: false, filters: MARKDOWN_FILTERS });
      if (!picked) return [];
      return Array.isArray(picked) ? picked : [picked];
    },
    async openImageDialog() {
      const picked = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp'] }],
      });
      if (!picked) return [];
      return Array.isArray(picked) ? picked : [picked];
    },
    async saveFileDialog(suggestedName, kind = 'markdown') {
      const filters = kind === 'markdown' ? MARKDOWN_FILTERS : [SAVE_FILTERS[kind]];
      return (await save({ defaultPath: suggestedName, filters })) ?? null;
    },

    markdownParse: (text) => invoke<MarkdownParseResult>('markdown_parse', { text }),
    markdownRender: (text, options) => invoke<MarkdownRenderResult>('markdown_render', { text, options: options ?? null }),
    markdownHighlightCode: (language, code, theme) =>
      invoke<HighlightCodeResult>('markdown_highlight_code', { language, code, theme: theme ?? null }),

    findBrowser: () => invoke<string | null>('find_browser'),
    printPdf: (html, out) => invoke<void>('print_pdf', { html, out }),
    readImageDataUrl: (path) => invoke<string>('read_image_data_url', { path }),
    // Raw IPC body (fast for large images); the path travels in a header.
    writeBinaryFile: (path, data) => invoke<void>('write_binary_file', data, { headers: { path: encodeURIComponent(path) } }),
    copyFile: (from, to) => invoke<void>('copy_file', { from, to }),
    pendingAssetsDir: () => invoke<string>('pending_assets_dir'),
    findPandoc: () => invoke<string | null>('find_pandoc'),
    spellCheck,
    spellCheckText,
    spellLearn,
    pandocConvert: (markdown, out, resourceDir) => invoke<void>('pandoc_convert', { markdown, out, resourceDir }),
    themesDir: () => invoke<string>('themes_dir'),
    writeClipboardHtml: (html, plain) => writeHtml(html, plain),

    kvGet: (key) => invoke<string | null>('kv_get', { key }),
    kvSet: (key, value) => invoke<void>('kv_set', { key, value }),
    kvDelete: (key) => invoke<void>('kv_delete', { key }),
    kvList: (prefix) => invoke<string[]>('kv_list', { prefix }),

    readClipboard: async () => (await readText()) ?? '',
    writeClipboard: (text) => writeText(text),
    assetUrl: (absPath) => convertFileSrc(absPath),
    openExternal: (url) => openUrl(url),

    windowLabel: getCurrentWindow().label,
    initialSpaceId: () => (window as unknown as { __CALMMD_SPACE__?: string | null }).__CALMMD_SPACE__ ?? null,
    openWindow: async (spaceId) => void (await invoke<string>('open_window', { spaceId })),
    claimSpace: (spaceId) => invoke<string | null>('claim_space', { spaceId }),
    spaceWindow: (spaceId) => invoke<string | null>('space_window', { spaceId }),
    focusWindow: (label) => invoke<void>('focus_window', { label }),
    windowLabels: () => invoke<string[]>('window_labels'),
    broadcast(channel, payload) {
      void emit(`calmmd://${channel}`, { from: getCurrentWindow().label, payload });
    },
    onBroadcast(channel, handler) {
      const me = getCurrentWindow().label;
      void listen<{ from: string; payload: unknown }>(`calmmd://${channel}`, (e) => {
        if (e.payload.from !== me) handler(e.payload.payload);
      });
    },
    onOpenPaths(handler) {
      void getCurrentWindow().listen<string[]>('calmmd://open-paths', (e) => handler(e.payload));
    },

    mcpStatus: () => invoke<McpConnectionInfo>('mcp_status'),
    mcpStart: () => invoke<McpConnectionInfo>('mcp_start'),
    mcpStop: () => invoke<McpConnectionInfo>('mcp_stop'),
    onMcpRequest(handler) {
      void listen<McpRequest>('calmmd://mcp/request', (e) => handler(e.payload));
    },
    mcpRespond: (response) => invoke<void>('mcp_respond', { response }),

    setWindowTitle: (title) => getCurrentWindow().setTitle(title),
    onCloseRequested(handler) {
      // Tauri awaits the handler, then destroys the window unless the event was prevented.
      void getCurrentWindow().onCloseRequested(async () => {
        try {
          await handler();
        } catch (err) {
          console.error('close handler failed', err);
        }
      });
    },
    onFileDrop(handler) {
      void getCurrentWebview().onDragDropEvent((event) => {
        if (event.payload.type === 'drop' && event.payload.paths.length > 0) handler(event.payload.paths);
      });
    },
    launchPaths: () => invoke<string[]>('launch_paths'),
  };
}
