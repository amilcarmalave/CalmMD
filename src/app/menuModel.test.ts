import { describe, expect, it } from 'vitest';
import { CommandRegistry } from './commands';
import { act, cmd, nativeAccelerator, resolveMenu, sep, sub } from './menuModel';

describe('nativeAccelerator', () => {
  it('maps the registry key format to native accelerators', () => {
    expect(nativeAccelerator('Mod+Shift+P')).toBe('CmdOrCtrl+Shift+P');
    expect(nativeAccelerator('Mod+\\')).toBe('CmdOrCtrl+Backslash');
    expect(nativeAccelerator('Mod+=')).toBe('CmdOrCtrl+Equal');
    expect(nativeAccelerator('Mod+Alt+1')).toBe('CmdOrCtrl+Alt+1');
    expect(nativeAccelerator('Ctrl+PageDown')).toBe('Ctrl+PageDown');
    expect(nativeAccelerator('Mod+b')).toBe('CmdOrCtrl+B');
  });
});

describe('resolveMenu', () => {
  const registry = new CommandRegistry();
  let ran = '';
  registry.register([
    { id: 'a', title: 'Alpha', category: 'T', keys: 'Mod+A', run: () => (ran = 'a') },
    { id: 'b', title: 'Beta', category: 'T', when: () => false, run: () => (ran = 'b') },
  ]);
  const hint = (id: string) => (id === 'a' ? 'Ctrl+A' : undefined);

  it('resolves commands with their title, shortcut and availability', () => {
    const [a, b] = resolveMenu([cmd('a'), cmd('b', { label: 'Custom' })], registry, hint);
    expect(a).toMatchObject({ kind: 'item', label: 'Alpha', hint: 'Ctrl+A', enabled: true });
    expect(b).toMatchObject({ kind: 'item', label: 'Custom', enabled: false });
    if (a.kind === 'item') a.run();
    expect(ran).toBe('a');
  });

  it('drops unknown commands and tidies separators', () => {
    const items = resolveMenu([sep, cmd('a'), sep, sep, cmd('missing'), sep], registry, hint);
    expect(items.map((i) => i.kind)).toEqual(['item']);
  });

  it('resolves actions, checks and submenus lazily', () => {
    let built = 0;
    const [x, s] = resolveMenu(
      [
        act('X', () => {}, { checked: () => true }),
        sub('More', () => {
          built++;
          return [cmd('a')];
        }),
      ],
      registry,
      hint,
    );
    expect(x).toMatchObject({ label: 'X', checked: true, enabled: true });
    expect(built).toBe(0);
    if (s.kind === 'submenu') expect(s.items()).toHaveLength(1);
    expect(built).toBe(1);
  });
});
