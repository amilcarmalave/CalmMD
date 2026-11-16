import { startCompletion } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState } from '@codemirror/state';
import { htmlToMarkdown, worthConverting } from '../editor/richPaste';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import type { Platform } from '../platform/types';
import type { MenuItem } from '../ui/ContextMenu';
import type { CommandRegistry } from './commands';
import { resolveLocalPath } from './links';
import { isDrawingPath } from '../core/drawings';
import { IMAGE_SIZE_PRESETS, parseAltSize, withAltOptions, type ImageAlign } from '../core/imageSize';

export interface EditorMenuDeps {
  registry: CommandRegistry;
  platform: Platform;
  docPath: string | null;
  openLink: (href: string) => void;
  openPalette: (query: string) => void;
  notify: (msg: string) => void;
  hint: (commandId: string) => string | undefined;
  /** Spellcheck is on. */
  spellcheck?: boolean;
  /**
   * Suggestions for the word under the pointer (from the OS spellchecker), shown first. Undefined: this
   * system has no checker we can ask, so the menu points to the native one (Shift+right-click).
   */
  spelling?: MenuItem[];
  /** Opens a drawing file in the drawing editor. */
  editDrawing?: (path: string) => void;
  /** Picks an image file and puts its link in place of the destination at [from, to). */
  replaceImage?: (from: number, to: number) => void;
}

export type MenuContext = 'link' | 'image' | 'code' | 'table' | 'text';

/** Whether pos is inside code (a code block or inline code), where pasted text stays as it is. */
export function inCode(state: EditorState, pos: number): boolean {
  for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1); n; n = n.parent)
    if (n.name === 'FencedCode' || n.name === 'CodeBlock' || n.name === 'InlineCode') return true;
  return false;
}

/** The clipboard as Markdown: formatted text (HTML) converted, otherwise the plain text. */
async function clipboardMarkdown(platform: Platform): Promise<string> {
  try {
    for (const item of await navigator.clipboard.read()) {
      if (!item.types.includes('text/html')) continue;
      const html = await (await item.getType('text/html')).text();
      if (worthConverting(html)) return htmlToMarkdown(html);
    }
  } catch {
    // No access to formatted clipboard data here: fall back to the text.
  }
  return platform.readClipboard().catch(() => '');
}

/** The innermost interesting syntax node around a position. */
export function contextAt(view: EditorView, pos: number): { kind: MenuContext; node: SyntaxNode | null } {
  const tree = syntaxTree(view.state);
  for (const side of [1, -1] as const) {
    for (let n: SyntaxNode | null = tree.resolveInner(pos, side); n; n = n.parent) {
      if (n.name === 'Image') return { kind: 'image', node: n };
      if (n.name === 'Link' || n.name === 'Autolink') return { kind: 'link', node: n };
      if (n.name === 'URL' && n.parent?.name !== 'Image') return { kind: 'link', node: n };
      if (n.name === 'FencedCode' || n.name === 'CodeBlock') return { kind: 'code', node: n };
      if (n.name === 'Table') return { kind: 'table', node: n };
    }
  }
  return { kind: 'text', node: null };
}

/** Builds the right-click menu for a position in the editor, adapted to what's there. */
export function editorMenuItems(view: EditorView, pos: number, deps: EditorMenuDeps): MenuItem[] {
  const state = view.state;
  const sel = state.selection.main;
  const slice = (n: SyntaxNode | null) => (n ? state.sliceDoc(n.from, n.to) : '');
  const cmd = (id: string, label?: string): Exclude<MenuItem, 'separator'> => {
    const c = deps.registry.get(id)!;
    return { label: label ?? c.title, hint: deps.hint(id), action: () => deps.registry.run(id) };
  };
  const select = (from: number, to: number) => {
    view.dispatch({ selection: EditorSelection.range(from, to), scrollIntoView: true });
    view.focus();
  };
  const copy = async (text: string, msg = 'Copied') => {
    await deps.platform.writeClipboard(text);
    deps.notify(msg);
  };

  const clipboard: MenuItem[] = [
    {
      label: 'Cut',
      hint: deps.platform.isMac ? '⌘X' : 'Ctrl+X',
      disabled: sel.empty,
      action: async () => {
        const text = state.sliceDoc(sel.from, sel.to);
        await deps.platform.writeClipboard(text);
        view.dispatch({ changes: { from: sel.from, to: sel.to }, userEvent: 'delete.cut' });
        view.focus();
      },
    },
    {
      label: 'Copy',
      hint: deps.platform.isMac ? '⌘C' : 'Ctrl+C',
      disabled: sel.empty,
      action: () => copy(state.sliceDoc(sel.from, sel.to), 'Copied'),
    },
    {
      label: 'Paste',
      hint: deps.platform.isMac ? '⌘V' : 'Ctrl+V',
      action: async () => {
        const text = inCode(view.state, view.state.selection.main.head)
          ? await deps.platform.readClipboard().catch(() => '')
          : await clipboardMarkdown(deps.platform);
        if (text) view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true });
        view.focus();
      },
    },
    {
      label: 'Paste as Plain Text',
      hint: deps.platform.isMac ? '⇧⌘V' : 'Ctrl+Shift+V',
      action: async () => {
        const text = await deps.platform.readClipboard().catch(() => '');
        if (text) view.dispatch(view.state.replaceSelection(text), { userEvent: 'input.paste', scrollIntoView: true });
        view.focus();
      },
    },
  ];

  const { kind, node } = contextAt(view, pos);
  const specific: MenuItem[] = [];

  if (kind === 'link' && node) {
    const url = node.name === 'URL' ? node : node.getChild('URL');
    const href = slice(url);
    specific.push(
      { label: 'Open Link', hint: deps.platform.isMac ? '⌘Click' : 'Ctrl+Click', disabled: !href, action: () => deps.openLink(href) },
      { label: 'Copy Link Address', disabled: !href, action: () => copy(href, 'Link copied') },
    );
    if (node.name === 'Link' && url) {
      const marks = node.getChildren('LinkMark');
      specific.push(
        { label: 'Edit Link Address', action: () => select(url.from, url.to) },
        {
          label: 'Remove Link',
          action: () => {
            const text = marks.length >= 2 ? state.sliceDoc(marks[0].to, marks[1].from) : href;
            view.dispatch({ changes: { from: node.from, to: node.to, insert: text }, userEvent: 'input.format' });
            view.focus();
          },
        },
      );
    }
  } else if (kind === 'image' && node) {
    const url = node.getChild('URL');
    const src = slice(url);
    const marks = node.getChildren('LinkMark');
    const local = resolveLocalPath(src, deps.docPath);
    const altText = () => (marks.length >= 2 ? view.state.sliceDoc(marks[0].to, marks[1].from) : '');
    const setAlt = (opts: { width?: number | null; align?: ImageAlign | null }) => {
      if (marks.length < 2) return;
      view.dispatch({ changes: { from: marks[0].to, to: marks[1].from, insert: withAltOptions(altText(), opts) }, userEvent: 'input.resize' });
      view.focus();
    };
    const setSize = (width: number | null) => setAlt({ width });
    const align = () => parseAltSize(altText()).align ?? 'left';
    if (local && isDrawingPath(local) && deps.editDrawing) specific.push({ label: 'Edit Drawing', hint: 'Double-click', action: () => deps.editDrawing!(local) }, 'separator');
    specific.push(
      { label: 'Edit Alt Text', disabled: marks.length < 2, action: () => select(marks[0].to, marks[1].from) },
      { label: 'Replace Image…', disabled: !url || !deps.replaceImage, action: () => url && deps.replaceImage?.(url.from, url.to) },
      'separator',
      { heading: 'Size' },
      ...IMAGE_SIZE_PRESETS.map((p) => ({
        label: `${p.label} (${p.width} px)`,
        checked: parseAltSize(altText()).width === p.width,
        disabled: marks.length < 2,
        action: () => setSize(p.width),
      })),
      { label: 'Original Size', checked: !parseAltSize(altText()).width, disabled: marks.length < 2, action: () => setSize(null) },
      'separator',
      { heading: 'Align' },
      ...(['left', 'center', 'right'] as const).map((a) => ({
        label: a === 'left' ? 'Left' : a === 'center' ? 'Center' : 'Right',
        checked: align() === a,
        disabled: marks.length < 2,
        action: () => setAlt({ align: a === 'left' ? null : a }),
      })),
      'separator',
      { label: 'Edit Image Path', disabled: !url, action: () => url && select(url.from, url.to) },
      { label: 'Copy Image Path', disabled: !src, action: () => copy(local ?? src, 'Path copied') },
      local
        ? { label: deps.platform.isMac ? 'Reveal Image in Finder' : 'Show Image in Folder', action: () => deps.platform.revealPath(local) }
        : { label: 'Open Image in Browser', disabled: !/^https?:/.test(src), action: () => deps.openLink(src) },
    );
  } else if (kind === 'code' && node) {
    const text = node.getChild('CodeText');
    const info = node.getChild('CodeInfo');
    specific.push(
      { label: 'Copy Code', action: () => copy(slice(text), 'Code copied') },
      { label: 'Select Code', disabled: !text, action: () => text && select(text.from, text.to) },
    );
    if (node.name === 'FencedCode') {
      const fence = node.getChild('CodeMark');
      specific.push({
        label: 'Change Language…',
        action: () => {
          if (info) select(info.from, info.to);
          else if (fence) {
            view.dispatch({ selection: { anchor: fence.to } });
            view.focus();
          }
        },
      });
    }
  } else if (kind === 'table') {
    specific.push(
      cmd('table.rowAbove'),
      cmd('table.rowBelow'),
      cmd('table.colLeft'),
      cmd('table.colRight'),
      'separator',
      cmd('table.align-left', 'Align Left'),
      cmd('table.align-center', 'Align Center'),
      cmd('table.align-right', 'Align Right'),
      cmd('table.format'),
      'separator',
      { ...cmd('table.deleteRow'), danger: true },
      { ...cmd('table.deleteCol'), danger: true },
    );
  }

  // The same three sections everywhere text can be written (like Obsidian): links; Format, Paragraph
  // and Insert as submenus; then the clipboard.
  const writing = kind !== 'code' && kind !== 'table';
  const maybe = (id: string, label?: string): MenuItem[] => (deps.registry.get(id) ? [cmd(id, label)] : []);
  const links: MenuItem[] = writing
    ? [
        {
          label: 'Add Link…',
          hint: '[[',
          action: () => {
            // Opens the note picker; selected text becomes what it searches for.
            const s = view.state.selection.main;
            const text = view.state.sliceDoc(s.from, s.to).replace(/[[\]\n]/g, ' ');
            view.dispatch({ changes: { from: s.from, to: s.to, insert: '[[' + text }, selection: { anchor: s.from + 2 + text.length }, userEvent: 'input' });
            view.focus();
            startCompletion(view);
          },
        },
        cmd('format.link', 'Add External Link'),
      ]
    : [];
  const sections: MenuItem[] = writing
    ? [
        {
          label: 'Format',
          submenu: () => [
            cmd('format.bold'),
            cmd('format.italic'),
            cmd('format.strike'),
            cmd('format.highlight'),
            cmd('format.code'),
            cmd('format.textColor'),
            'separator',
            cmd('format.clear'),
          ],
        },
        {
          label: 'Paragraph',
          submenu: () => [
            cmd('format.paragraph', 'Body Text'),
            cmd('format.heading1'),
            cmd('format.heading2'),
            cmd('format.heading3'),
            'separator',
            cmd('format.bulletList'),
            cmd('format.orderedList'),
            cmd('format.taskList', 'Task List'),
            cmd('format.quote'),
            cmd('insert.codeBlock'),
          ],
        },
        {
          label: 'Insert',
          submenu: () => [
            ...maybe('insert.imageFile'),
            cmd('insert.table'),
            ...maybe('insert.drawing'),
            cmd('insert.footnote'),
            'separator',
            cmd('insert.math'),
            cmd('insert.mermaid'),
            cmd('insert.hr'),
          ],
        },
      ]
    : [];

  const nativeHint: MenuItem[] =
    deps.spellcheck && kind === 'text' && !deps.spelling
      ? ['separator', { label: 'Spelling suggestions', hint: 'Shift+Right-click', disabled: true, action: () => {} }]
      : [];
  const spelling = deps.spelling?.length ? [...deps.spelling, 'separator' as const] : [];
  const groups = [specific, links, sections, [...clipboard, cmd('edit.selectAll')]].filter((g) => g.length);
  return [...spelling, ...groups.flatMap((g, i) => (i ? ['separator' as const, ...g] : g)), ...nativeHint];
}

/** The word around a position (letters, marks, digits and inner apostrophes), or null. */
export function wordAt(text: string, pos: number): { from: number; to: number; word: string } | null {
  const isWord = (ch: string | undefined) => !!ch && /[\p{L}\p{M}\p{N}'’]/u.test(ch);
  let from = pos;
  let to = pos;
  while (from > 0 && isWord(text[from - 1])) from--;
  while (to < text.length && isWord(text[to])) to++;
  while (from < to && /['’]/.test(text[from])) from++;
  while (to > from && /['’]/.test(text[to - 1])) to--;
  const word = text.slice(from, to);
  return /\p{L}/u.test(word) ? { from, to, word } : null;
}

/** Menu items for a misspelled word: up to six suggestions, then Add to Dictionary. */
export function spellingItems(
  suggestions: string[],
  replace: (word: string) => void,
  learn: () => void,
): MenuItem[] {
  const items: MenuItem[] = suggestions.map((s) => ({ label: s, action: () => replace(s) }));
  if (!items.length) items.push({ label: 'No suggestions', disabled: true, action: () => {} });
  items.push({ label: 'Add to Dictionary', action: learn });
  return items;
}
