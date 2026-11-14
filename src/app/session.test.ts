import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION, parseSession } from './session';

describe('parseSession', () => {
  it('returns defaults for missing or corrupt input', () => {
    expect(parseSession(null)).toEqual(DEFAULT_SESSION);
    expect(parseSession('{{')).toEqual(DEFAULT_SESSION);
    expect(parseSession('42')).toEqual(DEFAULT_SESSION);
  });

  it('keeps valid tabs and drops malformed ones', () => {
    const s = parseSession(
      JSON.stringify({
        tabs: [{ path: '/a.md', cursor: 12, topLine: 3 }, { nope: 1 }, null, { draftId: 'x1', cursor: -4, topLine: 'a' }],
        active: 7,
      }),
    );
    expect(s.tabs).toEqual([
      { path: '/a.md', cursor: 12, topLine: 3 },
      { draftId: 'x1', cursor: 0, topLine: 0 },
    ]);
    expect(s.active).toBe(1); // clamped to the last tab
  });

  it('clamps sidebar values', () => {
    const s = parseSession(JSON.stringify({ sidebar: { open: true, view: 'outline', width: 9999 }, root: '/r', expanded: ['/r/a', 3] }));
    expect(s.sidebar).toEqual({ open: true, view: 'outline', width: 480 });
    expect(s.root).toBe('/r');
    expect(s.expanded).toEqual(['/r/a']);
  });
});
