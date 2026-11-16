import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { IconCheck } from './icons';

export type MenuItem =
  | {
      label: string;
      hint?: string;
      action: () => unknown;
      danger?: boolean;
      disabled?: boolean;
      /** Shows a check mark column for the whole menu when any item sets this. */
      checked?: boolean;
      /** Smaller, secondary text after the label (a folder's location, for example). */
      detail?: string;
      /** A colour sample before the label: a filled chip (highlights) or a coloured "A" (text). */
      swatch?: { kind: 'fill' | 'text'; color: string | null };
    }
  | { label: string; submenu: () => MenuItem[]; disabled?: boolean }
  | 'separator'
  | { heading: string };

type ActionItem = Extract<MenuItem, { action: () => unknown }>;
type SubmenuItem = Extract<MenuItem, { submenu: () => MenuItem[] }>;

interface OpenMenu {
  x: number;
  y: number;
  items: MenuItem[];
}

/** One context menu per window. Keyboard accessible, clamped to the viewport, closes on outside click. */
export function createContextMenu() {
  const [menu, setMenu] = createSignal<OpenMenu | null>(null);

  const open = (e: MouseEvent, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const openAt = (x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items });
  const close = () => setMenu(null);

  function ContextMenuHost() {
    return <Show when={menu()}>{(m) => <MenuView menu={m()} close={close} />}</Show>;
  }
  return { open, openAt, close, ContextMenuHost };
}

/**
 * One level of the menu. A submenu opens beside its item (hover, click, →) and is drawn inside the
 * parent's element, so clicks in it don't count as outside. Only the root listens for outside clicks.
 */
function MenuView(props: {
  menu: OpenMenu;
  close: () => void;
  /** Set for a submenu: closes just this level (←, Esc). */
  back?: () => void;
  /** Width of the parent item, so a submenu that doesn't fit on the right opens on the left. */
  parentLeft?: number;
}) {
  let el!: HTMLDivElement;
  const [pos, setPos] = createSignal({ x: props.menu.x, y: props.menu.y });
  const [sub, setSub] = createSignal<{ index: number; menu: OpenMenu; left: number } | null>(null);
  const own = () => [...el.querySelectorAll<HTMLButtonElement>(':scope > button.menu-item:not(:disabled)')];

  const checks = props.menu.items.some((i) => typeof i === 'object' && 'action' in i && i.checked !== undefined);
  const run = (item: ActionItem) => {
    props.close();
    void item.action();
  };
  const openSub = (index: number, item: SubmenuItem, button: HTMLElement, focus: boolean) => {
    if (sub()?.index === index) return;
    const r = button.getBoundingClientRect();
    setSub({ index, menu: { x: r.right - 4, y: r.top - 5, items: item.submenu() }, left: r.left });
    if (focus) queueMicrotask(() => el.querySelector<HTMLButtonElement>(':scope > .context-menu button.menu-item:not(:disabled)')?.focus());
  };

  const onKey = (e: KeyboardEvent) => {
    // Only the level that has the focus answers.
    if ((document.activeElement as HTMLElement | null)?.closest('.context-menu') !== el) return;
    const list = own();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const focused = list[i];
    if (e.key === 'Escape' || (e.key === 'ArrowLeft' && props.back)) props.back ? props.back() : props.close();
    else if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'Home') list[0]?.focus();
    else if (e.key === 'End') list[list.length - 1]?.focus();
    else if (e.key === 'ArrowRight' && focused?.dataset.sub !== undefined) {
      const index = Number(focused.dataset.sub);
      openSub(index, props.menu.items[index] as SubmenuItem, focused, true);
    } else if (e.key === 'Tab') props.close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onDown = (e: MouseEvent) => !el.contains(e.target as Node) && props.close();

  onMount(() => {
    const r = el.getBoundingClientRect();
    const pad = 6;
    const fitsRight = props.menu.x + r.width <= window.innerWidth - pad;
    setPos({
      x: fitsRight ? props.menu.x : props.parentLeft !== undefined ? Math.max(pad, props.parentLeft - r.width + 4) : Math.max(pad, window.innerWidth - r.width - pad),
      y: props.menu.y + r.height > window.innerHeight - pad ? Math.max(pad, (props.back ? window.innerHeight - pad : props.menu.y) - r.height) : props.menu.y,
    });
    own()[0]?.focus({ preventScroll: true });
    window.addEventListener('keydown', onKey, true);
    if (!props.back) {
      window.addEventListener('mousedown', onDown, true);
      window.addEventListener('blur', props.close);
      window.addEventListener('resize', props.close);
    }
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onDown, true);
    window.removeEventListener('blur', props.close);
    window.removeEventListener('resize', props.close);
  });

  return (
    <div
      ref={el}
      class="context-menu"
      classList={{ submenu: !!props.back }}
      role="menu"
      style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <For each={props.menu.items}>
        {(item, index) =>
          item === 'separator' ? (
            <div class="menu-sep" role="separator" />
          ) : 'heading' in item ? (
            <div class="menu-label">{item.heading}</div>
          ) : 'submenu' in item ? (
            <button
              class="menu-item has-sub"
              classList={{ open: sub()?.index === index() }}
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={sub()?.index === index()}
              data-sub={index()}
              disabled={item.disabled}
              onMouseEnter={(e) => openSub(index(), item, e.currentTarget, false)}
              onClick={(e) => openSub(index(), item, e.currentTarget, true)}
            >
              <Show when={checks}>
                <span class="menu-check" />
              </Show>
              <span class="menu-text">{item.label}</span>
              <span class="menu-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          ) : (
            <button
              class="menu-item"
              classList={{ danger: !!item.danger }}
              role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
              aria-checked={item.checked}
              disabled={item.disabled}
              onMouseEnter={() => setSub(null)}
              onClick={() => run(item)}
              title={item.detail}
            >
              <Show when={checks}>
                <span class="menu-check">{item.checked && <IconCheck />}</span>
              </Show>
              <Show when={item.swatch}>
                {(sw) => (
                  <span class="menu-swatch" classList={{ none: !sw().color, text: sw().kind === 'text' }} style={sw().kind === 'fill' && sw().color ? { background: sw().color! } : sw().color ? { color: sw().color! } : undefined}>
                    {sw().kind === 'text' ? 'A' : ''}
                  </span>
                )}
              </Show>
              <span class="menu-text">{item.label}</span>
              <Show when={item.detail}>
                <span class="menu-detail">{item.detail}</span>
              </Show>
              <Show when={item.hint}>
                <span class="menu-hint">{item.hint}</span>
              </Show>
            </button>
          )
        }
      </For>
      <Show when={sub()}>
        {(s) => (
          <MenuView
            menu={s().menu}
            close={props.close}
            parentLeft={s().left}
            back={() => {
              const i = s().index;
              setSub(null);
              own().find((b) => b.dataset.sub === String(i))?.focus();
            }}
          />
        )}
      </Show>
    </div>
  );
}
