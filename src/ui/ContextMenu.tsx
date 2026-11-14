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
  | 'separator'
  | { heading: string };

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

function MenuView(props: { menu: OpenMenu; close: () => void }) {
  let el!: HTMLDivElement;
  const [pos, setPos] = createSignal({ x: props.menu.x, y: props.menu.y });
  const buttons = () => [...el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];

  const checks = props.menu.items.some((i) => typeof i === 'object' && 'label' in i && i.checked !== undefined);
  const run = (item: Extract<MenuItem, { label: string }>) => {
    props.close();
    void item.action();
  };
  const onKey = (e: KeyboardEvent) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') props.close();
    else if (e.key === 'ArrowDown') list[(i + 1) % list.length]?.focus();
    else if (e.key === 'ArrowUp') list[(i - 1 + list.length) % list.length]?.focus();
    else if (e.key === 'Home') list[0]?.focus();
    else if (e.key === 'End') list[list.length - 1]?.focus();
    else if (e.key === 'Tab') props.close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onDown = (e: MouseEvent) => !el.contains(e.target as Node) && props.close();

  onMount(() => {
    const r = el.getBoundingClientRect();
    const pad = 6;
    setPos({
      x: Math.max(pad, Math.min(props.menu.x, window.innerWidth - r.width - pad)),
      y: props.menu.y + r.height > window.innerHeight - pad ? Math.max(pad, props.menu.y - r.height) : props.menu.y,
    });
    buttons()[0]?.focus({ preventScroll: true });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', props.close);
    window.addEventListener('resize', props.close);
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
      role="menu"
      style={{ left: `${pos().x}px`, top: `${pos().y}px` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <For each={props.menu.items}>
        {(item) =>
          item === 'separator' ? (
            <div class="menu-sep" role="separator" />
          ) : 'heading' in item ? (
            <div class="menu-label">{item.heading}</div>
          ) : (
            <button
              class="menu-item"
              classList={{ danger: !!item.danger }}
              role={item.checked !== undefined ? 'menuitemradio' : 'menuitem'}
              aria-checked={item.checked}
              disabled={item.disabled}
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
    </div>
  );
}
