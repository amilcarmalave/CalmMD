import type { SaveStatus } from '../core/autosave';
import type { Eol } from '../core/text';

/** Durable draft record. The shape matches the Rust `core::buffers::DraftRecord`. */
export interface BufferDraft {
  v: 1;
  owner?: string;
  text: string;
  untitledIndex: number;
  /** Set when the draft holds edits that conflicted with a file on disk. */
  path?: string | null;
  updatedAt: number;
}

export interface BufferDraftEntry {
  id: string;
  record: BufferDraft;
}

/** Current buffer state handed to the Rust autosave service. */
export interface BufferPersistRequest {
  id: string;
  owner?: string;
  untitledIndex: number;
  path: string | null;
  text: string;
  eol: Eol;
  bom: boolean;
  mtimeMs: number | null;
  conflict: boolean;
}

export interface BufferPersistResult {
  mtimeMs: number | null;
  conflict: boolean;
  wrote: boolean;
  draft?: BufferDraft | null;
}

/** One edit reported to the Rust autosave scheduler. */
export interface BufferAutosaveRequest extends BufferPersistRequest {
  idleMs?: number;
  maxWaitMs?: number;
  retryDelaysMs?: number[];
}

export interface BufferAutosaveState {
  id: string;
  status: SaveStatus;
  dirty: boolean;
  conflict: boolean;
  mtimeMs: number | null;
  lastError: string | null;
}

export interface BufferAutosaveEvent {
  kind: 'status' | 'saved';
  state: BufferAutosaveState;
}

/** Disk content decoded the same way as `decodeFromDisk`. */
export interface BufferFile {
  text: string;
  eol: Eol;
  bom: boolean;
  mtimeMs: number;
}
