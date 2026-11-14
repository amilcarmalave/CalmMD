export type SaveStatus = 'clean' | 'dirty' | 'saving' | 'error';

export interface AutosaverOptions {
  /** Persists the *current* content. It must read the latest text when called. */
  save: () => Promise<void>;
  /** Save after this much idle time following the last edit. */
  idleMs?: number;
  /** Save at least this often while the user keeps typing. */
  maxWaitMs?: number;
  /** Delays between retries after a failed save. The last value repeats. */
  retryDelaysMs?: number[];
  onStatus?: (status: SaveStatus, error: unknown) => void;
}

/**
 * Debounced, serialised autosave driven by a revision counter.
 *
 * - `touch()` after every edit. A save runs `idleMs` after the last touch, or at most
 *   `maxWaitMs` after the first unsaved touch.
 * - Only one save runs at a time. Edits made during a save schedule another one.
 * - Failed saves keep the content dirty and retry with backoff.
 * - `flush()` saves immediately and resolves to whether everything is persisted.
 */
export class Autosaver {
  private rev = 0;
  private savedRev = 0;
  private firstDirtyAt: number | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryIndex = 0;
  private inflight: Promise<void> | null = null;
  private lastError: unknown = null;
  private disposed = false;
  private currentStatus: SaveStatus = 'clean';

  private readonly idleMs: number;
  private readonly maxWaitMs: number;
  private readonly retryDelaysMs: number[];

  constructor(private readonly opts: AutosaverOptions) {
    this.idleMs = opts.idleMs ?? 1000;
    this.maxWaitMs = opts.maxWaitMs ?? 10000;
    this.retryDelaysMs = opts.retryDelaysMs ?? [1000, 3000, 10000, 30000];
  }

  get status(): SaveStatus {
    return this.currentStatus;
  }

  get isDirty(): boolean {
    return this.rev !== this.savedRev;
  }

  touch(): void {
    if (this.disposed) return;
    this.rev++;
    if (this.firstDirtyAt === null) this.firstDirtyAt = Date.now();
    this.scheduleIdle();
    this.emit();
  }

  /** Mark the current content as persisted, for example after loading from disk. */
  markSaved(): void {
    this.savedRev = this.rev;
    this.firstDirtyAt = null;
    this.lastError = null;
    this.clearTimers();
    this.emit();
  }

  async flush(): Promise<boolean> {
    this.clearTimers();
    await this.run();
    // Edits made while an earlier save was in flight are saved too.
    while (this.isDirty && !this.lastError && !this.disposed) await this.run();
    return !this.isDirty;
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  private scheduleIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const elapsed = Date.now() - (this.firstDirtyAt ?? Date.now());
    const delay = Math.max(0, Math.min(this.idleMs, this.maxWaitMs - elapsed));
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.run();
    }, delay);
  }

  private async run(): Promise<void> {
    if (this.inflight) {
      await this.inflight;
      return;
    }
    if (!this.isDirty || this.disposed) return;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const target = this.rev;
    this.firstDirtyAt = null;
    this.currentStatus = 'saving';
    this.notify();

    this.inflight = (async () => {
      try {
        await this.opts.save();
        this.savedRev = Math.max(this.savedRev, target);
        this.lastError = null;
        this.retryIndex = 0;
      } catch (err) {
        this.lastError = err;
        this.scheduleRetry();
      } finally {
        this.inflight = null;
      }
    })();
    await this.inflight;

    // Touches during the save already scheduled a follow-up save, but the timer
    // may have fired while we were in flight. Make sure one is pending.
    if (this.isDirty && !this.lastError && !this.idleTimer && !this.disposed) {
      if (this.firstDirtyAt === null) this.firstDirtyAt = Date.now();
      this.scheduleIdle();
    }
    this.emit();
  }

  private scheduleRetry(): void {
    if (this.disposed) return;
    const delays = this.retryDelaysMs;
    const delay = delays[Math.min(this.retryIndex, delays.length - 1)];
    this.retryIndex++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.run();
    }, delay);
  }

  private clearTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.idleTimer = null;
    this.retryTimer = null;
  }

  private emit(): void {
    if (this.inflight) return; // 'saving' stays visible until the save settles
    this.currentStatus = this.lastError && this.isDirty ? 'error' : this.isDirty ? 'dirty' : 'clean';
    this.notify();
  }

  private notify(): void {
    this.opts.onStatus?.(this.currentStatus, this.currentStatus === 'error' ? this.lastError : null);
  }
}
