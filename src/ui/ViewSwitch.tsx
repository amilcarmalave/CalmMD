import { For, type JSX } from 'solid-js';
import { VIEW_MODES, type ViewMode } from '../app/settings';
import { IconLive, IconPreview, IconSource, IconSplit } from './icons';

const META: Record<ViewMode, { label: string; key: string; icon: () => JSX.Element }> = {
  source: { label: 'Source', key: '1', icon: IconSource },
  live: { label: 'Live', key: '2', icon: IconLive },
  split: { label: 'Split', key: '3', icon: IconSplit },
  preview: { label: 'Preview', key: '4', icon: IconPreview },
};

/** The view-mode control in the status bar (labels appear when there's room). */
export function ViewSwitch(props: { mode: ViewMode; onChange: (m: ViewMode) => void; modKey: string }) {
  return (
    <div class="segmented" role="radiogroup" aria-label="View mode">
      <For each={VIEW_MODES}>
        {(m) => (
          <button
            role="radio"
            aria-checked={props.mode === m}
            aria-label={META[m].label}
            title={`${META[m].label}  ${props.modKey}+Alt+${META[m].key}`}
            classList={{ active: props.mode === m }}
            onClick={() => props.onChange(m)}
          >
            {META[m].icon()}
            <span class="view-label">{META[m].label}</span>
          </button>
        )}
      </For>
    </div>
  );
}
