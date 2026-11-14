import { createSignal, For, onMount, Show } from 'solid-js';
import { maskKey } from '../core/license';
import { PRO_FEATURES, type Pro, type ProFeature } from '../app/pro';
import { PRO_CONFIG } from '../app/proConfig';
import { IconCheck, LogoMark } from './icons';

/** CalmMD Pro: what it adds, buying it, and entering or removing a licence key. */
export function ProDialog(props: { pro: Pro; feature?: ProFeature; openExternal: (url: string) => void; onClose: () => void }) {
  const [key, setKey] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [justActivated, setJustActivated] = createSignal(false);
  let input: HTMLInputElement | undefined;
  onMount(() => input?.focus());

  const activate = async () => {
    setBusy(true);
    setError(null);
    const err = await props.pro.activate(key());
    setBusy(false);
    if (err) setError(err);
    else setJustActivated(true);
  };
  const deactivate = async () => {
    setBusy(true);
    const err = await props.pro.deactivate();
    setBusy(false);
    setError(err);
  };

  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div class="modal pro-dialog" role="dialog" aria-labelledby="pro-title" onKeyDown={(e) => e.key === 'Escape' && props.onClose()}>
        <div class="pro-head">
          <LogoMark size={40} />
          <div>
            <h2 id="pro-title">Become a CalmMD Supporter</h2>
            <p class="pro-sub">
              {PRO_CONFIG.price} once. A thank-you for helping keep CalmMD free.
            </p>
          </div>
        </div>
        <Show when={props.feature && !props.pro.isPro()}>
          <p class="pro-why">
            <strong>{PRO_FEATURES[props.feature!].title}</strong> is one of the Supporter extras.
          </p>
        </Show>
        <ul class="pro-features">
          <For each={Object.values(PRO_FEATURES)}>
            {(f) => (
              <li>
                <span class="pro-check">
                  <IconCheck />
                </span>
                <span>
                  <strong>{f.title}</strong>
                  <Show when={f.soon}>
                    <span class="pro-badge">Coming soon</span>
                  </Show>
                  <span class="pro-detail">{f.detail}</span>
                </span>
              </li>
            )}
          </For>
        </ul>
        <p class="pro-free">CalmMD is free and stays free. Supporting it pays for its development, and these extras are a thank-you. Works on up to 3 of your devices.</p>

        <Show
          when={props.pro.license()}
          fallback={
            <>
              <div class="pro-buy">
                <Show when={PRO_CONFIG.buyUrl} fallback={<span class="pro-soon">Supporting opens soon.</span>}>
                  {(url) => (
                    <button class="btn btn-primary" onClick={() => props.openExternal(url())}>
                      Support CalmMD, {PRO_CONFIG.price}
                    </button>
                  )}
                </Show>
              </div>
              <label class="pro-key-label" for="pro-key">
                Already a Supporter? Paste your key:
              </label>
              <div class="pro-key-row">
                <input
                  id="pro-key"
                  ref={input}
                  class="modal-input"
                  placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
                  value={key()}
                  spellcheck={false}
                  autocomplete="off"
                  onInput={(e) => setKey(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !busy() && void activate()}
                />
                <button class="btn" disabled={busy() || !key().trim()} onClick={() => void activate()}>
                  {busy() ? 'Activating…' : 'Activate'}
                </button>
              </div>
            </>
          }
        >
          {(l) => (
            <div class="pro-active">
              <p>
                <strong>{justActivated() ? 'Thank you for supporting CalmMD!' : 'Thank you for supporting CalmMD.'}</strong>
                <br />
                {l().email ? `Licensed to ${l().email}` : 'Licensed'} · key {maskKey(l().key)}
              </p>
              <button class="btn btn-small" disabled={busy()} onClick={() => void deactivate()}>
                Deactivate on This Device
              </button>
            </div>
          )}
        </Show>
        <Show when={error()}>
          <p class="pro-error" role="alert">
            {error()}
          </p>
        </Show>
        <div class="modal-actions">
          <button class="btn" onClick={props.onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
