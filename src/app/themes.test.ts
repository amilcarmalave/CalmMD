import { describe, expect, it } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { loadUserThemes, parseThemeHeader } from './themes';

describe('user themes', () => {
  it('reads name and base from the header comment', () => {
    expect(parseThemeHeader('/*\n @name  Night Owl \n @base studio\n*/ .md-body{}', 'owl.css')).toEqual({ name: 'Night Owl', base: 'studio' });
    expect(parseThemeHeader('.md-body{}', 'My Theme.css')).toEqual({ name: 'My Theme', base: 'paper' });
    expect(parseThemeHeader('/* @base nope */', 'x.css').base).toBe('paper');
  });

  it('loads .css files from the themes folder, seeding an example', async () => {
    const platform = createMemoryPlatform();
    const { dir, themes } = await loadUserThemes(platform);
    expect(dir).toBe('/appdata/themes');
    expect(themes.map((t) => [t.id, t.name, t.base])).toEqual([['user:Sepia.css', 'Sepia', 'paper']]);
    await platform.writeTextFile(dir + '/notes.txt', 'ignored');
    await platform.writeTextFile(dir + '/Mono.css', '/* @base typewriter */');
    const again = await loadUserThemes(platform);
    expect(again.themes.map((t) => t.name)).toEqual(['Mono', 'Sepia']);
  });
});
