/**
 * Keyboard shortcuts written as "Mod+Shift+P", "Mod+Alt+2", "F2", "Ctrl+Tab". `Mod` is Cmd on
 * macOS and Ctrl elsewhere. `Ctrl` always means the Control key.
 */
export interface KeyBinding {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** Lowercased key name: "p", "2", "\\", "tab", "pagedown", "f2", "=". */
  key: string;
}

export function parseBinding(s: string): KeyBinding {
  const parts = s.split('+');
  // "Mod++" (plus key) splits into [..., '', '']
  let key = parts.pop()!;
  if (key === '' && parts[parts.length - 1] === '') {
    parts.pop();
    key = '+';
  }
  const b: KeyBinding = { mod: false, ctrl: false, shift: false, alt: false, key: key.toLowerCase() };
  for (const p of parts) {
    const m = p.toLowerCase();
    if (m === 'mod') b.mod = true;
    else if (m === 'ctrl') b.ctrl = true;
    else if (m === 'shift') b.shift = true;
    else if (m === 'alt' || m === 'option') b.alt = true;
    else throw new Error(`Unknown modifier "${p}" in "${s}"`);
  }
  return b;
}

/** The layout-independent key name for an event: letters and digits come from `code`. */
export function eventKey(e: Pick<KeyboardEvent, 'key' | 'code'>): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (e.code === 'Backslash') return '\\';
  if (e.code === 'Equal') return '=';
  if (e.code === 'Minus') return '-';
  if (e.code === 'Slash') return '/';
  if (e.code === 'Period') return '.';
  if (e.code === 'Comma') return ',';
  return e.key.toLowerCase();
}

export function matches(
  b: KeyBinding,
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>,
  isMac: boolean,
): boolean {
  const wantCtrl = b.ctrl || (b.mod && !isMac);
  const wantMeta = b.mod && isMac;
  return (
    e.ctrlKey === wantCtrl &&
    e.metaKey === wantMeta &&
    e.shiftKey === b.shift &&
    e.altKey === b.alt &&
    eventKey(e) === b.key
  );
}

const MAC_SYMBOLS: Record<string, string> = { mod: '⌘', ctrl: '⌃', shift: '⇧', alt: '⌥' };
const KEY_NAMES: Record<string, string> = {
  tab: 'Tab',
  pagedown: 'PgDn',
  pageup: 'PgUp',
  enter: 'Enter',
  escape: 'Esc',
  arrowup: '↑',
  arrowdown: '↓',
  '\\': '\\',
};

/** Human-readable shortcut: "⌘⇧P" on macOS, "Ctrl+Shift+P" elsewhere. */
export function formatBinding(s: string, isMac: boolean): string {
  const b = parseBinding(s);
  const key = KEY_NAMES[b.key] ?? (b.key.length === 1 ? b.key.toUpperCase() : b.key.toUpperCase());
  if (isMac) {
    return (b.ctrl ? MAC_SYMBOLS.ctrl : '') + (b.alt ? MAC_SYMBOLS.alt : '') + (b.shift ? MAC_SYMBOLS.shift : '') + (b.mod ? MAC_SYMBOLS.mod : '') + key;
  }
  return [b.ctrl || b.mod ? 'Ctrl' : '', b.shift ? 'Shift' : '', b.alt ? 'Alt' : '', key].filter(Boolean).join('+');
}

/** CodeMirror keymap syntax ("Mod-Shift-p"). */
export function toCodeMirrorKey(s: string): string {
  const b = parseBinding(s);
  const key = b.key.length === 1 ? b.key : b.key[0].toUpperCase() + b.key.slice(1);
  return [b.ctrl ? 'Ctrl' : '', b.mod ? 'Mod' : '', b.alt ? 'Alt' : '', b.shift ? 'Shift' : '', key].filter(Boolean).join('-');
}
