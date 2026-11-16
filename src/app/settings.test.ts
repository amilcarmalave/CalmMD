import { describe, expect, it } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { createSettings, DEFAULT_SETTINGS, parseSettings } from './settings';

describe('settings', () => {
  it('falls back to defaults for missing or corrupt data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores invalid values but keeps valid ones', () => {
    const s = parseSettings(JSON.stringify({ v: 2, viewMode: 'bogus', splitRatio: 5, scrollSync: false, previewTheme: 'studio' }));
    expect(s).toEqual({ ...DEFAULT_SETTINGS, scrollSync: false, previewTheme: 'studio' });
  });

  it('validates toolbar items and font scale', () => {
    const s = parseSettings(JSON.stringify({ v: 2, toolbarItems: ['a', 'a', 3, '|', 'b', '|', 'c'], fontScale: 9 }));
    expect(s.toolbarItems).toEqual(['a', '|', 'b', '|', 'c']);
    expect(s.fontScale).toBe(1);
  });

  it('validates colour themes by kind', () => {
    const s = parseSettings(JSON.stringify({ v: 2, lightTheme: 'github-light', darkTheme: 'snow' }));
    expect(s.lightTheme).toBe('github-light');
    expect(s.darkTheme).toBe('ink');
  });

  it('moves settings from before version 2 to the new defaults once', () => {
    const old = parseSettings(JSON.stringify({ viewMode: 'live', toolbarVisible: false, scrollSync: false }));
    expect(old).toMatchObject({ v: 3, viewMode: 'live', toolbarVisible: true, scrollSync: false });
    const current = parseSettings(JSON.stringify({ v: 2, viewMode: 'live', toolbarVisible: false }));
    expect(current).toMatchObject({ viewMode: 'live', toolbarVisible: false });
  });

  it('adds the text colour button to version 2 toolbars', () => {
    const s = parseSettings(JSON.stringify({ v: 2, toolbarItems: ['format.bold', 'format.highlight', 'format.code'] }));
    expect(s.toolbarItems).toEqual(['format.bold', 'format.highlight', 'format.textColor', 'format.code']);
    expect(parseSettings(JSON.stringify({ v: 3, toolbarItems: ['format.highlight'] })).toolbarItems).toEqual(['format.highlight']);
  });

  it('reports a layout upgrade only for settings from before version 2', async () => {
    const p = createMemoryPlatform();
    await p.kvSet('settings', JSON.stringify({ v: 2 }));
    expect(await createSettings(p).load()).toBe(false);
  });

  it('reports an upgrade from older settings on load', async () => {
    const platform = createMemoryPlatform();
    await platform.kvSet('settings', JSON.stringify({ viewMode: 'live' }));
    expect(await createSettings(platform).load()).toBe(true);
    const fresh = createMemoryPlatform();
    expect(await createSettings(fresh).load()).toBe(false);
  });

  it('persists and reloads', async () => {
    const platform = createMemoryPlatform();
    const a = createSettings(platform);
    a.update({ viewMode: 'preview', splitRatio: 0.6 });
    await a.flush();
    const b = createSettings(platform);
    await b.load();
    expect(b.settings.viewMode).toBe('preview');
    expect(b.settings.splitRatio).toBe(0.6);
  });
});
