import { createDemoPlatform } from './demo';
import { createMemoryPlatform } from './memory';
import { createTauriPlatform } from './tauri';
import type { Platform } from './types';
import welcome from '../assets/welcome.md?raw';

export type { Platform } from './types';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function getPlatform(): Platform {
  if (isTauri()) return createTauriPlatform();

  // Browser dev mode: a localStorage-backed sandbox with a sample document.
  // Browser dev simulates windows as tabs: ?window=<label>&space=<id>.
  const params = new URLSearchParams(location.search);
  if (params.has('demo')) return createDemoPlatform(params);
  return createMemoryPlatform({
    kind: 'web',
    windowLabel: params.get('window') ?? 'main',
    spaceId: params.get('space'),
    storage: window.localStorage,
    files: {
      '/sandbox/Welcome.md': welcome,
      '/sandbox/notes/Ideas.md': '# Ideas\n\n## Small\n\n- Calm defaults\n\n## Large\n\n### Spaces\n\nBundles of folders.\n',
      '/sandbox/notes/Chapter 2.md': '# Chapter 2\n',
      '/sandbox/notes/Chapter 10.md': '# Chapter 10\n',
      '/sandbox/journal/2026-11-12.md': '# Thursday\n',
    },
    async pickFolder() {
      return window.prompt('Open folder (browser sandbox path)', '/sandbox');
    },
    async pickOpen() {
      const path = window.prompt('Open file (browser sandbox path)', '/sandbox/Welcome.md');
      return path ? [path] : [];
    },
    async pickSave(suggested) {
      return window.prompt('Save as (browser sandbox path)', '/sandbox/' + suggested);
    },
  });
}
