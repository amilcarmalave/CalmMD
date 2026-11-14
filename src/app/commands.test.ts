import { describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from './commands';

const key = (code: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ code, key: code.replace('Key', '').toLowerCase(), ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault: vi.fn(), ...mods }) as unknown as KeyboardEvent;

describe('CommandRegistry', () => {
  it('runs global shortcuts and respects `when`', () => {
    const r = new CommandRegistry();
    const a = vi.fn();
    let enabled = false;
    r.register([
      { id: 'a', title: 'A', category: 'T', keys: 'Mod+Shift+P', run: a },
      { id: 'b', title: 'B', category: 'T', keys: 'Mod+B', scope: 'editor', run: vi.fn() },
      { id: 'c', title: 'C', category: 'T', keys: 'Mod+K', when: () => enabled, run: vi.fn() },
    ]);
    expect(r.handleKey(key('KeyP', { ctrlKey: true, shiftKey: true }), false)).toBe(true);
    expect(a).toHaveBeenCalledOnce();
    // Editor-scoped commands are not handled at window level.
    expect(r.handleKey(key('KeyB', { ctrlKey: true }), false)).toBe(false);
    expect(r.handleKey(key('KeyK', { ctrlKey: true }), false)).toBe(false);
    enabled = true;
    expect(r.handleKey(key('KeyK', { ctrlKey: true }), false)).toBe(true);
  });

  it('lists recently used commands first in the palette', () => {
    const r = new CommandRegistry();
    r.register(['x', 'y', 'z'].map((id) => ({ id, title: id, category: 'T', run: () => {} })));
    r.run('z');
    r.run('y');
    expect(r.forPalette().map((c) => c.id)).toEqual(['y', 'z', 'x']);
  });

  it('rejects duplicate ids and invalid shortcuts', () => {
    const r = new CommandRegistry();
    r.register([{ id: 'a', title: 'A', category: 'T', run: () => {} }]);
    expect(() => r.register([{ id: 'a', title: 'A', category: 'T', run: () => {} }])).toThrow();
    expect(() => r.register([{ id: 'q', title: 'Q', category: 'T', keys: 'Super+Q', run: () => {} }])).toThrow();
  });
});
