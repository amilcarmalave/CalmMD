import { createSignal, For, Show } from 'solid-js';
import type { CommandRegistry } from '../app/commands';
import { DEFAULT_TOOLBAR, TOOLBAR_MAX, TOOLBAR_SEPARATOR } from '../app/settings';
import type { MenuItem } from './ContextMenu';
import { HIGHLIGHT_COLORS, TEXT_COLORS } from '../editor/colors';
import { FORMAT_ICONS, TOOLBAR_CANDIDATES } from './formatIcons';
import { IconCaret } from './icons';

/** Toolbar-only pseudo command: a dropdown of heading levels. */
export const HEADING_MENU = 'format.headingMenu';
const HEADING_ITEMS: [string, string][] = [
  ['format.paragraph', 'Paragraph'],
  ['format.heading1', 'Heading 1'],
  ['format.heading2', 'Heading 2'],
  ['format.heading3', 'Heading 3'],
  ['format.heading4', 'Heading 4'],
  ['format.heading5', 'Heading 5'],
  ['format.heading6', 'Heading 6'],
];

const label = (registry: CommandRegistry, id: string) => (id === HEADING_MENU ? 'Heading' : (registry.get(id)?.title ?? id));

/** The formatting toolbar. Items are command ids; "|" separates groups. */
export function Toolbar(props: {
  items: string[];
  registry: CommandRegistry;
  hint: (id: string) => string | undefined;
  onCustomize: () => void;
  openMenuAt: (x: number, y: number, items: MenuItem[]) => void;
  /** Current colours behind the Highlight and Text Color buttons (CSS values; null = default). */
  colors: { highlight: string | null; text: string };
}) {
  const visible = () =>
    props.items.filter((id, i, all) => {
      if (id === TOOLBAR_SEPARATOR) return i > 0 && all[i - 1] !== TOOLBAR_SEPARATOR && i < all.length - 1;
      return FORMAT_ICONS[id] && (id === HEADING_MENU || props.registry.get(id));
    });

  const headingMenu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    props.openMenuAt(
      r.left,
      r.bottom + 4,
      HEADING_ITEMS.map(([id, title]) => ({ label: title, hint: props.hint(id), action: () => props.registry.run(id) })),
    );
  };

  /** The swatches behind a colour button's arrow. */
  const colorMenu = (e: MouseEvent, kind: 'highlight' | 'text') => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const items: MenuItem[] =
      kind === 'highlight'
        ? [
            { label: 'Default', hint: props.hint('format.highlight.default'), swatch: { kind: 'fill', color: 'color-mix(in srgb, var(--accent) 30%, transparent)' }, action: () => props.registry.run('format.highlight.default') },
            ...HIGHLIGHT_COLORS.map((c): MenuItem => ({ label: c.label, swatch: { kind: 'fill', color: c.value }, action: () => props.registry.run(`format.highlight.${c.id}`) })),
            { label: 'Custom…', swatch: { kind: 'fill', color: 'conic-gradient(#f87171, #facc15, #4ade80, #60a5fa, #c084fc, #f87171)' }, action: () => props.registry.run('format.highlight.custom') },
            'separator',
            { label: 'Remove Highlight', swatch: { kind: 'fill', color: null }, action: () => props.registry.run('format.highlight.none') },
          ]
        : [
            ...TEXT_COLORS.map((c): MenuItem => ({ label: c.label, swatch: { kind: 'text', color: c.value }, action: () => props.registry.run(`format.textColor.${c.id}`) })),
            { label: 'Custom…', swatch: { kind: 'fill', color: 'conic-gradient(#f87171, #facc15, #4ade80, #60a5fa, #c084fc, #f87171)' }, action: () => props.registry.run('format.textColor.custom') },
            'separator',
            { label: 'Remove Text Color', swatch: { kind: 'text', color: null }, action: () => props.registry.run('format.textColor.none') },
          ];
    props.openMenuAt(r.left - 30, r.bottom + 4, items);
  };

  const ColorButton = (p: { id: 'format.highlight' | 'format.textColor' }) => {
    const kind = p.id === 'format.highlight' ? 'highlight' : 'text';
    const title = kind === 'highlight' ? 'Highlight' : 'Text Color';
    const hint = props.hint(p.id);
    const color = () => (kind === 'highlight' ? (props.colors.highlight ?? 'color-mix(in srgb, var(--accent) 45%, transparent)') : props.colors.text);
    return (
      <span class="toolbar-split">
        <button
          class="icon-btn toolbar-btn toolbar-split-main"
          title={hint ? `${title}  ${hint}` : title}
          aria-label={title}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => props.registry.run(p.id)}
        >
          {FORMAT_ICONS[p.id]()}
          <span class="toolbar-color-bar" style={{ background: color() }} />
        </button>
        <button
          class="icon-btn toolbar-btn toolbar-split-arrow"
          title={`${title} colours`}
          aria-label={`${title} colours`}
          aria-haspopup="menu"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => colorMenu(e, kind)}
        >
          <IconCaret />
        </button>
      </span>
    );
  };

  return (
    <div class="toolbar" role="toolbar" aria-label="Formatting">
      <For each={visible()}>
        {(id) => {
          if (id === TOOLBAR_SEPARATOR) return <span class="toolbar-sep" role="separator" />;
          if (id === 'format.highlight' || id === 'format.textColor') return <ColorButton id={id} />;
          const title = label(props.registry, id);
          const hint = props.hint(id);
          return (
            <button
              class="icon-btn toolbar-btn"
              classList={{ 'toolbar-wide': id === HEADING_MENU }}
              title={hint ? `${title}  ${hint}` : title}
              aria-label={title}
              aria-haspopup={id === HEADING_MENU ? 'menu' : undefined}
              onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}
              onClick={(e) => (id === HEADING_MENU ? headingMenu(e) : props.registry.run(id))}
            >
              {FORMAT_ICONS[id]()}
            </button>
          );
        }}
      </For>
      <span class="toolbar-spacer" />
      <button class="icon-btn toolbar-btn toolbar-more" title="Customize toolbar" aria-label="Customize toolbar" onClick={props.onCustomize}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="4" cy="8" r="1.1" fill="currentColor" />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="12" cy="8" r="1.1" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}

/** Floating format bubble for mouse selections. */
export function SelectionBubble(props: {
  x: number;
  y: number;
  registry: CommandRegistry;
  hint: (id: string) => string | undefined;
}) {
  const ids = ['format.bold', 'format.italic', 'format.strike', 'format.highlight', 'format.code', 'format.link', '|', 'format.heading2', 'format.quote', 'format.clear'];
  return (
    <div class="bubble" style={{ left: `${props.x}px`, top: `${props.y}px` }} role="toolbar" aria-label="Format selection">
      <For each={ids}>
        {(id) =>
          id === '|' ? (
            <span class="bubble-sep" />
          ) : (
            <button
              class="icon-btn"
              title={`${props.registry.get(id)?.title ?? id}${props.hint(id) ? '  ' + props.hint(id) : ''}`}
              aria-label={props.registry.get(id)?.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => props.registry.run(id)}
            >
              {FORMAT_ICONS[id]()}
            </button>
          )
        }
      </For>
    </div>
  );
}

/** Pick, order and group toolbar buttons. */
export function CustomizeToolbar(props: {
  items: string[];
  visible: boolean;
  registry: CommandRegistry;
  onChange: (items: string[], visible: boolean) => void;
  onClose: () => void;
}) {
  // Separators get unique keys while editing so they can be moved individually.
  let sepCount = 0;
  const keyed = (list: string[]) => list.map((id) => (id === TOOLBAR_SEPARATOR ? `${TOOLBAR_SEPARATOR}${sepCount++}` : id));
  const plain = (list: string[]) => list.map((id) => (id.startsWith(TOOLBAR_SEPARATOR) ? TOOLBAR_SEPARATOR : id));
  const [items, setItems] = createSignal(keyed(props.items));
  const [visible, setVisible] = createSignal(props.visible);
  const isSep = (id: string) => id.startsWith(TOOLBAR_SEPARATOR);
  const toggle = (id: string) =>
    setItems((list) => (list.includes(id) ? list.filter((x) => x !== id) : list.length < TOOLBAR_MAX ? [...list, id] : list));
  const move = (id: string, dir: -1 | 1) =>
    setItems((list) => {
      const i = list.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const unused = () => TOOLBAR_CANDIDATES.filter((id) => !items().includes(id));
  const rowLabel = (id: string) => (isSep(id) ? 'Separator' : label(props.registry, id));

  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal modal-wide" role="dialog" aria-labelledby="tb-title" onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
        <h2 id="tb-title">Toolbar</h2>
        <p>Choose and order the buttons. Everything is also in the menus, the command palette and the right-click menu.</p>
        <label class="check-row">
          <input type="checkbox" checked={visible()} onChange={(e) => setVisible(e.currentTarget.checked)} />
          Show the toolbar
        </label>
        <div class="tb-list">
          <For each={[...items(), ...unused()]}>
            {(id) => {
              const on = () => items().includes(id);
              return (
                <div class="tb-row" classList={{ on: on(), sep: isSep(id) }}>
                  <label class="check-row">
                    <input type="checkbox" checked={on()} disabled={!on() && items().length >= TOOLBAR_MAX} onChange={() => toggle(id)} />
                    <span class="tb-icon">{isSep(id) ? <span class="tb-sep-mark" /> : FORMAT_ICONS[id]?.()}</span>
                    {rowLabel(id)}
                  </label>
                  <Show when={on()}>
                    <span class="tb-move">
                      <button class="icon-btn" aria-label="Move up" onClick={() => move(id, -1)}>
                        ↑
                      </button>
                      <button class="icon-btn" aria-label="Move down" onClick={() => move(id, 1)}>
                        ↓
                      </button>
                    </span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
        <div class="modal-actions">
          <button class="btn" onClick={() => setItems([...items(), `${TOOLBAR_SEPARATOR}${sepCount++}`])}>
            Add Separator
          </button>
          <button class="btn" onClick={() => setItems(keyed(DEFAULT_TOOLBAR))}>
            Reset
          </button>
          <span class="modal-actions-spacer" />
          <button class="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button
            class="btn btn-primary"
            onClick={() => {
              props.onChange(plain(items()), visible());
              props.onClose();
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
