import { redo, selectAll, undo } from '@codemirror/commands';
import { openSearchPanel } from '@codemirror/search';
import type { TransactionSpec } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import {
  clearFormatting,
  insertBlock,
  insertImage,
  insertLink,
  setHeading,
  TABLE_TEMPLATE,
  toggleCodeBlock,
  toggleInline,
  toggleLineKind,
} from '../editor/format';
import { applyColor, colorValue, HIGHLIGHT_COLORS, TEXT_COLORS } from '../editor/colors';
import { setTypingColor, typingColorField } from '../editor/typingColor';
import { deleteColumn, deleteRow, insertColumn, insertRow, setAlign, type Align } from '../editor/table';
import { editTable, tableAt } from '../editor/tableCommands';
import type { Command } from './commands';
import type { Documents } from './documents';
import type { Explorer } from './explorer';
import type { SidebarView } from './session';
import { COLOR_THEMES, type ColorTheme } from './colorThemes';
import type { ColorScheme, FontChoice, Settings, TextWidth, ViewMode } from './settings';

export const WIDTH_LABELS: [TextWidth, string][] = [
  ['narrow', 'Narrow'],
  ['standard', 'Standard'],
  ['wide', 'Wide'],
  ['full', 'Full Width'],
];

export const FONT_LABELS: [FontChoice, string][] = [
  ['style', 'From Document Style'],
  ['sans', 'Sans (Inter)'],
  ['serif', 'Serif (Literata)'],
  ['mono', 'Monospace (JetBrains Mono)'],
  ['system', 'System UI'],
];
import { BUILTIN_THEMES } from './themes';

export interface CommandContext {
  docs: Documents;
  explorer: Explorer;
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  view: () => EditorView | undefined;
  mode: () => ViewMode;
  setMode: (m: ViewMode) => void;
  cycleMode: () => void;
  showSidebar: (v?: SidebarView) => void;
  openPalette: (kind: 'commands' | 'files' | 'line' | 'headings') => void;
  customizeToolbar: () => void;
  cycleTab: (dir: 1 | -1) => void;
  reopenClosed: () => void;
  revealActive: () => void;
  notify: (msg: string) => void;
  /** Applies a colour theme (switching to light or dark to match it). */
  pickColorTheme: (t: ColorTheme) => void;
  clipboard: { read: () => Promise<string>; write: (text: string) => Promise<void> };
  /** Pro: opens the system colour picker and passes back "#rrggbb". */
  pickCustomColor: (kind: 'highlight' | 'text', apply: (hex: string) => void) => void;
}

/** Toggles a task's checkbox on the cursor lines, or turns the lines into tasks. */
function toggleTask(state: EditorState): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.head);
  const m = /^(\s*[-*+]\s+)\[([ xX])\]/.exec(line.text);
  if (m) {
    const at = line.from + m[1].length + 1;
    return { changes: { from: at, to: at + 1, insert: m[2] === ' ' ? 'x' : ' ' } };
  }
  return toggleLineKind(state, 'task');
}

/** Inserts the next footnote reference at the cursor and its definition at the end of the document. */
export function insertFootnote(state: EditorState): TransactionSpec {
  const text = state.doc.toString();
  const n = (text.match(/^\[\^\d+\]:/gm)?.length ?? 0) + 1;
  const ref = `[^${n}]`;
  const def = (text.endsWith('\n') ? '\n' : '\n\n') + `${ref}: `;
  return {
    changes: [
      { from: state.selection.main.to, insert: ref },
      { from: state.doc.length, insert: def },
    ],
    selection: { anchor: state.doc.length + ref.length + def.length },
    scrollIntoView: true,
  };
}

export function buildCommands(ctx: CommandContext): Command[] {
  const editorVisible = () => ctx.mode() !== 'preview';
  /** Runs a pure formatting op on the editor and refocuses it. */
  const edit = (op: (s: EditorState) => TransactionSpec | null) => () => {
    const v = ctx.view();
    if (!v) return;
    const spec = op(v.state);
    if (spec) v.dispatch({ ...spec, userEvent: 'input.format' });
    v.focus();
  };
  const inTable = () => {
    const v = ctx.view();
    return !!v && editorVisible() && !!tableAt(v.state);
  };
  const tableOp =
    (op: Parameters<typeof editTable>[1]) =>
    () => edit((s) => editTable(s, op))();
  const fmt = (id: string, title: string, run: () => void, keys?: string): Command => ({
    id,
    title,
    category: 'Format',
    keys,
    scope: 'editor',
    when: editorVisible,
    run,
  });
  const ins = (id: string, title: string, run: () => void, keys?: string): Command => ({
    id,
    title,
    category: 'Insert',
    keys,
    scope: 'editor',
    when: editorVisible,
    run,
  });
  const block = (text: string, cursor: number | [number, number]) => edit((s) => insertBlock(s, text, cursor));

  const nothingSelected = (s: EditorState) => s.selection.ranges.every((r) => r.empty);

  /**
   * Highlight with a palette id ("default" is ==text==). Picking from the dropdown with nothing
   * selected only changes the button's colour; it never inserts anything.
   */
  const highlightWith = (id: string, picked: boolean) => {
    const value = id === 'default' ? 'default' : colorValue('highlight', id);
    const v = ctx.view();
    if (!value || !v) return;
    if (ctx.settings.highlightColor !== id) ctx.update({ highlightColor: id });
    if (nothingSelected(v.state)) {
      if (!picked) ctx.notify('Select some text to highlight');
      v.focus();
      return;
    }
    edit((s) => (value === 'default' && !hasColorTag(s) ? toggleInline(s, '==') : applyColor(s, 'highlight', value)))();
  };
  /**
   * Text colour. With a selection it's coloured right away. With nothing selected the colour is
   * armed at the cursor and applies to what you type next (editor/typingColor.ts).
   */
  const textColorWith = (id: string, picked: boolean) => {
    const value = colorValue('text', id);
    const v = ctx.view();
    if (!value || !v) return;
    if (ctx.settings.textColor !== id) ctx.update({ textColor: id });
    if (nothingSelected(v.state)) {
      const armed = v.state.field(typingColorField, false);
      // The button (not the dropdown) toggles: pressing it again while armed disarms.
      const off = !picked && armed?.value === value;
      v.dispatch({ effects: setTypingColor.of(off ? null : { pos: v.state.selection.main.head, value }) });
      v.focus();
      return;
    }
    edit((s) => applyColor(s, 'text', value))();
  };
  /** Whether the selection sits in (or holds) a coloured <mark>, which ==…== toggling can't undo. */
  const hasColorTag = (s: EditorState) => {
    const r = s.selection.main;
    return /<mark[^>]*>$/i.test(s.sliceDoc(Math.max(0, r.from - 120), r.from)) || /^<mark[^>]*>/i.test(s.sliceDoc(r.from, r.to));
  };

  /** Cut, copy and paste from menus, through the platform clipboard. */
  const clip = async (kind: 'cut' | 'copy' | 'paste') => {
    const v = ctx.view();
    if (!v) return;
    const sel = v.state.selection.main;
    if (kind === 'paste') {
      let text: string;
      try {
        text = await ctx.clipboard.read();
      } catch {
        return ctx.notify('Couldn’t read the clipboard. Use the keyboard shortcut instead.');
      }
      v.dispatch(v.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true });
    } else if (!sel.empty) {
      await ctx.clipboard.write(v.state.sliceDoc(sel.from, sel.to));
      if (kind === 'cut') v.dispatch({ changes: { from: sel.from, to: sel.to }, userEvent: 'delete.cut' });
    }
    v.focus();
  };

  const viewModes: [ViewMode, string, string][] = [
    ['source', 'Source', 'Mod+Alt+1'],
    ['live', 'Live', 'Mod+Alt+2'],
    ['split', 'Split', 'Mod+Alt+3'],
    ['preview', 'Preview', 'Mod+Alt+4'],
  ];
  const schemes: [ColorScheme, string][] = [
    ['system', 'Match System'],
    ['light', 'Light'],
    ['dark', 'Dark'],
  ];
  const zoom = (factor: number | null) => () => {
    const next = factor === null ? 1 : Math.round(Math.min(1.8, Math.max(0.7, ctx.settings.fontScale * factor)) * 100) / 100;
    ctx.update({ fontScale: next });
    ctx.notify(`Zoom ${Math.round(next * 100)}%`);
  };

  return [
    // ---------- File ----------
    { id: 'file.new', title: 'New Document', category: 'File', keys: 'Mod+N', run: () => ctx.docs.newDoc() },
    { id: 'file.open', title: 'Open File…', category: 'File', keys: 'Mod+O', run: () => ctx.docs.openWithDialog() },
    { id: 'file.openFolder', title: 'Open Folder…', category: 'File', run: () => ctx.explorer.openFolderDialog() },
    { id: 'file.parentFolder', title: 'Open Parent Folder', category: 'File', when: () => !!ctx.explorer.state.root, run: () => ctx.explorer.openParent() },
    { id: 'file.closeFolder', title: 'Close Folder', category: 'File', when: () => !!ctx.explorer.state.root, run: () => ctx.explorer.setRoot(null) },
    { id: 'file.save', title: 'Save', category: 'File', keys: 'Mod+S', run: () => ctx.docs.save() },
    { id: 'file.saveAs', title: 'Save As…', category: 'File', keys: 'Mod+Shift+S', run: () => ctx.docs.saveAs() },
    { id: 'file.close', title: 'Close Tab', category: 'File', keys: 'Mod+W', run: () => ctx.docs.close() },
    { id: 'file.reopen', title: 'Reopen Closed Tab', category: 'File', keys: 'Mod+Shift+T', run: ctx.reopenClosed },
    { id: 'file.reveal', title: 'Reveal Active File in Sidebar', category: 'File', run: ctx.revealActive },

    // ---------- Navigate ----------
    { id: 'palette.commands', title: 'Show All Commands', category: 'Go', keys: 'Mod+Shift+P', run: () => ctx.openPalette('commands'), palette: false },
    { id: 'palette.files', title: 'Go to File…', category: 'Go', keys: 'Mod+P', run: () => ctx.openPalette('files') },
    { id: 'palette.line', title: 'Go to Line…', category: 'Go', keys: 'Mod+G', run: () => ctx.openPalette('line'), when: editorVisible },
    { id: 'palette.headings', title: 'Go to Heading…', category: 'Go', keys: 'Mod+Shift+H', run: () => ctx.openPalette('headings') },
    { id: 'tab.next', title: 'Next Tab', category: 'Go', keys: 'Ctrl+Tab', run: () => ctx.cycleTab(1) },
    { id: 'tab.prev', title: 'Previous Tab', category: 'Go', keys: 'Ctrl+Shift+Tab', run: () => ctx.cycleTab(-1) },
    { id: 'tab.nextPage', title: 'Next Tab', category: 'Go', keys: 'Ctrl+PageDown', run: () => ctx.cycleTab(1), palette: false },
    { id: 'tab.prevPage', title: 'Previous Tab', category: 'Go', keys: 'Ctrl+PageUp', run: () => ctx.cycleTab(-1), palette: false },
    ...Array.from({ length: 9 }, (_, i): Command => ({
      id: `tab.go${i + 1}`,
      title: i === 8 ? 'Go to Last Tab' : `Go to Tab ${i + 1}`,
      category: 'Go',
      keys: `Mod+${i + 1}`,
      palette: false,
      run: () => {
        const list = ctx.docs.store.docs;
        const t = i === 8 ? list[list.length - 1] : list[i];
        if (t) ctx.docs.activate(t.id);
      },
    })),

    // ---------- Edit ----------
    { id: 'edit.find', title: 'Find and Replace', category: 'Edit', when: editorVisible, run: () => { const v = ctx.view(); if (v) { v.focus(); openSearchPanel(v); } } },
    { id: 'edit.undo', title: 'Undo', category: 'Edit', when: editorVisible, run: () => { const v = ctx.view(); if (v) undo(v); } },
    { id: 'edit.redo', title: 'Redo', category: 'Edit', when: editorVisible, run: () => { const v = ctx.view(); if (v) redo(v); } },
    { id: 'edit.selectAll', title: 'Select All', category: 'Edit', when: editorVisible, run: () => { const v = ctx.view(); if (v) { v.focus(); selectAll(v); } } },
    // Menu versions of the clipboard keys (the keys themselves stay native).
    { id: 'edit.cut', title: 'Cut', category: 'Edit', when: editorVisible, palette: false, run: () => clip('cut') },
    { id: 'edit.copy', title: 'Copy', category: 'Edit', when: editorVisible, palette: false, run: () => clip('copy') },
    { id: 'edit.paste', title: 'Paste', category: 'Edit', when: editorVisible, palette: false, run: () => clip('paste') },

    // ---------- Format ----------
    fmt('format.bold', 'Bold', edit((s) => toggleInline(s, '**')), 'Mod+B'),
    fmt('format.italic', 'Italic', edit((s) => toggleInline(s, '_')), 'Mod+I'),
    fmt('format.strike', 'Strikethrough', edit((s) => toggleInline(s, '~~')), 'Mod+Shift+X'),
    // Highlight and text colour: the main command reuses the last colour; each swatch is a command.
    fmt('format.highlight', 'Highlight', () => highlightWith(ctx.settings.highlightColor, false), 'Mod+Shift+M'),
    fmt('format.highlight.default', 'Highlight: Default', () => highlightWith('default', true)),
    ...HIGHLIGHT_COLORS.map((c) => fmt(`format.highlight.${c.id}`, `Highlight: ${c.label}`, () => highlightWith(c.id, true))),
    fmt('format.highlight.none', 'Remove Highlight', edit((s) => applyColor(s, 'highlight', null))),
    fmt('format.textColor', 'Text Color', () => textColorWith(ctx.settings.textColor, false)),
    ...TEXT_COLORS.map((c) => fmt(`format.textColor.${c.id}`, `Text Color: ${c.label}`, () => textColorWith(c.id, true))),
    fmt('format.textColor.none', 'Remove Text Color', edit((s) => applyColor(s, 'text', null))),
    // Pro: any colour, from the system colour picker.
    fmt('format.highlight.custom', 'Highlight: Custom Color…', () => ctx.pickCustomColor('highlight', (hex) => highlightWith(hex, true))),
    fmt('format.textColor.custom', 'Text Color: Custom Color…', () => ctx.pickCustomColor('text', (hex) => textColorWith(hex, true))),
    fmt('format.code', 'Inline Code', edit((s) => toggleInline(s, '`')), 'Mod+`'),
    fmt('format.link', 'Link', edit(insertLink), 'Mod+K'),
    fmt('format.clear', 'Clear Formatting', edit(clearFormatting)),
    ...[1, 2, 3, 4, 5, 6].map((n) => fmt(`format.heading${n}`, `Heading ${n}`, edit((s) => setHeading(s, n)), `Mod+Shift+${n}`)),
    fmt('format.paragraph', 'Paragraph (Remove Heading)', edit((s) => setHeading(s, 0)), 'Mod+Shift+0'),
    fmt('format.bulletList', 'Bulleted List', edit((s) => toggleLineKind(s, 'bullet')), 'Mod+Shift+8'),
    fmt('format.orderedList', 'Numbered List', edit((s) => toggleLineKind(s, 'ordered')), 'Mod+Shift+7'),
    fmt('format.taskList', 'Task List / Toggle Task', edit(toggleTask), 'Mod+Enter'),
    fmt('format.quote', 'Quote', edit((s) => toggleLineKind(s, 'quote')), 'Mod+Shift+.'),

    // ---------- Insert ----------
    ins('insert.codeBlock', 'Code Block', edit(toggleCodeBlock), 'Mod+Alt+C'),
    ins('insert.table', 'Table', block(TABLE_TEMPLATE, [2, 10])),
    ins('insert.hr', 'Horizontal Rule', block('---', 3)),
    ins('insert.image', 'Image Link', edit(insertImage)),
    ins('insert.math', 'Math Block', block('$$\n\n$$', 3)),
    ins('insert.mermaid', 'Mermaid Diagram', block('```mermaid\nflowchart LR\n  A --> B\n```', [11, 30])),
    ins('insert.footnote', 'Footnote', edit(insertFootnote)),

    // ---------- Table ----------
    ...([
      ['table.rowAbove', 'Insert Row Above', tableOp((c) => ({ table: insertRow(c.table, Math.max(1, c.row)), row: Math.max(1, c.row), col: c.col }))],
      ['table.rowBelow', 'Insert Row Below', tableOp((c) => ({ table: insertRow(c.table, c.row + 1), row: c.row + 1, col: c.col }))],
      ['table.colLeft', 'Insert Column Left', tableOp((c) => ({ table: insertColumn(c.table, c.col), row: c.row, col: c.col }))],
      ['table.colRight', 'Insert Column Right', tableOp((c) => ({ table: insertColumn(c.table, c.col + 1), row: c.row, col: c.col + 1 }))],
      ['table.deleteRow', 'Delete Row', tableOp((c) => ({ table: deleteRow(c.table, c.row), row: Math.max(0, c.row - 1), col: c.col }))],
      ['table.deleteCol', 'Delete Column', tableOp((c) => ({ table: deleteColumn(c.table, c.col), row: c.row, col: Math.max(0, c.col - 1) }))],
      ...(['left', 'center', 'right'] as Align[]).map(
        (a) => [`table.align-${a}`, `Align Column ${a![0].toUpperCase() + a!.slice(1)}`, tableOp((c) => ({ table: setAlign(c.table, c.col, a), row: c.row, col: c.col }))] as const,
      ),
      ['table.format', 'Format Table', tableOp((c) => ({ table: c.table, row: c.row, col: c.col }))],
    ] as const).map(([id, title, run]): Command => ({ id, title, category: 'Table', scope: 'editor', when: inTable, run })),

    // ---------- View ----------
    ...viewModes.map(([m, label, keys]): Command => ({ id: `view.${m}`, title: `${label} Mode`, category: 'View', keys, run: () => ctx.setMode(m) })),
    { id: 'view.cycle', title: 'Cycle View Mode', category: 'View', keys: 'Mod+E', run: ctx.cycleMode },
    { id: 'view.sidebar', title: 'Toggle Sidebar', category: 'View', keys: 'Mod+\\', run: () => ctx.showSidebar() },
    { id: 'view.files', title: 'Show Files', category: 'View', keys: 'Mod+Shift+E', run: () => ctx.showSidebar('files') },
    { id: 'view.outline', title: 'Show Outline', category: 'View', keys: 'Mod+Shift+O', run: () => ctx.showSidebar('outline') },
    { id: 'view.toolbar', title: 'Toggle Toolbar', category: 'View', run: () => ctx.update({ toolbarVisible: !ctx.settings.toolbarVisible }) },
    { id: 'view.customizeToolbar', title: 'Customize Toolbar…', category: 'View', run: ctx.customizeToolbar },
    { id: 'view.scrollSync', title: 'Toggle Scroll Sync', category: 'View', run: () => ctx.update({ scrollSync: !ctx.settings.scrollSync }) },
    { id: 'view.slash', title: 'Toggle Slash Commands', category: 'View', run: () => ctx.update({ slashCommands: !ctx.settings.slashCommands }) },
    { id: 'view.zoomIn', title: 'Zoom In', category: 'View', keys: 'Mod+=', run: zoom(1.1) },
    { id: 'view.zoomOut', title: 'Zoom Out', category: 'View', keys: 'Mod+-', run: zoom(1 / 1.1) },
    { id: 'view.zoomReset', title: 'Reset Zoom', category: 'View', keys: 'Mod+0', run: zoom(null) },
    ...WIDTH_LABELS.map(([w, label]): Command => ({ id: `width.${w}`, title: `Text Width: ${label}`, category: 'Appearance', run: () => ctx.update({ textWidth: w }) })),
    ...FONT_LABELS.map(([f, label]): Command => ({ id: `font.${f}`, title: `Font: ${label}`, category: 'Appearance', run: () => ctx.update({ fontFamily: f }) })),
    ...BUILTIN_THEMES.map((t): Command => ({ id: `theme.${t.id}`, title: `Document Style: ${t.label}`, category: 'Appearance', run: () => ctx.update({ previewTheme: t.id }) })),
    ...COLOR_THEMES.map((t): Command => ({ id: `colortheme.${t.id}`, title: `Color Theme: ${t.label}`, category: 'Appearance', run: () => ctx.pickColorTheme(t) })),
    ...schemes.map(([s, label]): Command => ({ id: `scheme.${s}`, title: `Light or Dark: ${label}`, category: 'Appearance', run: () => ctx.update({ colorScheme: s }) })),
  ];
}
