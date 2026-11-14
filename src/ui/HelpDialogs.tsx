import { createMemo, createSignal, For, onMount, Show } from 'solid-js';
import type { CommandRegistry } from '../app/commands';
import { BRAND } from '../brand';
import { formatBinding } from '../core/keys';
import { LogoMark } from './icons';

/** Every command that has a shortcut, grouped by category, with a filter. */
export function ShortcutsDialog(props: { registry: CommandRegistry; isMac: boolean; onClose: () => void }) {
  const [q, setQ] = createSignal('');
  let input!: HTMLInputElement;
  onMount(() => input.focus());
  const groups = createMemo(() => {
    const needle = q().trim().toLowerCase();
    const map = new Map<string, { title: string; keys: string }[]>();
    const seen = new Set<string>();
    for (const c of props.registry.all()) {
      if (!c.keys) continue;
      const keys = formatBinding(c.keys, props.isMac);
      const key = `${c.title}|${keys}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (needle && !`${c.category} ${c.title} ${keys}`.toLowerCase().includes(needle)) continue;
      const list = map.get(c.category) ?? [];
      list.push({ title: c.title, keys });
      map.set(c.category, list);
    }
    return [...map.entries()];
  });
  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal modal-wide shortcuts" role="dialog" aria-labelledby="sc-title" onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
        <h2 id="sc-title">Keyboard Shortcuts</h2>
        <input ref={input} class="modal-input" placeholder="Filter" value={q()} onInput={(e) => setQ(e.currentTarget.value)} />
        <div class="shortcut-groups">
          <For each={groups()} fallback={<p>No shortcuts match.</p>}>
            {([category, items]) => (
              <section>
                <h3 class="menu-label">{category}</h3>
                <For each={items}>
                  {(i) => (
                    <div class="shortcut-row">
                      <span>{i.title}</span>
                      <kbd>{i.keys}</kbd>
                    </div>
                  )}
                </For>
              </section>
            )}
          </For>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" onClick={props.onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function AboutDialog(props: { onClose: () => void; openLicenses?: () => void; licensedTo?: string | null; onPro?: () => void }) {
  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal about" role="dialog" aria-labelledby="about-title" onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
        <LogoMark size={64} />
        <h2 id="about-title">{BRAND.name}</h2>
        <p class="about-tagline">{BRAND.tagline}</p>
        <p class="about-meta">
          Version {__APP_VERSION__}
          <br />
          MIT License · Free and open source
        </p>
        <Show when={props.onPro}>
          <p class="about-meta">
            {props.licensedTo ? `Supporter · thank you, ${props.licensedTo}` : ''}
            <button class="link-btn" onClick={() => props.onPro?.()}>
              {props.licensedTo ? 'Manage' : 'Become a Supporter…'}
            </button>
          </p>
        </Show>
        <Show when={props.openLicenses}>
          <button class="btn btn-small" onClick={() => props.openLicenses?.()}>
            Third-party licenses
          </button>
        </Show>
        <div class="modal-actions">
          <button class="btn btn-primary" autofocus onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
