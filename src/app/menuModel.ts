import type { CommandRegistry } from './commands';

/**
 * The application menus (File, Edit, View, …) as data. The in-window menu bar (Windows, Linux,
 * browser) and the native macOS menu are both built from this, and most entries are just command
 * ids, so a menu item is never a second implementation of a feature.
 */
export type MenuEntry =
  | { kind: 'command'; id: string; label?: string; checked?: () => boolean }
  | { kind: 'action'; label: string; run: () => unknown; checked?: () => boolean; enabled?: () => boolean; hint?: string }
  | { kind: 'submenu'; label: string; items: () => MenuEntry[]; enabled?: () => boolean }
  | { kind: 'separator' };

export interface TopMenu {
  label: string;
  items: () => MenuEntry[];
}

export const cmd = (id: string, opts: { label?: string; checked?: () => boolean } = {}): MenuEntry => ({ kind: 'command', id, ...opts });
export const act = (label: string, run: () => unknown, opts: { checked?: () => boolean; enabled?: () => boolean; hint?: string } = {}): MenuEntry => ({
  kind: 'action',
  label,
  run,
  ...opts,
});
export const sub = (label: string, items: () => MenuEntry[], enabled?: () => boolean): MenuEntry => ({ kind: 'submenu', label, items, enabled });
export const sep: MenuEntry = { kind: 'separator' };

const KEY_NAMES: Record<string, string> = {
  '\\': 'Backslash',
  '/': 'Slash',
  '=': 'Equal',
  '-': 'Minus',
  '`': 'Backquote',
  '.': 'Period',
  ',': 'Comma',
  ';': 'Semicolon',
  "'": 'Quote',
  '[': 'BracketLeft',
  ']': 'BracketRight',
};

/** "Mod+Shift+P" → "CmdOrCtrl+Shift+P", the accelerator format of native menus. */
export function nativeAccelerator(keys: string): string {
  return keys
    .split('+')
    .map((part, i, all) => {
      if (i < all.length - 1) return part === 'Mod' ? 'CmdOrCtrl' : part;
      return KEY_NAMES[part] ?? (part.length === 1 ? part.toUpperCase() : part);
    })
    .join('+');
}

/** Commands that are the OS's own items in a native Edit menu (macOS needs these for the keys to work). */
export const NATIVE_EDIT_ITEMS: Record<string, 'Cut' | 'Copy' | 'Paste' | 'SelectAll'> = {
  'edit.cut': 'Cut',
  'edit.copy': 'Copy',
  'edit.paste': 'Paste',
  'edit.selectAll': 'SelectAll',
};

/** A menu entry with everything resolved for display. */
export type ResolvedEntry =
  | { kind: 'item'; label: string; hint?: string; enabled: boolean; checked?: boolean; run: () => void; keys?: string; id?: string }
  | { kind: 'submenu'; label: string; enabled: boolean; items: () => ResolvedEntry[] }
  | { kind: 'separator' };

export function resolveMenu(
  entries: MenuEntry[],
  registry: CommandRegistry,
  hint: (id: string) => string | undefined,
): ResolvedEntry[] {
  const out: ResolvedEntry[] = [];
  for (const e of entries) {
    if (e.kind === 'separator') {
      // No leading, trailing or doubled separators (entries can be conditional).
      if (out.length && out[out.length - 1].kind !== 'separator') out.push(e);
      continue;
    }
    if (e.kind === 'submenu') {
      out.push({ kind: 'submenu', label: e.label, enabled: e.enabled ? e.enabled() : true, items: () => resolveMenu(e.items(), registry, hint) });
      continue;
    }
    if (e.kind === 'action') {
      out.push({ kind: 'item', label: e.label, hint: e.hint, enabled: e.enabled ? e.enabled() : true, checked: e.checked?.(), run: () => void e.run() });
      continue;
    }
    const c = registry.get(e.id);
    if (!c) continue;
    out.push({
      kind: 'item',
      id: e.id,
      label: e.label ?? c.title,
      hint: hint(e.id),
      keys: c.keys,
      enabled: registry.isAvailable(c),
      checked: e.checked?.(),
      run: () => void registry.run(e.id),
    });
  }
  while (out.length && out[out.length - 1].kind === 'separator') out.pop();
  return out;
}
