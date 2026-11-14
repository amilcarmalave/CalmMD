import { describe, expect, it } from 'vitest';
import { createMemoryPlatform } from '../platform/memory';
import { createHistory, HISTORY_KEEP_UNNAMED } from './history';

const setup = () => {
  let t = 1_000;
  const platform = createMemoryPlatform();
  const history = createHistory({ platform, now: () => (t += 1000) });
  return { platform, history };
};

describe('file history', () => {
  it('saves versions newest first and reads them back', async () => {
    const { history } = setup();
    await history.save('/n/a.md', 'one');
    await history.save('/n/a.md', 'two', 'Sent to Sam');
    const list = await history.list('/n/a.md');
    expect(list.map((v) => [v.name, v.size])).toEqual([
      ['Sent to Sam', 3],
      [null, 3],
    ]);
    expect(await history.read('/n/a.md', list[1].id)).toBe('one');
    expect(await history.list('/n/other.md')).toEqual([]);
  });

  it('skips a version identical to the latest one', async () => {
    const { history } = setup();
    expect(await history.save('/n/a.md', 'same')).not.toBeNull();
    expect(await history.save('/n/a.md', 'same')).toBeNull();
    expect(await history.list('/n/a.md')).toHaveLength(1);
  });

  it('still saves a named version of unchanged text', async () => {
    const { history } = setup();
    await history.save('/n/a.md', 'same');
    expect(await history.save('/n/a.md', 'same', 'Final')).not.toBeNull();
  });

  it(`keeps the ${HISTORY_KEEP_UNNAMED} newest unnamed versions and every named one`, async () => {
    const { history, platform } = setup();
    await history.save('/n/a.md', 'first', 'Named');
    for (let i = 0; i < HISTORY_KEEP_UNNAMED + 5; i++) await history.save('/n/a.md', `v${i}`);
    const list = await history.list('/n/a.md');
    expect(list.filter((v) => !v.name)).toHaveLength(HISTORY_KEEP_UNNAMED);
    expect(list.at(-1)!.name).toBe('Named');
    expect(list[0].size).toBe(`v${HISTORY_KEEP_UNNAMED + 4}`.length);
    // Pruned texts are gone from storage too.
    const keys = await platform.kvList('history/');
    expect(keys.filter((k) => !k.endsWith('/index') && k !== 'history/map')).toHaveLength(HISTORY_KEEP_UNNAMED + 1);
  });

  it('follows renames of files and folders', async () => {
    const { history } = setup();
    await history.save('/n/a.md', 'one');
    await history.save('/n/sub/b.md', 'two');
    await history.rename('/n/a.md', '/n/c.md');
    await history.rename('/n/sub', '/n/moved');
    expect(await history.list('/n/a.md')).toEqual([]);
    expect(await history.list('/n/c.md')).toHaveLength(1);
    expect(await history.list('/n/moved/b.md')).toHaveLength(1);
  });

  it('deletes one version', async () => {
    const { history } = setup();
    await history.save('/n/a.md', 'one');
    const v = await history.save('/n/a.md', 'two');
    await history.remove('/n/a.md', v!.id);
    expect((await history.list('/n/a.md')).map((x) => x.size)).toEqual([3]);
    expect(await history.read('/n/a.md', v!.id)).toBeNull();
  });
});
