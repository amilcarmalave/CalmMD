import { describe, expect, it } from 'vitest';
import { eventKey, formatBinding, matches, parseBinding, toCodeMirrorKey } from './keys';

const ev = (code: string, key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  code,
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('keys', () => {
  it('parses bindings', () => {
    expect(parseBinding('Mod+Shift+P')).toEqual({ mod: true, ctrl: false, shift: true, alt: false, key: 'p' });
    expect(parseBinding('Ctrl+Tab').key).toBe('tab');
    expect(parseBinding('Mod++').key).toBe('+');
    expect(() => parseBinding('Hyper+K')).toThrow();
  });

  it('uses physical keys for letters and digits (layout-independent, Alt-safe)', () => {
    expect(eventKey(ev('KeyB', '∫'))).toBe('b'); // macOS Option+B produces a symbol
    expect(eventKey(ev('Digit2', '@'))).toBe('2');
    expect(eventKey(ev('Backslash', '\\'))).toBe('\\');
  });

  it('maps Mod to Cmd on macOS and Ctrl elsewhere', () => {
    const b = parseBinding('Mod+Shift+P');
    expect(matches(b, ev('KeyP', 'P', { metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(matches(b, ev('KeyP', 'P', { ctrlKey: true, shiftKey: true }), true)).toBe(false);
    expect(matches(b, ev('KeyP', 'P', { ctrlKey: true, shiftKey: true }), false)).toBe(true);
    // Extra modifiers don't match.
    expect(matches(b, ev('KeyP', 'P', { ctrlKey: true, shiftKey: true, altKey: true }), false)).toBe(false);
  });

  it('formats for display', () => {
    expect(formatBinding('Mod+Shift+P', true)).toBe('⇧⌘P');
    expect(formatBinding('Mod+Shift+P', false)).toBe('Ctrl+Shift+P');
    expect(formatBinding('Mod+Alt+2', false)).toBe('Ctrl+Alt+2');
    expect(formatBinding('F2', false)).toBe('F2');
  });

  it('converts to CodeMirror syntax', () => {
    expect(toCodeMirrorKey('Mod+Shift+K')).toBe('Mod-Shift-k');
    expect(toCodeMirrorKey('Mod+B')).toBe('Mod-b');
  });
});
