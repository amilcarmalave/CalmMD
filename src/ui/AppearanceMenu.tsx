import { createSignal, For, onCleanup, Show } from 'solid-js';
import { DARK_THEMES, LIGHT_THEMES, type ColorTheme } from '../app/colorThemes';
import type { ColorScheme, PreviewTheme, Settings } from '../app/settings';
import { BUILTIN_THEMES } from '../app/themes';
import { FONT_LABELS } from '../app/appCommands';
import { IconCheck, IconPalette } from './icons';

const SCHEMES: { id: ColorScheme; label: string }[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/**
 * Appearance: colour theme (light and dark), document style, and a few view options.
 * Everything here is also in View → Appearance and the command palette.
 */
export function AppearanceMenu(props: {
  settings: Settings;
  update: (p: Partial<Settings>) => void;
  /** The scheme in effect ("system" resolved). */
  effectiveScheme: 'light' | 'dark';
  pickColorTheme: (t: ColorTheme) => void;
  userThemes: { id: string; name: string }[];
  openThemesFolder: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;

  const onDoc = (e: MouseEvent) => {
    if (!root.contains(e.target as Node)) toggle(false);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && toggle(false);
  const toggle = (next = !open()) => {
    setOpen(next);
    if (next) {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    } else cleanup();
  };
  const cleanup = () => {
    document.removeEventListener('mousedown', onDoc);
    document.removeEventListener('keydown', onKey);
  };
  onCleanup(cleanup);

  const active = (t: ColorTheme) => (t.kind === 'light' ? props.settings.lightTheme : props.settings.darkTheme) === t.id;
  const inEffect = (t: ColorTheme) => active(t) && t.kind === props.effectiveScheme;

  const ThemeRow = (p: { t: ColorTheme }) => (
    <button
      class="menu-item theme-row"
      classList={{ current: inEffect(p.t) }}
      role="menuitemradio"
      aria-checked={active(p.t)}
      title={p.t.hint}
      onClick={() => props.pickColorTheme(p.t)}
    >
      <span class="theme-swatch" style={{ background: p.t.swatch[0], color: p.t.swatch[1] }}>
        <span class="theme-swatch-text">Aa</span>
        <span class="theme-swatch-accent" style={{ background: p.t.swatch[2] }} />
      </span>
      <span class="menu-text">{p.t.label}</span>
      <span class="menu-check">{active(p.t) && <IconCheck />}</span>
    </button>
  );

  return (
    <div class="popover-anchor" ref={root}>
      <button class="icon-btn status-icon" classList={{ active: open() }} aria-label="Appearance" title="Appearance: themes and styles" onClick={() => toggle()}>
        <IconPalette />
      </button>
      <Show when={open()}>
        <div class="popover appearance" role="menu">
          <div class="appearance-col">
            <div class="segmented segmented-text appearance-mode" role="radiogroup" aria-label="Light or dark">
              <For each={SCHEMES}>
                {(s) => (
                  <button
                    role="radio"
                    aria-checked={props.settings.colorScheme === s.id}
                    classList={{ active: props.settings.colorScheme === s.id }}
                    onClick={() => props.update({ colorScheme: s.id })}
                  >
                    {s.label}
                  </button>
                )}
              </For>
            </div>
            <div class="menu-label">Light theme</div>
            <For each={LIGHT_THEMES}>{(t) => <ThemeRow t={t} />}</For>
            <div class="menu-label">Dark theme</div>
            <For each={DARK_THEMES}>{(t) => <ThemeRow t={t} />}</For>
          </div>
          <div class="appearance-col">
            <div class="menu-label">Document style</div>
            <For each={BUILTIN_THEMES}>
              {(t) => (
                <button
                  class="menu-item"
                  role="menuitemradio"
                  aria-checked={props.settings.previewTheme === t.id}
                  onClick={() => props.update({ previewTheme: t.id })}
                >
                  <span class="menu-check">{props.settings.previewTheme === t.id && <IconCheck />}</span>
                  <span class="menu-text">{t.label}</span>
                  <span class="menu-hint">{t.hint}</span>
                </button>
              )}
            </For>
            <For each={props.userThemes}>
              {(t) => (
                <button
                  class="menu-item"
                  role="menuitemradio"
                  aria-checked={props.settings.previewTheme === t.id}
                  onClick={() => props.update({ previewTheme: t.id as PreviewTheme })}
                >
                  <span class="menu-check">{props.settings.previewTheme === t.id && <IconCheck />}</span>
                  <span class="menu-text">{t.name}</span>
                  <span class="menu-hint">Custom</span>
                </button>
              )}
            </For>
            <button class="menu-item" onClick={() => props.openThemesFolder()}>
              <span class="menu-check" />
              <span class="menu-text menu-subtle">Open Themes Folder…</span>
            </button>
            <div class="menu-label">Font</div>
            <For each={FONT_LABELS}>
              {([f, label]) => (
                <button class="menu-item" role="menuitemradio" aria-checked={props.settings.fontFamily === f} onClick={() => props.update({ fontFamily: f })}>
                  <span class="menu-check">{props.settings.fontFamily === f && <IconCheck />}</span>
                  <span class="menu-text">{label}</span>
                </button>
              )}
            </For>
            <div class="menu-sep" />
            <button
              class="menu-item"
              role="menuitemcheckbox"
              aria-checked={props.settings.scrollSync}
              onClick={() => props.update({ scrollSync: !props.settings.scrollSync })}
            >
              <span class="menu-check">{props.settings.scrollSync && <IconCheck />}</span>
              <span class="menu-text">Sync scrolling in split view</span>
            </button>
            <button
              class="menu-item"
              role="menuitemcheckbox"
              aria-checked={props.settings.toolbarVisible}
              onClick={() => props.update({ toolbarVisible: !props.settings.toolbarVisible })}
            >
              <span class="menu-check">{props.settings.toolbarVisible && <IconCheck />}</span>
              <span class="menu-text">Show toolbar</span>
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
