import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import type { ConfirmChoice, ConfirmRequest } from '../app/documents';

interface PendingConfirm extends ConfirmRequest {
  kind: 'confirm';
  resolve: (c: ConfirmChoice) => void;
}

export interface PromptRequest {
  title: string;
  message?: string;
  value?: string;
  placeholder?: string;
  primary: string;
  /** An empty answer is allowed and resolves to "" (cancel is still null). */
  allowEmpty?: boolean;
}

interface PendingPrompt extends PromptRequest {
  kind: 'prompt';
  resolve: (v: string | null) => void;
}

type Pending = PendingConfirm | PendingPrompt;

/** Small promise-based modals (confirm and prompt). One shows at a time, and later requests queue. */
export function createConfirm() {
  const [current, setCurrent] = createSignal<Pending | null>(null);
  const queue: Pending[] = [];
  const enqueue = (p: Pending) => (current() ? queue.push(p) : setCurrent(p));
  const next = () => setCurrent(queue.shift() ?? null);

  const confirm = (req: ConfirmRequest) =>
    new Promise<ConfirmChoice>((resolve) => enqueue({ ...req, kind: 'confirm', resolve }));
  const prompt = (req: PromptRequest) =>
    new Promise<string | null>((resolve) => enqueue({ ...req, kind: 'prompt', resolve }));

  function ConfirmDialog() {
    return (
      <Show when={current()} keyed>
        {(req) =>
          req.kind === 'confirm' ? (
            <ConfirmView
              req={req}
              answer={(c) => {
                next();
                req.resolve(c);
              }}
            />
          ) : (
            <PromptView
              req={req}
              answer={(v) => {
                next();
                req.resolve(v);
              }}
            />
          )
        }
      </Show>
    );
  }

  return { confirm, prompt, ConfirmDialog };
}

function useEscape(onEscape: () => void) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    }
  };
  onMount(() => window.addEventListener('keydown', onKey, true));
  onCleanup(() => window.removeEventListener('keydown', onKey, true));
}

function ConfirmView(props: { req: PendingConfirm; answer: (c: ConfirmChoice) => void }) {
  let primary!: HTMLButtonElement;
  useEscape(() => props.answer('cancel'));
  onMount(() => primary.focus());

  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.answer('cancel')}>
      <div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{props.req.title}</h2>
        <p>{props.req.message}</p>
        <div class="modal-actions">
          <button class="btn" onClick={() => props.answer('cancel')}>
            Cancel
          </button>
          <Show when={props.req.secondary}>
            <button
              class="btn"
              classList={{ 'btn-danger': props.req.destructive === 'secondary' }}
              onClick={() => props.answer('secondary')}
            >
              {props.req.secondary}
            </button>
          </Show>
          <button
            ref={primary}
            class="btn btn-primary"
            classList={{ 'btn-danger': props.req.destructive === 'primary' }}
            onClick={() => props.answer('primary')}
          >
            {props.req.primary}
          </button>
        </div>
      </div>
    </div>
  );
}

function PromptView(props: { req: PendingPrompt; answer: (v: string | null) => void }) {
  let input!: HTMLInputElement;
  useEscape(() => props.answer(null));
  onMount(() => {
    input.focus();
    input.select();
  });
  const submit = () => {
    const v = input.value.trim();
    props.answer(v ? v : props.req.allowEmpty ? '' : null);
  };

  return (
    <div class="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.answer(null)}>
      <form
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-title"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2 id="prompt-title">{props.req.title}</h2>
        <Show when={props.req.message}>
          <p>{props.req.message}</p>
        </Show>
        <input ref={input} class="modal-input" value={props.req.value ?? ''} placeholder={props.req.placeholder} spellcheck={false} />
        <div class="modal-actions">
          <button type="button" class="btn" onClick={() => props.answer(null)}>
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            {props.req.primary}
          </button>
        </div>
      </form>
    </div>
  );
}
