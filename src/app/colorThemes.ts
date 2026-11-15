/**
 * Colour themes: the whole app (chrome, editor, preview). The colours live in styles/tokens.css,
 * keyed by `data-color-theme`. "Match system" uses the preferred light or dark theme.
 */
export type ColorThemeId =
  | 'snow'
  | 'paper'
  | 'github-light'
  | 'code-light'
  | 'solarized-light'
  | 'ink'
  | 'github-dark'
  | 'code-dark'
  | 'midnight'
  | 'solarized-dark'
  | 'rose'
  | 'parchment'
  | 'fjord'
  | 'nightshade'
  | 'forest';

export interface ColorTheme {
  id: ColorThemeId;
  label: string;
  kind: 'light' | 'dark';
  hint: string;
  /** Background, text and accent, for the swatch in menus. */
  swatch: [string, string, string];
}

export const COLOR_THEMES: ColorTheme[] = [
  { id: 'snow', label: 'Snow', kind: 'light', hint: 'Clean white', swatch: ['#ffffff', '#24272e', '#e8a23b'] },
  { id: 'paper', label: 'Paper', kind: 'light', hint: 'Warm off-white', swatch: ['#faf8f4', '#2a2d34', '#e8a23b'] },
  { id: 'github-light', label: 'GitHub Light', kind: 'light', hint: 'Familiar and crisp', swatch: ['#ffffff', '#1f2328', '#0969da'] },
  { id: 'code-light', label: 'Code Light', kind: 'light', hint: 'VS Code style', swatch: ['#ffffff', '#3b3b3b', '#005fb8'] },
  { id: 'solarized-light', label: 'Solarized Light', kind: 'light', hint: 'Low contrast, warm', swatch: ['#fdf6e3', '#586e75', '#b58900'] },
  { id: 'ink', label: 'Ink', kind: 'dark', hint: 'Deep blue-grey', swatch: ['#16191f', '#d6dae1', '#e8a23b'] },
  { id: 'github-dark', label: 'GitHub Dark', kind: 'dark', hint: 'Familiar and crisp', swatch: ['#0d1117', '#d1d7e0', '#4493f8'] },
  { id: 'code-dark', label: 'Code Dark', kind: 'dark', hint: 'VS Code style', swatch: ['#1f1f1f', '#cccccc', '#0078d4'] },
  { id: 'midnight', label: 'Midnight', kind: 'dark', hint: 'Navy with soft accents', swatch: ['#11151f', '#c9d1e0', '#7aa2f7'] },
  { id: 'solarized-dark', label: 'Solarized Dark', kind: 'dark', hint: 'Low contrast, cool', swatch: ['#002b36', '#93a1a1', '#b58900'] },
  { id: 'rose', label: 'Rosé', kind: 'light', hint: 'Warm white, rose accent', swatch: ['#fdf9f8', '#3a2f33', '#d6336c'] },
  { id: 'parchment', label: 'Parchment', kind: 'light', hint: 'Aged paper, sepia ink', swatch: ['#f3ead7', '#3f3224', '#a0522d'] },
  { id: 'fjord', label: 'Fjord', kind: 'dark', hint: 'Arctic blue-grey', swatch: ['#2e3440', '#d8dee9', '#88c0d0'] },
  { id: 'nightshade', label: 'Nightshade', kind: 'dark', hint: 'Deep violet, vivid', swatch: ['#282a36', '#f8f8f2', '#bd93f9'] },
  { id: 'forest', label: 'Forest', kind: 'dark', hint: 'Dark moss, green', swatch: ['#1a1f1b', '#d4dcd0', '#7fb069'] },
];

export const LIGHT_THEMES = COLOR_THEMES.filter((t) => t.kind === 'light');
export const DARK_THEMES = COLOR_THEMES.filter((t) => t.kind === 'dark');

export const isColorTheme = (id: unknown, kind?: 'light' | 'dark'): id is ColorThemeId =>
  COLOR_THEMES.some((t) => t.id === id && (!kind || t.kind === kind));

export const colorTheme = (id: ColorThemeId) => COLOR_THEMES.find((t) => t.id === id)!;
