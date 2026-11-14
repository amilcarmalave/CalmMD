import { basename, joinPath, stem } from '../core/paths';
import type { BaseTheme } from '../export/build';
import type { Platform } from '../platform/types';

/**
 * User themes: plain .css files in the themes folder. A comment header can name the theme and pick
 * the built-in style it builds on:
 *
 *   /* @name Sepia
 *      @base paper *\/
 *
 * The CSS is injected after the built-in styles (preview, live mode and exports), so it can override
 * variables or add rules for `.md-body`.
 */
export interface UserTheme {
  /** "user:<file name>", as stored in settings.previewTheme. */
  id: string;
  name: string;
  base: BaseTheme;
  css: string;
  path: string;
}

/** Built-in document styles. The ids are stable (stored in settings and theme headers). */
export const BUILTIN_THEMES: { id: BaseTheme; label: string; hint: string }[] = [
  { id: 'paper', label: 'Book', hint: 'Serif, book-like' },
  { id: 'studio', label: 'Studio', hint: 'Sans, compact' },
  { id: 'clear', label: 'Clear', hint: 'Sans, airy' },
  { id: 'github', label: 'GitHub', hint: 'README style' },
  { id: 'typewriter', label: 'Typewriter', hint: 'Monospaced' },
];

export const isBuiltinTheme = (id: string): id is BaseTheme => BUILTIN_THEMES.some((t) => t.id === id);

export function parseThemeHeader(css: string, fileName: string): { name: string; base: BaseTheme } {
  const head = /\/\*([\s\S]*?)\*\//.exec(css)?.[1] ?? '';
  const name = /@name\s+([^\n*]+)/.exec(head)?.[1].trim() || stem(fileName);
  const baseRaw = /@base\s+(\w+)/.exec(head)?.[1].toLowerCase() ?? 'paper';
  return { name, base: isBuiltinTheme(baseRaw) ? baseRaw : 'paper' };
}

export async function loadUserThemes(platform: Platform): Promise<{ dir: string; themes: UserTheme[] }> {
  const dir = await platform.themesDir();
  const entries = await platform.listDir(dir).catch(() => []);
  const themes: UserTheme[] = [];
  for (const e of entries) {
    if (e.isDir || !/\.css$/i.test(e.name)) continue;
    try {
      const { text } = await platform.readTextFile(joinPath(dir, e.name));
      const { name, base } = parseThemeHeader(text, e.name);
      themes.push({ id: `user:${basename(e.name)}`, name, base, css: text, path: e.path });
    } catch {
      // Unreadable theme files are skipped.
    }
  }
  return { dir, themes: themes.sort((a, b) => a.name.localeCompare(b.name)) };
}
