import { syntaxTree } from '@codemirror/language';
import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { SyntaxNode } from '@lezer/common';
import type { Platform } from '../platform/types';
import type { MenuItem } from '../ui/ContextMenu';
import type { CommandRegistry } from './commands';
import { resolveLocalPath } from './links';
import { IMAGE_SIZE_PRESETS, parseAltSize, withAltSize } from '../core/imageSize';

export interface EditorMenuDeps {
  registry: CommandRegistry;
  platform: Platform;
  docPath: string | null;
  openLink: (href: string) => void;
  openPalette: (query: string) => void;
  notify: (msg: string) => void;
  hint: (commandId: string) => string | undefined;
  /** Shows where to find spelling suggestions (the native menu). */
  spellcheck?: boolean;
  /** Picks an image file and puts its link in place of the destination at [from, to). */
  replaceImage?: (from: number, to: number) => void;
}

export type MenuContext = 'link' | 'image' | 'code' | 'table' | 'text';

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
    const setSize = (w: number | null) => {
      if (marks.length < 2) return;
      view.dispatch({ changes: { from: marks[0].to, to: marks[1].from, insert: withAltSize(altText(), w) }, userEvent: 'input.resize' });
      view.focus();
    };
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
  } else {
    specific.push(cmd('format.bold'), cmd('format.italic'), cmd('format.link'), {
      label: 'Format…',
      action: () => deps.openPalette('>Format: '),
    }, {
      label: 'Insert…',
      action: () => deps.openPalette('>Insert: '),
    });
  }

  const spelling: MenuItem[] =
    deps.spellcheck && kind === 'text'
      ? ['separator', { label: 'Spelling suggestions', hint: 'Shift+Right-click', disabled: true, action: () => {} }]
      : [];
  return [...specific, 'separator', ...clipboard, 'separator', cmd('edit.selectAll'), ...spelling];
}
