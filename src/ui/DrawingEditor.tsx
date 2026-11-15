import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js';
import { drawingTitle } from '../core/drawings';
import { dirname } from '../core/paths';
import type { MountedDrawing } from '../drawing/excalidraw';

/**
 * A drawing, full window, in Excalidraw. It saves itself like a note: a moment after each change,
 * and when you click Done. A new drawing's file is only created once something is drawn.
 */
export function DrawingEditor(props: {
  path: string;
  /** False for a drawing that doesn't exist on disk yet. */
  exists: boolean;
  theme: 'light' | 'dark';
  readText: (path: string) => Promise<string>;
  writeText: (path: string, text: string) => Promise<void>;
  /** After each save; `first` is the save that created the file. */
  onSaved: (path: string, first: boolean) => void;
  onClose: () => void;
  notify: (msg: string) => void;
}) {
  let host!: HTMLDivElement;
  let drawing: MountedDrawing | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onDisk = props.exists;
  let saving: Promise<void> = Promise.resolve();
  const [status, setStatus] = createSignal<'loading' | 'ready' | 'saving' | 'saved' | 'error'>('loading');
  const [error, setError] = createSignal<string | null>(null);

  const save = () => {
    saving = saving.then(async () => {
      if (!drawing || !drawing.changed()) return;
      setStatus('saving');
      try {
        await props.writeText(props.path, await drawing.serialize());
        const first = !onDisk;
        onDisk = true;
        setStatus('saved');
        props.onSaved(props.path, first);
      } catch (e) {
        setStatus('error');
        props.notify(`Couldn’t save the drawing: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    return saving;
  };
  const scheduleSave = () => {
    clearTimeout(timer);
    setStatus('saving');
    timer = setTimeout(() => void save(), 900);
  };
  const done = async () => {
    clearTimeout(timer);
    await save();
    props.onClose();
  };

  onMount(async () => {
    try {
      const text = props.exists ? await props.readText(props.path) : null;
      const { mountDrawing } = await import('../drawing/excalidraw');
      drawing = await mountDrawing(host, { text, json: !/\.svg$/i.test(props.path), theme: props.theme, onChange: scheduleSave });
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  });
  createEffect(() => drawing?.setTheme(props.theme));
  onCleanup(() => {
    clearTimeout(timer);
    drawing?.unmount();
  });

  const statusText = () =>
    ({ loading: 'Opening…', ready: onDisk ? 'Saved' : 'Draw something to create the file', saving: 'Saving…', saved: 'Saved', error: 'Not saved' })[status()];

  return (
    <div class="drawing-editor" role="dialog" aria-label={`Drawing ${drawingTitle(props.path)}`}>
      <header class="drawing-head">
        <div class="quickview-title">
          <strong>{drawingTitle(props.path)}</strong>
          <span title={props.path}>
            {dirname(props.path)} · {statusText()}
          </span>
        </div>
        <button class="btn btn-small btn-primary" onClick={() => void done()}>
          Done
        </button>
      </header>
      <Show when={error()}>
        <div class="drawing-error">
          <p>
            <strong>This drawing couldn’t be opened.</strong>
          </p>
          <p>{error()}</p>
        </div>
      </Show>
      <div class="drawing-canvas" ref={host} />
    </div>
  );
}
