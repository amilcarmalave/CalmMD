/**
 * The Excalidraw editor, mounted with React inside CalmMD's Solid UI. This module (and React) loads
 * only when a drawing is opened. No JSX here: the app's JSX is compiled for Solid.
 *
 * Files: `.excalidraw.svg` is an SVG picture with the scene embedded (exportEmbedScene), so it shows
 * everywhere and opens again for editing. `.excalidraw` is Excalidraw's own JSON.
 */
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
  }
}
// Fonts come from the app (vite.config.ts serves and bundles them), never from a CDN.
window.EXCALIDRAW_ASSET_PATH = '/excalidraw/';

import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { convertToExcalidrawElements, Excalidraw, exportToSvg, loadFromBlob, serializeAsJSON } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

type Api = Parameters<NonNullable<Parameters<typeof Excalidraw>[0]['excalidrawAPI']>>[0];

export interface DrawingEditorOptions {
  /** The file's current text, or null for a new drawing. */
  text: string | null;
  /** `.excalidraw.svg` or `.excalidraw`: which format to save. */
  json: boolean;
  theme: 'light' | 'dark';
  /** Called (debounced by the caller) whenever the drawing changes. */
  onChange: () => void;
}

export interface MountedDrawing {
  /** The file contents for the current drawing. */
  serialize(): Promise<string>;
  /** True once something has been drawn or changed since opening. */
  changed(): boolean;
  setTheme(theme: 'light' | 'dark'): void;
  unmount(): void;
}

export async function mountDrawing(el: HTMLElement, opts: DrawingEditorOptions): Promise<MountedDrawing> {
  let initialData: Awaited<ReturnType<typeof loadFromBlob>> | null = null;
  if (opts.text) {
    const type = opts.json ? 'application/json' : 'image/svg+xml';
    initialData = await loadFromBlob(new Blob([opts.text], { type }), null, null);
  }
  let api: Api | null = null;
  let version = -1;
  let baseline: number | null = null;
  let theme = opts.theme;
  const root: Root = createRoot(el);

  const sceneVersion = () =>
    (api?.getSceneElementsIncludingDeleted() ?? []).reduce((sum, e) => sum + e.version + (e.isDeleted ? 1 : 0), 0);

  const render = () =>
    root.render(
      createElement(Excalidraw, {
        initialData: initialData ? { ...initialData, scrollToContent: true } : { appState: { viewBackgroundColor: '#ffffff' } },
        theme,
        excalidrawAPI: (a: Api) => {
          api = a;
          // Dev builds and the browser demo (?demo): reachable from the console and browser checks.
          if (import.meta.env.DEV || location.search.includes('demo'))
            Object.assign(window, { __excalidraw: a, __excalidrawConvert: convertToExcalidrawElements });
        },
        onChange: () => {
          const v = sceneVersion();
          if (baseline === null) baseline = v;
          if (v !== version) {
            version = v;
            if (v !== baseline) opts.onChange();
          }
        },
        UIOptions: {
          canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false, toggleTheme: false },
        },
      }),
    );
  render();

  return {
    async serialize() {
      if (!api) throw new Error('The drawing editor isn’t ready yet');
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      if (opts.json) return serializeAsJSON(elements, appState, files, 'local');
      const svg = await exportToSvg({
        elements,
        appState: { ...appState, exportEmbedScene: true, exportBackground: true, exportWithDarkMode: false },
        files,
        exportPadding: 16,
      });
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
    },
    changed: () => baseline !== null && version !== baseline,
    setTheme(t) {
      theme = t;
      render();
    },
    unmount: () => root.unmount(),
  };
}
