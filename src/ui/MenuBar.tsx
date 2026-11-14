import { createSignal, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import type { ResolvedEntry, TopMenu } from '../app/menuModel';
import { IconCheck } from './icons';
import { IconChevron } from './sidebarIcons';

/**
 * The in-window menu bar (Windows, Linux and the browser build; macOS uses the native menu).
 * Click a title to open it; while one is open, hovering another title switches. Keyboard:
 * Alt (pressed alone) or F10 focuses the bar, arrows move, Enter runs, Escape closes.
 */
export function MenuBar(props: {
  menus: TopMenu[];
  resolve: (menu: TopMenu) => ResolvedEntry[];
  leading?: JSX.Element;
  trailing?: JSX.Element;
}) {
  const [open, setOpen] = createSignal<number | null>(null);
  let bar!: HTMLDivElement;
  const titles = () => [...bar.querySelectorAll<HTMLButtonElement>('.menubar-title')];

  const close = (refocusEditor = true) => {
    setOpen(null);
    if (refocusEditor && bar.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  };
  const openAt = (i: number, focusFirst = false) => {
    const n = props.menus.length;
    const idx = ((i % n) + n) % n;
    setOpen(idx);
    titles()[idx]?.focus({ preventScroll: true });
    if (focusFirst) queueMicrotask(() => bar.querySelector<HTMLButtonElement>('.menubar-panel .menu-item:not(:disabled)')?.focus());
  };

  // Alt pressed and released on its own focuses the bar (the Windows convention), as does F10.
  let altAlone = false;
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Alt') altAlone = !e.repeat;
    else altAlone = false;
    if (e.key === 'F10' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (open() === null) titles()[0]?.focus();
      else close();
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === 'Alt' && altAlone) {
      altAlone = false;
      e.preventDefault();
      if (open() !== null) close();
      else if (bar.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      else titles()[0]?.focus();
    }
  };
  const onDown = (e: MouseEvent) => {
    if (open() !== null && !bar.contains(e.target as Node)) close(false);
  };
  const onBlur = () => close(false);
  onMount(() => {
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', onBlur);
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('blur', onBlur);
  });

  const onTitleKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight') openAt(i + 1, open() !== null);
    else if (e.key === 'ArrowLeft') openAt(i - 1, open() !== null);
    else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') openAt(i, true);
    else if (e.key === 'Escape') close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div class="menubar" ref={bar} role="menubar">
      {props.leading}
      <For each={props.menus}>
        {(menu, i) => (
          <div class="menubar-item">
            <button
              class="menubar-title"
              classList={{ open: open() === i() }}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open() === i()}
              onMouseDown={(e) => {
                e.preventDefault(); // keep editor focus until a command runs
                if (open() === i()) close();
                else openAt(i());
              }}
              onMouseEnter={() => open() !== null && open() !== i() && openAt(i())}
              onKeyDown={(e) => onTitleKey(e, i())}
            >
              {menu.label}
            </button>
            <Show when={open() === i()}>
              <MenuPanel
                items={props.resolve(menu)}
                class="menubar-panel"
                onRun={(run) => {
                  close();
                  run();
                }}
                onClose={() => {
                  close(false);
                  titles()[i()]?.focus();
                }}
                onSideways={(dir) => openAt(i() + dir, true)}
              />
            </Show>
          </div>
        )}
      </For>
      <span class="menubar-spacer" />
      {props.trailing}
    </div>
  );
}

/** A dropdown or submenu panel. Submenus open to the side on hover or ArrowRight. */
function MenuPanel(props: {
  items: ResolvedEntry[];
  class: string;
  onRun: (run: () => void) => void;
  onClose: () => void;
  /** Left/right at the top level moves to the neighbouring menu. */
  onSideways?: (dir: 1 | -1) => void;
}) {
  const [subOpen, setSubOpen] = createSignal<number | null>(null);
  let el!: HTMLDivElement;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(hoverTimer));
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>(':scope > .menu-entry > .menu-item:not(:disabled)')];

  onMount(() => {
    // Keep the panel inside the window.
    const r = el.getBoundingClientRect();
    if (r.right > window.innerWidth - 6) el.classList.add('flip');
    if (r.bottom > window.innerHeight - 6) {
      el.style.maxHeight = `${Math.max(160, window.innerHeight - r.top - 10)}px`;
      el.classList.add('scroll');
    }
  });

  const onKey = (e: KeyboardEvent, index: number, entry: ResolvedEntry) => {
    const list = buttons();
    const i = list.indexOf(e.currentTarget as HTMLButtonElement);
    if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'ArrowRight' && entry.kind === 'submenu' && entry.enabled) {
      setSubOpen(index);
      queueMicrotask(() => el.querySelector<HTMLButtonElement>('.menu-sub .menu-item:not(:disabled)')?.focus());
    } else if (e.key === 'ArrowRight' && props.onSideways) props.onSideways(1);
    else if (e.key === 'ArrowLeft' && props.onSideways) props.onSideways(-1);
    else if (e.key === 'ArrowLeft' || e.key === 'Escape') props.onClose();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div class={`menu-panel ${props.class}`} ref={el} role="menu">
      <For each={props.items}>
        {(entry, i) =>
          entry.kind === 'separator' ? (
            <div class="menu-sep" role="separator" />
          ) : (
            <div class="menu-entry">
              <button
                class="menu-item"
                classList={{ 'has-sub': entry.kind === 'submenu', 'sub-open': subOpen() === i() }}
                role={entry.kind === 'item' && entry.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                aria-checked={entry.kind === 'item' && entry.checked !== undefined ? entry.checked : undefined}
                aria-haspopup={entry.kind === 'submenu' ? 'menu' : undefined}
                disabled={!entry.enabled}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => {
                  clearTimeout(hoverTimer);
                  hoverTimer = setTimeout(() => setSubOpen(entry.kind === 'submenu' ? i() : null), entry.kind === 'submenu' ? 60 : 160);
                }}
                onClick={() => {
                  if (entry.kind === 'submenu') setSubOpen(subOpen() === i() ? null : i());
                  else props.onRun(entry.run);
                }}
                onKeyDown={(e) => onKey(e, i(), entry)}
              >
                <span class="menu-check">{entry.kind === 'item' && entry.checked && <IconCheck />}</span>
                <span class="menu-text">{entry.label}</span>
                <Show when={entry.kind === 'item' && entry.hint}>
                  <span class="menu-hint">{entry.kind === 'item' && entry.hint}</span>
                </Show>
                <Show when={entry.kind === 'submenu'}>
                  <span class="menu-sub-arrow">
                    <IconChevron />
                  </span>
                </Show>
              </button>
              <Show when={entry.kind === 'submenu' && subOpen() === i() ? entry : null}>
                {(s) => (
                  <MenuPanel
                    items={(s() as Extract<ResolvedEntry, { kind: 'submenu' }>).items()}
                    class="menu-sub"
                    onRun={props.onRun}
                    onClose={() => {
                      setSubOpen(null);
                      buttons()[0] && el.querySelectorAll<HTMLButtonElement>(':scope > .menu-entry > .menu-item')[i()]?.focus();
                    }}
                  />
                )}
              </Show>
            </div>
          )
        }
      </For>
    </div>
  );
}
