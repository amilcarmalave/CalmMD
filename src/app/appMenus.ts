import { basename, dirname } from '../core/paths';
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../editor/colors';
import { COLOR_THEMES, type ColorTheme } from './colorThemes';
import { act, cmd, sep, sub, type MenuEntry, type TopMenu } from './menuModel';
import { SPELL_LANGUAGES, type Settings, type ViewMode } from './settings';
import { BUILTIN_THEMES } from './themes';
import { FONT_LABELS, WIDTH_LABELS } from './appCommands';

export interface MenuContext {
  settings: Settings;
  mode: () => ViewMode;
  effectiveScheme: () => 'light' | 'dark';
  pandoc: () => boolean;
  inSpace: () => boolean;
  spaces: () => { id: string; name: string; current: boolean }[];
  switchSpace: (id: string) => void;
  recentFolders: () => string[];
  openFolder: (path: string) => void;
  clearRecentFolders: () => void;
  userThemes: () => { id: string; name: string }[];
  pickColorTheme: (t: ColorTheme) => void;
  /** macOS: the app menu holds About and Quit, so Help and File drop theirs. */
  isMac: boolean;
}

/** The application menus. Entries are mostly command ids from appCommands.ts and App.tsx. */
export function appMenus(c: MenuContext): TopMenu[] {
  const viewMode = (m: ViewMode) => cmd(`view.${m}`, { checked: () => c.mode() === m });

  const file: TopMenu = {
    label: 'File',
    items: () => [
      cmd('file.new'),
      cmd('file.newDrawing'),
      cmd('window.new'),
      sep,
      cmd('file.open'),
      cmd('file.openFolder'),
      sub('Open Recent Folder', (): MenuEntry[] => {
        const list = c.recentFolders();
        if (!list.length) return [act('No recent folders', () => {}, { enabled: () => false })];
        return [...list.map((p) => act(`${basename(p) || p}`, () => c.openFolder(p), { hint: dirname(p) })), sep, act('Clear Recent Folders', c.clearRecentFolders)];
      }),
      cmd('file.parentFolder'),
      sep,
      cmd('file.save'),
      cmd('file.saveAs'),
      cmd('history.save', { label: 'Save Version…' }),
      cmd('history.show'),
      sep,
      sub('Share', () => [
        cmd('share.zip', { label: 'As .zip with Images…' }),
        cmd('share.single', { label: 'As One File (Images Inside)…' }),
      ]),
      sub('Export', () => [
        cmd('export.pdf', { label: 'PDF…' }),
        cmd('export.html', { label: 'HTML…' }),
        ...(c.pandoc()
          ? [sep, cmd('export.docx', { label: 'Word (.docx)…' }), cmd('export.odt', { label: 'OpenDocument (.odt)…' }), cmd('export.epub', { label: 'EPUB…' })]
          : [sep, act('Word, ODT and EPUB need Pandoc', () => {}, { enabled: () => false })]),
        sep,
        cmd('export.copyHtml'),
      ]),
      sep,
      sep,
      cmd('mcp.start', { label: 'Start MCP Server' }),
      cmd('mcp.stop', { label: 'Stop MCP Server' }),
      cmd('mcp.autostart', { label: 'Auto-start MCP Server', checked: () => c.settings.mcpAutostart }),
      sub('Spaces', () => [
        ...c.spaces().map((s) => act(s.name, () => c.switchSpace(s.id), { checked: () => s.current })),
        ...(c.spaces().length ? [sep] : []),
        cmd('space.switch'),
        cmd('space.save'),
        cmd('space.rename'),
        cmd('space.close'),
        cmd('space.delete'),
      ]),
      sep,
      cmd('file.reveal'),
      cmd('file.close'),
      cmd('file.reopen'),
      cmd('file.closeFolder'),
      ...(c.isMac ? [] : [sep, cmd('app.quit', { label: 'Exit' })]),
    ],
  };

  const edit: TopMenu = {
    label: 'Edit',
    items: () => [
      cmd('edit.undo'),
      cmd('edit.redo'),
      sep,
      cmd('edit.cut'),
      cmd('edit.copy'),
      cmd('edit.paste'),
      cmd('edit.selectAll'),
      sep,
      cmd('edit.find'),
      cmd('view.search'),
      cmd('palette.line'),
      sep,
      cmd('export.copyHtml'),
    ],
  };

  const view: TopMenu = {
    label: 'View',
    items: () => [
      viewMode('source'),
      viewMode('live'),
      viewMode('split'),
      viewMode('preview'),
      sep,
      cmd('view.sidebar'),
      cmd('view.files'),
      cmd('view.outline'),
      cmd('view.search'),
      cmd('view.toolbar', { label: 'Toolbar', checked: () => c.settings.toolbarVisible }),
      cmd('view.customizeToolbar'),
      sep,
      sub('Color Theme', () => [
        ...COLOR_THEMES.filter((t) => t.kind === 'light').map((t) => colorItem(c, t)),
        sep,
        ...COLOR_THEMES.filter((t) => t.kind === 'dark').map((t) => colorItem(c, t)),
        sep,
        cmd('scheme.system', { label: 'Match System', checked: () => c.settings.colorScheme === 'system' }),
        cmd('scheme.light', { label: 'Always Light', checked: () => c.settings.colorScheme === 'light' }),
        cmd('scheme.dark', { label: 'Always Dark', checked: () => c.settings.colorScheme === 'dark' }),
      ]),
      sub('Document Style', () => [
        ...BUILTIN_THEMES.map((t) => cmd(`theme.${t.id}`, { label: t.label, checked: () => c.settings.previewTheme === t.id })),
        ...(c.userThemes().length ? [sep, ...c.userThemes().map((t) => cmd(`theme.user.${t.id}`, { label: t.name, checked: () => c.settings.previewTheme === t.id }))] : []),
        sep,
        cmd('theme.openFolder'),
        cmd('theme.reload'),
      ]),
      sub('Font', () => FONT_LABELS.map(([f, label]) => cmd(`font.${f}`, { label, checked: () => c.settings.fontFamily === f }))),
      sub('Text Width', () => WIDTH_LABELS.map(([w, label]) => cmd(`width.${w}`, { label, checked: () => c.settings.textWidth === w }))),
      sep,
      cmd('view.zoomIn'),
      cmd('view.zoomOut'),
      cmd('view.zoomReset'),
      sep,
      cmd('view.scrollSync', { label: 'Sync Scrolling', checked: () => c.settings.scrollSync }),
    ],
  };

  const insert: TopMenu = {
    label: 'Insert',
    items: () => [
      cmd('format.link'),
      cmd('insert.imageFile'),
      cmd('insert.image', { label: 'Image Link' }),
      cmd('insert.table'),
      sep,
      cmd('insert.codeBlock'),
      cmd('insert.math'),
      cmd('insert.mermaid'),
      cmd('insert.drawing'),
      sep,
      cmd('insert.footnote'),
      cmd('insert.hr'),
      sep,
      sub('Pasted Images Go', () => [
        cmd('images.document', { label: 'Next to the Document (assets/)', checked: () => c.settings.imageFolder === 'document' }),
        cmd('images.root', { label: 'In the Folder or Space Root (assets/)', checked: () => c.settings.imageFolder === 'root' }),
      ]),
    ],
  };

  const format: TopMenu = {
    label: 'Format',
    items: () => [
      cmd('format.bold'),
      cmd('format.italic'),
      cmd('format.strike'),
      cmd('format.code'),
      sub('Highlight', () => [
        cmd('format.highlight.default', { label: 'Default', checked: () => c.settings.highlightColor === 'default' }),
        ...HIGHLIGHT_COLORS.map((h) => cmd(`format.highlight.${h.id}`, { label: h.label, checked: () => c.settings.highlightColor === h.id })),
        cmd('format.highlight.custom', { label: 'Custom…', checked: () => /^#/.test(c.settings.highlightColor) }),
        sep,
        cmd('format.highlight.none'),
      ]),
      sub('Text Color', () => [
        ...TEXT_COLORS.map((t) => cmd(`format.textColor.${t.id}`, { label: t.label, checked: () => c.settings.textColor === t.id })),
        cmd('format.textColor.custom', { label: 'Custom…', checked: () => /^#/.test(c.settings.textColor) }),
        sep,
        cmd('format.textColor.none'),
      ]),
      sep,
      sub('Heading', () => [cmd('format.paragraph', { label: 'Paragraph' }), sep, ...[1, 2, 3, 4, 5, 6].map((n) => cmd(`format.heading${n}`))]),
      cmd('format.bulletList'),
      cmd('format.orderedList'),
      cmd('format.taskList'),
      cmd('format.quote'),
      sep,
      sub('Table', () => [
        cmd('table.rowAbove'),
        cmd('table.rowBelow'),
        cmd('table.colLeft'),
        cmd('table.colRight'),
        sep,
        cmd('table.deleteRow'),
        cmd('table.deleteCol'),
        sep,
        cmd('table.align-left'),
        cmd('table.align-center'),
        cmd('table.align-right'),
        sep,
        cmd('table.format'),
      ]),
      sep,
      cmd('format.clear'),
    ],
  };

  const tools: TopMenu = {
    label: 'Tools',
    items: () => [
      cmd('palette.commands', { label: 'Command Palette…' }),
      cmd('palette.files'),
      cmd('palette.headings'),
      sep,
      cmd('edit.spellcheck', { label: 'Check Spelling', checked: () => c.settings.spellcheck }),
      sub('Spelling Language', () => SPELL_LANGUAGES.map(([code, label]) => cmd(`spell.${code}`, { label, checked: () => c.settings.spellLang === code }))),
      cmd('view.slash', { label: 'Slash Commands', checked: () => c.settings.slashCommands }),
      sep,
      sub('Export', () => [cmd('export.pdf', { label: 'PDF…' }), cmd('export.html', { label: 'HTML…' }), cmd('export.copyHtml')]),
    ],
  };

  const help: TopMenu = {
    label: 'Help',
    items: () => [
      cmd('help.shortcuts'),
      cmd('help.welcome'),
      cmd('help.markdown'),
      sep,
      cmd('help.checkUpdates'),
      cmd('help.updateNotices', { checked: () => c.settings.updateCheck === 'on' }),
      ...(c.isMac ? [] : [sep, cmd('help.about')]),
    ],
  };

  return [file, edit, view, insert, format, tools, help];
}

function colorItem(c: MenuContext, t: ColorTheme): MenuEntry {
  return act(t.label, () => c.pickColorTheme(t), {
    checked: () => (t.kind === 'light' ? c.settings.lightTheme : c.settings.darkTheme) === t.id,
    hint: t.kind === c.effectiveScheme() && (t.kind === 'light' ? c.settings.lightTheme : c.settings.darkTheme) === t.id ? 'in use' : undefined,
  });
}
