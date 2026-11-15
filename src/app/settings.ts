import { createStore, unwrap } from 'solid-js/store';
import type { Platform } from '../platform/types';
import type { ImageFolderMode } from '../core/assets';
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../editor/colors';
import { isColorTheme, type ColorThemeId } from './colorThemes';

export type ViewMode = 'source' | 'live' | 'split' | 'preview';
/** Built-in document styles (typography). */
export const DOC_STYLES = ['paper', 'studio', 'typewriter', 'github', 'clear'] as const;
export type DocStyle = (typeof DOC_STYLES)[number];
/** A built-in document style, or "user:<file>.css" from the themes folder. */
export type PreviewTheme = DocStyle | `user:${string}`;
export type ColorScheme = 'system' | 'light' | 'dark';
/** Reading font: the document style's own, or one of these for every style. */
/** How wide the text column is (the side margins follow). */
export const TEXT_WIDTHS = ['narrow', 'standard', 'wide', 'full'] as const;
export type TextWidth = (typeof TEXT_WIDTHS)[number];
/** Multiplier on the document style's own measure. Full is clamped by the minimum margins. */
export const TEXT_WIDTH_SCALE: Record<TextWidth, number> = { narrow: 0.85, standard: 1, wide: 1.3, full: 100 };

export const FONT_CHOICES = ['style', 'sans', 'serif', 'mono', 'system'] as const;
export type FontChoice = (typeof FONT_CHOICES)[number];

/** Bumped when defaults change in a way existing users should get once (see parseSettings). */
export const SETTINGS_VERSION = 3;
/** The last version whose upgrade also resets the window layout (see App). */
export const LAYOUT_VERSION = 2;

export interface Settings {
  v: number;
  viewMode: ViewMode;
  /** Editor share of the width in split view, between 0.2 and 0.8. */
  splitRatio: number;
  scrollSync: boolean;
  /** Document style (typography), named previewTheme for compatibility. */
  previewTheme: PreviewTheme;
  colorScheme: ColorScheme;
  /** Colour themes used for light and dark ("Match system" switches between them). */
  lightTheme: ColorThemeId;
  darkTheme: ColorThemeId;
  /** The formatting toolbar. "|" entries are group separators. */
  toolbarVisible: boolean;
  toolbarItems: string[];
  /** Last colours used from the toolbar (palette ids; highlight "default" is ==text==). */
  highlightColor: string;
  textColor: string;
  /** "/" at the start of an empty line opens the block menu. */
  slashCommands: boolean;
  /** Text zoom for the editor and preview (Mod+= / Mod+-). */
  fontScale: number;
  fontFamily: FontChoice;
  textWidth: TextWidth;
  /** The file list shows every file (notes first-class, others dimmed), or notes only. */
  showAllFiles: boolean;
  /** File history: save a version when a changed file closes. Off = only Save Version. */
  historyOnClose: boolean;
  /** Where pasted and dropped images are saved (links are always relative). */
  imageFolder: ImageFolderMode;
  spellcheck: boolean;
  /** "auto" (the system's languages) or a BCP 47 tag such as "en-GB". */
  spellLang: string;
}

/** Languages offered for spellcheck. The OS must have the dictionary installed. */
export const SPELL_LANGUAGES: [string, string][] = [
  ['auto', 'Automatic (system languages)'],
  ['en-US', 'English (US)'],
  ['en-GB', 'English (UK)'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['it', 'Italian'],
  ['pt-BR', 'Portuguese (Brazil)'],
  ['pt-PT', 'Portuguese (Portugal)'],
  ['nl', 'Dutch'],
  ['sv', 'Swedish'],
  ['pl', 'Polish'],
  ['ru', 'Russian'],
  ['tr', 'Turkish'],
];

export const TOOLBAR_MAX = 40;
export const TOOLBAR_SEPARATOR = '|';
export const DEFAULT_TOOLBAR = [
  'edit.undo',
  'edit.redo',
  '|',
  'format.headingMenu',
  '|',
  'format.bold',
  'format.italic',
  'format.strike',
  'format.highlight',
  'format.textColor',
  'format.code',
  '|',
  'format.bulletList',
  'format.orderedList',
  'format.taskList',
  'format.quote',
  '|',
  'format.link',
  'insert.image',
  'insert.table',
  'insert.codeBlock',
  'insert.math',
  'insert.mermaid',
  'insert.hr',
  '|',
  'edit.find',
];

export const DEFAULT_SETTINGS: Settings = {
  v: SETTINGS_VERSION,
  // Split shows both the source and the result, which is the clearest first view.
  viewMode: 'split',
  splitRatio: 0.5,
  scrollSync: true,
  previewTheme: 'paper',
  colorScheme: 'system',
  lightTheme: 'snow',
  darkTheme: 'ink',
  toolbarVisible: true,
  toolbarItems: DEFAULT_TOOLBAR,
  highlightColor: 'default',
  textColor: 'red',
  slashCommands: true,
  fontScale: 1,
  fontFamily: 'style',
  textWidth: 'standard',
  imageFolder: 'document',
  showAllFiles: true,
  historyOnClose: true,
  spellcheck: true,
  spellLang: 'auto',
};

/** View modes in cycle order (Mod+E) and in the status bar control. */
export const VIEW_MODES: ViewMode[] = ['source', 'live', 'split', 'preview'];

const KEY = 'settings';

/** Merges stored settings over the defaults, ignoring unknown or invalid values. */
export function parseSettings(raw: string | null): Settings {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw) return out;
  try {
    const s = JSON.parse(raw) as Partial<Settings>;
    if (s.viewMode && (VIEW_MODES as string[]).includes(s.viewMode)) out.viewMode = s.viewMode;
    if (typeof s.splitRatio === 'number' && s.splitRatio >= 0.2 && s.splitRatio <= 0.8) out.splitRatio = s.splitRatio;
    if (typeof s.scrollSync === 'boolean') out.scrollSync = s.scrollSync;
    if (
      typeof s.previewTheme === 'string' &&
      ((DOC_STYLES as readonly string[]).includes(s.previewTheme) || /^user:[^/\\]+\.css$/i.test(s.previewTheme))
    )
      out.previewTheme = s.previewTheme;
    if (s.colorScheme && ['system', 'light', 'dark'].includes(s.colorScheme)) out.colorScheme = s.colorScheme;
    if (isColorTheme(s.lightTheme, 'light')) out.lightTheme = s.lightTheme;
    if (isColorTheme(s.darkTheme, 'dark')) out.darkTheme = s.darkTheme;
    if (typeof s.toolbarVisible === 'boolean') out.toolbarVisible = s.toolbarVisible;
    if (Array.isArray(s.toolbarItems)) {
      const items = s.toolbarItems.filter((x): x is string => typeof x === 'string');
      // Separators may repeat; commands may not.
      const seen = new Set<string>();
      out.toolbarItems = items.filter((x) => x === TOOLBAR_SEPARATOR || (!seen.has(x) && seen.add(x))).slice(0, TOOLBAR_MAX);
    }
    // Version 2 changed the defaults (split view, visible full toolbar). Older settings were
    // mostly the old defaults written back, not choices, so they move to the new ones once.
    if (typeof s.v !== 'number' || s.v < 2) {
      out.viewMode = DEFAULT_SETTINGS.viewMode;
      out.toolbarVisible = true;
      out.toolbarItems = DEFAULT_TOOLBAR;
    }
    // Version 3 added the text colour button next to Highlight.
    if (typeof s.v === 'number' && s.v === 2 && !out.toolbarItems.includes('format.textColor')) {
      const i = out.toolbarItems.indexOf('format.highlight');
      if (i !== -1) out.toolbarItems = [...out.toolbarItems.slice(0, i + 1), 'format.textColor', ...out.toolbarItems.slice(i + 1)];
    }
    out.v = SETTINGS_VERSION;
    const custom = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
    if (s.highlightColor === 'default' || HIGHLIGHT_COLORS.some((c) => c.id === s.highlightColor) || custom(s.highlightColor)) out.highlightColor = s.highlightColor!;
    if (TEXT_COLORS.some((c) => c.id === s.textColor) || custom(s.textColor)) out.textColor = s.textColor!;
    if (typeof s.slashCommands === 'boolean') out.slashCommands = s.slashCommands;
    if (typeof s.fontScale === 'number' && s.fontScale >= 0.7 && s.fontScale <= 1.8) out.fontScale = s.fontScale;
    if (s.imageFolder === 'document' || s.imageFolder === 'root') out.imageFolder = s.imageFolder;
    if (typeof s.showAllFiles === 'boolean') out.showAllFiles = s.showAllFiles;
    if (typeof s.historyOnClose === 'boolean') out.historyOnClose = s.historyOnClose;
    if ((FONT_CHOICES as readonly string[]).includes(s.fontFamily as string)) out.fontFamily = s.fontFamily!;
    if ((TEXT_WIDTHS as readonly string[]).includes(s.textWidth as string)) out.textWidth = s.textWidth!;
    if (typeof s.spellcheck === 'boolean') out.spellcheck = s.spellcheck;
    if (typeof s.spellLang === 'string' && /^(auto|[a-z]{2,3}(-[A-Z]{2})?)$/.test(s.spellLang)) out.spellLang = s.spellLang;
  } catch {
    // Corrupt settings fall back to defaults.
  }
  return out;
}

const safeVersion = (raw: string) => {
  try {
    return (JSON.parse(raw) as { v?: number }).v;
  } catch {
    return undefined;
  }
};

export function createSettings(platform: Platform) {
  const [settings, setSettings] = createStore<Settings>({ ...DEFAULT_SETTINGS });
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Settings are shared by all windows: after saving, tell the others to reload.
  const persist = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      await platform.kvSet(KEY, JSON.stringify(unwrap(settings)));
      platform.broadcast('settings');
    }, 300);
  };
  platform.onBroadcast('settings', async () => {
    setSettings(parseSettings(await platform.kvGet(KEY)));
  });

  return {
    settings,
    /** Loads settings. Resolves to true when they came from an older version (defaults changed). */
    async load(): Promise<boolean> {
      const raw = await platform.kvGet(KEY);
      setSettings(parseSettings(raw));
      let upgraded = false;
      try {
        upgraded = !!raw && !((JSON.parse(raw) as { v?: number }).v! >= LAYOUT_VERSION);
      } catch {
        // corrupt settings: treated as fresh
      }
      if (raw && parseSettings(raw).v !== (safeVersion(raw))) persist();
      return upgraded;
    },
    update(patch: Partial<Settings>) {
      setSettings(patch);
      persist();
    },
    async flush() {
      clearTimeout(timer);
      await platform.kvSet(KEY, JSON.stringify(unwrap(settings)));
    },
  };
}
