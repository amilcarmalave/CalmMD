import { describe, expect, it } from 'vitest';
import { createMemoryPlatform } from './memory';
import { notifySavedFiles } from './savedFiles';

describe('notifySavedFiles', () => {
  it('reports a file chosen in a save dialog once it is written, and only then', async () => {
    const created: string[] = [];
    const platform = notifySavedFiles(createMemoryPlatform({ files: { '/n/a.md': 'a' }, pickSave: async () => '/n/new.md' }), (p) =>
      created.push(p),
    );
    await platform.writeTextFile('/n/a.md', 'autosave');
    const path = await platform.saveFileDialog('new.md');
    expect(created).toEqual([]);
    await platform.writeTextFile(path!, 'hello');
    await platform.writeTextFile(path!, 'hello again');
    expect(created).toEqual(['/n/new.md']);
    expect(await platform.readTextFile('/n/new.md')).toMatchObject({ text: 'hello again' });
    expect(platform.kind).toBe('memory');
  });
});
