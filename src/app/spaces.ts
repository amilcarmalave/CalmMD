import type { Platform } from '../platform/types';
import { parseSession, type Session } from './session';

/**
 * A Space is a named, saved window setup: root folder, open tabs (with cursors), expanded
 * folders, sidebar layout and view mode. Stored as one kv record per Space (`space/<id>`).
 */
export interface SpaceRecord {
  v: 1;
  id: string;
  name: string;
  createdAt: number;
  lastOpened: number;
  session: Session;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function parseSpace(raw: string | null): SpaceRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<SpaceRecord>;
    if (r.v !== 1 || typeof r.id !== 'string' || typeof r.name !== 'string') return null;
    return {
      v: 1,
      id: r.id,
      name: r.name.trim() || 'Untitled Space',
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
      lastOpened: typeof r.lastOpened === 'number' ? r.lastOpened : 0,
      session: parseSession(JSON.stringify(r.session ?? null)),
    };
  } catch {
    return null;
  }
}

export type Spaces = ReturnType<typeof createSpaces>;

export function createSpaces(platform: Platform, onChange: () => void = () => {}) {
  async function get(id: string) {
    return platform.spaceGet(id);
  }
  async function save(rec: SpaceRecord, notify = true) {
    await platform.spaceSave(rec);
    if (notify) onChange();
  }
  return {
    get,
    save,
    /** All Spaces, most recently opened first. */
    list: () => platform.spaces(),
    async create(name: string, session: Session): Promise<SpaceRecord> {
      const now = Date.now();
      const rec: SpaceRecord = { v: 1, id: newId(), name: name.trim() || 'Untitled Space', createdAt: now, lastOpened: now, session };
      await save(rec);
      return rec;
    },
    async rename(id: string, name: string) {
      const rec = await get(id);
      if (rec) await save({ ...rec, name: name.trim() || rec.name });
    },
    /** Forgets a Space. Files on disk are never touched. */
    async remove(id: string) {
      await platform.spaceRemove(id);
      onChange();
    },
    /** Saves the session of an open Space (frequent, so it doesn't notify other windows). */
    async saveSession(id: string, session: Session) {
      const rec = await get(id);
      if (rec) await save({ ...rec, session, lastOpened: Date.now() }, false);
    },
  };
}
