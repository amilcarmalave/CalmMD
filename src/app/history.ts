import { sha256Hex } from '../core/assets';
import { isWithin, pathKey, rebase } from '../core/paths';
import type { Platform } from '../platform/types';

/**
 * File history (a Supporter extra): saved versions of a file, kept in the app's own data folder
 * (the kv store), never next to the user's files.
 *
 * Storage: `history/map` maps each file (by `pathKey`) to a random id, so renames only touch the
 * map. `history/<id>/index` lists the versions; `history/<id>/<version>` holds each text.
 */
export interface Version {
  id: string;
  savedAt: number;
  /** Set for versions saved with Save Version and a name; those are never pruned. */
  name: string | null;
  /** Characters. */
  size: number;
  hash: string;
}

/** Unnamed versions kept per file; older ones are removed as new ones arrive. */
export const HISTORY_KEEP_UNNAMED = 50;

const MAP = 'history/map';
type FileMap = Record<string, { id: string; path: string }>;

const newId = () => Math.random().toString(36).slice(2, 10);
const hashText = (text: string) => sha256Hex(new TextEncoder().encode(text));

export type History = ReturnType<typeof createHistory>;

export function createHistory(deps: { platform: Platform; now?: () => number }) {
  const { platform } = deps;
  const now = deps.now ?? Date.now;
  // One change at a time, so two saves never race on the same index.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => undefined);
    return run;
  };

  const readJson = async <T>(key: string, fallback: T): Promise<T> => {
    try {
      const raw = await platform.kvGet(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const readMap = () => readJson<FileMap>(MAP, {});
  const indexKey = (fileId: string) => `history/${fileId}/index`;
  const textKey = (fileId: string, id: string) => `history/${fileId}/${id}`;
  const readIndex = async (fileId: string) => {
    const list = await readJson<Version[]>(indexKey(fileId), []);
    return Array.isArray(list) ? list : [];
  };

  async function fileIdOf(path: string, create: boolean): Promise<string | null> {
    const map = await readMap();
    const hit = map[pathKey(path)];
    if (hit) return hit.id;
    if (!create) return null;
    const id = newId();
    map[pathKey(path)] = { id, path };
    await platform.kvSet(MAP, JSON.stringify(map));
    return id;
  }

  /** Versions of a file, newest first. */
  async function list(path: string): Promise<Version[]> {
    const fileId = await fileIdOf(path, false);
    return fileId ? (await readIndex(fileId)).slice().sort((a, b) => b.savedAt - a.savedAt) : [];
  }

  async function read(path: string, id: string): Promise<string | null> {
    const fileId = await fileIdOf(path, false);
    return fileId ? platform.kvGet(textKey(fileId, id)).catch(() => null) : null;
  }

  /**
   * Saves a version. Without a name, nothing is saved when the text equals the latest version.
   * Resolves to the new version, or null when it was skipped.
   */
  function save(path: string, text: string, name?: string | null): Promise<Version | null> {
    return serial(async () => {
      const hash = await hashText(text);
      const fileId = (await fileIdOf(path, true))!;
      const index = await readIndex(fileId);
      const latest = index.reduce<Version | null>((a, v) => (!a || v.savedAt > a.savedAt ? v : a), null);
      const label = name?.trim() || null;
      if (!label && latest?.hash === hash) return null;
      let savedAt = now();
      if (latest && savedAt <= latest.savedAt) savedAt = latest.savedAt + 1;
      const version: Version = { id: savedAt.toString(36) + newId().slice(0, 4), savedAt, name: label, size: text.length, hash };
      await platform.kvSet(textKey(fileId, version.id), text);
      const next = [...index, version];
      // Prune the oldest unnamed versions beyond the limit.
      const unnamed = next.filter((v) => !v.name).sort((a, b) => b.savedAt - a.savedAt);
      const drop = new Set(unnamed.slice(HISTORY_KEEP_UNNAMED).map((v) => v.id));
      for (const id of drop) await platform.kvDelete(textKey(fileId, id));
      await platform.kvSet(indexKey(fileId), JSON.stringify(next.filter((v) => !drop.has(v.id))));
      return version;
    });
  }

  function remove(path: string, id: string): Promise<void> {
    return serial(async () => {
      const fileId = await fileIdOf(path, false);
      if (!fileId) return;
      const index = await readIndex(fileId);
      await platform.kvDelete(textKey(fileId, id));
      await platform.kvSet(indexKey(fileId), JSON.stringify(index.filter((v) => v.id !== id)));
    });
  }

  /** A file or folder was renamed or moved in the app: its history moves with it. */
  function rename(from: string, to: string): Promise<void> {
    return serial(async () => {
      const map = await readMap();
      let changed = false;
      for (const [key, entry] of Object.entries(map)) {
        if (!isWithin(entry.path, from)) continue;
        const path = rebase(entry.path, from, to);
        delete map[key];
        map[pathKey(path)] = { id: entry.id, path };
        changed = true;
      }
      if (changed) await platform.kvSet(MAP, JSON.stringify(map));
    });
  }

  return { list, read, save, remove, rename };
}
