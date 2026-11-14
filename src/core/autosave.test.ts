import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autosaver, type SaveStatus } from './autosave';

function setup(opts: { failTimes?: number; saveDelayMs?: number } = {}) {
  let failures = opts.failTimes ?? 0;
  const statuses: SaveStatus[] = [];
  const save = vi.fn(async () => {
    if (opts.saveDelayMs) await new Promise((r) => setTimeout(r, opts.saveDelayMs));
    if (failures > 0) {
      failures--;
      throw new Error('disk full');
    }
  });
  const a = new Autosaver({
    save,
    idleMs: 1000,
    maxWaitMs: 10000,
    retryDelaysMs: [500, 2000],
    onStatus: (s) => statuses.push(s),
  });
  return { a, save, statuses };
}

describe('Autosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces bursts of edits into one save after the idle period', async () => {
    const { a, save } = setup();
    a.touch();
    await vi.advanceTimersByTimeAsync(500);
    a.touch();
    await vi.advanceTimersByTimeAsync(900);
    expect(save).not.toHaveBeenCalled();
    a.touch();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.status).toBe('clean');
  });

  it('saves at least every maxWait while typing continuously', async () => {
    const { a, save } = setup();
    for (let t = 0; t < 12000; t += 300) {
      a.touch();
      await vi.advanceTimersByTimeAsync(300);
    }
    // One forced save around t=10s; the idle save is still pending.
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(a.isDirty).toBe(false);
  });

  it('flush saves immediately and reports success', async () => {
    const { a, save } = setup();
    a.touch();
    await expect(a.flush()).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1); // no duplicate save from the idle timer
  });

  it('flush on a clean document does nothing', async () => {
    const { a, save } = setup();
    await expect(a.flush()).resolves.toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  it('never runs two saves at once and re-saves edits made during a save', async () => {
    const { a, save } = setup({ saveDelayMs: 300 });
    let concurrent = 0;
    let maxConcurrent = 0;
    save.mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 300));
      concurrent--;
    });
    a.touch();
    await vi.advanceTimersByTimeAsync(1100); // save in flight
    expect(a.status).toBe('saving');
    a.touch(); // edit during the save
    const flushed = a.flush();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(flushed).resolves.toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(maxConcurrent).toBe(1);
    expect(a.status).toBe('clean');
  });

  it('keeps content dirty on failure and retries with backoff', async () => {
    const { a, save, statuses } = setup({ failTimes: 2 });
    a.touch();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.status).toBe('error');
    expect(a.isDirty).toBe(true);
    await vi.advanceTimersByTimeAsync(500); // first retry fails
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); // second retry succeeds
    expect(save).toHaveBeenCalledTimes(3);
    expect(a.status).toBe('clean');
    expect(statuses).toContain('error');
  });

  it('flush reports failure when the save fails', async () => {
    const { a } = setup({ failTimes: 1 });
    a.touch();
    await expect(a.flush()).resolves.toBe(false);
    expect(a.status).toBe('error');
  });

  it('markSaved clears dirtiness without saving', async () => {
    const { a, save } = setup();
    a.touch();
    a.markSaved();
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).not.toHaveBeenCalled();
    expect(a.status).toBe('clean');
  });

  it('dispose cancels pending saves', async () => {
    const { a, save } = setup();
    a.touch();
    a.dispose();
    await vi.advanceTimersByTimeAsync(20000);
    expect(save).not.toHaveBeenCalled();
  });
});
