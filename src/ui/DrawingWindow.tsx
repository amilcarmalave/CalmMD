import { createResource, createSignal, onCleanup, Show } from 'solid-js';
import { drawingTitle } from '../core/drawings';
import { createSettings } from '../app/settings';
import type { Platform } from '../platform/types';
import { DrawingEditor } from './DrawingEditor';

/**
 * A desktop window that holds one drawing (opened with platform.openDrawingWindow). Saving tells the
 * other windows, so notes showing the drawing reload it and a note waiting for a new drawing links it.
 */
export function DrawingWindow(props: { platform: Platform; path: string }) {
  const { platform } = props;
  const { settings, load } = createSettings(platform);
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const [systemDark, setSystemDark] = createSignal(media.matches);
  const onMedia = (e: MediaQueryListEvent) => setSystemDark(e.matches);
  media.addEventListener('change', onMedia);
  onCleanup(() => media.removeEventListener('change', onMedia));

  const [ready] = createResource(async () => {
    await load().catch(() => false);
    const exists = !!(await platform.stat(props.path).catch(() => null));
    return { exists };
  });
  const scheme = (): 'light' | 'dark' =>
    settings.colorScheme === 'system' ? (systemDark() ? 'dark' : 'light') : settings.colorScheme;
  const applyTheme = () => {
    const root = document.documentElement;
    root.dataset.theme = scheme();
    root.dataset.colorTheme = scheme() === 'dark' ? settings.darkTheme : settings.lightTheme;
  };

  let flush: () => Promise<void> = async () => {};
  platform.onCloseRequested(() => flush());
  void platform.setWindowTitle(`${drawingTitle(props.path)} — CalmMD`);

  const [message, setMessage] = createSignal<string | null>(null);

  return (
    <Show when={ready()}>
      {(r) => {
        applyTheme();
        return (
          <>
            <DrawingEditor
              path={props.path}
              exists={r().exists}
              theme={scheme()}
              readText={(p) => platform.readTextFile(p).then((x) => x.text)}
              writeText={(p, text) => platform.writeTextFile(p, text).then(() => undefined)}
              onSaved={(path, first) => platform.broadcast('drawing-saved', { path, first })}
              onClose={() => void platform.closeWindow()}
              notify={(m) => setMessage(m)}
              onFlush={(f) => (flush = f)}
            />
            <Show when={message()}>
              <div class="drawing-error drawing-message" role="status" onClick={() => setMessage(null)}>
                {message()}
              </div>
            </Show>
          </>
        );
      }}
    </Show>
  );
}
