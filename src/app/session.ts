/**
 * Per-window session: open tabs (with cursor and scroll), the explorer root and expanded
 * folders, and the sidebar layout. M6 wraps this into named Spaces.
 */

export type SidebarView = 'files' | 'outline' | 'search';

export interface SessionTab {
  /** A file on disk. */
  path?: string;
  /** An untitled draft, stored under `draft/<id>`. */
  draftId?: string;
  /** Cursor offset. */
  cursor: number;
  /** 0-based line at the top of the viewport. */
  topLine: number;
}

export interface Session {
  v: 1;
  tabs: SessionTab[];
  active: number;
  root: string | null;
  expanded: string[];
  sidebar: { open: boolean; view: SidebarView; width: number };
  /** Per-window view mode. Falls back to the global default when absent. */
  viewMode?: 'source' | 'live' | 'split' | 'preview';
}

export const DEFAULT_SESSION: Session = {
  v: 1,
  tabs: [],
  active: 0,
  root: null,
  expanded: [],
  sidebar: { open: true, view: 'files', width: 248 },
};

const num = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : fallback);

/** Parses stored session JSON defensively. A bad session must never stop the app from starting. */
export function parseSession(raw: string | null): Session {
  if (!raw) return structuredClone(DEFAULT_SESSION);
  let s: Partial<Session>;
  try {
    s = JSON.parse(raw);
  } catch {
    return structuredClone(DEFAULT_SESSION);
  }
  const tabs: SessionTab[] = Array.isArray(s.tabs)
    ? s.tabs
        .filter((t): t is SessionTab => !!t && (typeof t.path === 'string' || typeof t.draftId === 'string'))
        .map((t) => ({
          ...(typeof t.path === 'string' ? { path: t.path } : { draftId: t.draftId }),
          cursor: Math.floor(num(t.cursor, 0)),
          topLine: Math.floor(num(t.topLine, 0)),
        }))
    : [];
  const sb = (s.sidebar ?? {}) as Partial<Session['sidebar']>;
  return {
    v: 1,
    tabs,
    active: Math.min(Math.floor(num(s.active, 0)), Math.max(0, tabs.length - 1)),
    root: typeof s.root === 'string' && s.root ? s.root : null,
    expanded: Array.isArray(s.expanded) ? s.expanded.filter((e): e is string => typeof e === 'string') : [],
    sidebar: {
      open: typeof sb.open === 'boolean' ? sb.open : DEFAULT_SESSION.sidebar.open,
      view: sb.view === 'outline' || sb.view === 'search' ? sb.view : 'files',
      width: Math.min(480, Math.max(180, num(sb.width, DEFAULT_SESSION.sidebar.width))),
    },
    ...(s.viewMode && ['source', 'live', 'split', 'preview'].includes(s.viewMode) ? { viewMode: s.viewMode } : {}),
  };
}
