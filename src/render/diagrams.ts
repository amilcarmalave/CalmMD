/**
 * Mermaid diagrams, rendered lazily: the Mermaid bundle is large, so it's only loaded when a
 * document contains a ```mermaid block. Results are cached by (theme, source), so re-renders while
 * typing elsewhere are instant and the preview DOM stays stable.
 */
export interface DiagramResult {
  svg?: string;
  error?: string;
}

type Mermaid = (typeof import('mermaid'))['default'];

let mermaidP: Promise<Mermaid> | null = null;
const cache = new Map<string, DiagramResult>();
const waiting = new Map<string, Set<() => void>>();
let queue: Promise<unknown> = Promise.resolve();
let counter = 0;
let configured: string | null = null;

const keyOf = (code: string, theme: 'light' | 'dark') => theme + '\u0000' + code;

function load(): Promise<Mermaid> {
  return (mermaidP ??= import('mermaid').then((m) => m.default));
}

async function renderNow(code: string, theme: 'light' | 'dark'): Promise<DiagramResult> {
  const mermaid = await load();
  if (configured !== theme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'neutral',
      fontFamily: "'Inter Variable', system-ui, sans-serif",
      // SVG text instead of HTML labels: self-contained, and it survives export and printing.
      htmlLabels: false,
      // Explicitly the classic layout: the ELK engine (elkjs, EPL/GPL) isn't shipped (see elk-stub.ts).
      layout: 'dagre',
      flowchart: { htmlLabels: false, curve: 'basis' },
    });
    configured = theme;
  }
  try {
    const { svg } = await mermaid.render(`calmmd-diagram-${++counter}`, code);
    return { svg };
  } catch (e) {
    // Mermaid leaves its error element in the body on failure.
    document.getElementById(`dcalmmd-diagram-${counter}`)?.remove();
    return { error: e instanceof Error ? e.message.split('\n')[0] : String(e) };
  }
}

/**
 * The rendered diagram if it's ready, otherwise null. Rendering starts in the background, and
 * `onReady` is called when it's done.
 */
export function diagramFor(code: string, theme: 'light' | 'dark', onReady?: () => void): DiagramResult | null {
  const key = keyOf(code, theme);
  const hit = cache.get(key);
  if (hit) return hit;
  let listeners = waiting.get(key);
  if (!listeners) {
    listeners = new Set();
    waiting.set(key, listeners);
    // Mermaid isn't safe to run concurrently, so serialise renders.
    queue = queue.then(async () => {
      const result = await renderNow(code, theme);
      cache.set(key, result);
      const fns = waiting.get(key);
      waiting.delete(key);
      for (const fn of fns ?? []) fn();
    });
  }
  if (onReady) listeners.add(onReady);
  return null;
}

/** Renders every diagram in a document (exports need them all up front). */
export async function prerenderDiagrams(markdown: string, theme: 'light' | 'dark'): Promise<void> {
  const blocks = [...markdown.matchAll(/^ {0,3}(`{3,}|~{3,})\s*mermaid\b[^\n]*\n([\s\S]*?)\n {0,3}\1\s*$/gm)].map((m) => m[2]);
  await Promise.all(blocks.map((code) => new Promise<void>((resolve) => (diagramFor(code, theme, resolve) ? resolve() : undefined))));
}

/** Test hook. */
export function _seedDiagram(code: string, theme: 'light' | 'dark', result: DiagramResult) {
  cache.set(keyOf(code, theme), result);
}
