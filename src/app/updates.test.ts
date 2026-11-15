import { describe, expect, it } from 'vitest';
import { CHECK_EVERY_MS, compareVersions, isCheckDue, parseRelease, shouldAnnounce } from './updates';

describe('updates', () => {
  it('compares versions by number, not text', () => {
    expect(compareVersions('1.10.0', '1.9.2')).toBe(1);
    expect(compareVersions('v1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('2.0.0-beta.1', '1.9.0')).toBe(1);
  });

  it('reads a published release and ignores drafts, pre-releases and odd answers', () => {
    const ok = { tag_name: 'v1.1.0', html_url: 'https://github.com/amilcarmalave/CalmMD/releases/tag/v1.1.0' };
    expect(parseRelease(ok)).toEqual({ version: '1.1.0', url: ok.html_url });
    expect(parseRelease({ ...ok, prerelease: true })).toBeNull();
    expect(parseRelease({ ...ok, draft: true })).toBeNull();
    expect(parseRelease({ ...ok, html_url: 'https://evil.example/x' })).toBeNull();
    expect(parseRelease({ message: 'Not Found' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });

  it('announces a newer version once', () => {
    const r = { version: '1.1.0', url: 'https://github.com/x' };
    expect(shouldAnnounce(r, '1.0.0', null)).toBe(true);
    expect(shouldAnnounce(r, '1.0.0', '1.1.0')).toBe(false);
    expect(shouldAnnounce({ ...r, version: '1.2.0' }, '1.0.0', '1.1.0')).toBe(true);
    expect(shouldAnnounce(r, '1.1.0', null)).toBe(false);
    expect(shouldAnnounce(null, '1.0.0', null)).toBe(false);
  });

  it('checks about once a day', () => {
    expect(isCheckDue(null, 1000)).toBe(true);
    expect(isCheckDue(1000, 1000 + CHECK_EVERY_MS - 1)).toBe(false);
    expect(isCheckDue(1000, 1000 + CHECK_EVERY_MS)).toBe(true);
    expect(isCheckDue(5000, 1000)).toBe(true); // clock went backwards
  });
});
