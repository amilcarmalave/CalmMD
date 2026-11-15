import { describe, expect, it } from 'vitest';
import { withAssetVersions } from './assetVersions';
import { createMemoryPlatform } from './memory';

describe('withAssetVersions', () => {
  it('adds a version to a file URL after the file changes', () => {
    const { platform, changed } = withAssetVersions(createMemoryPlatform());
    expect(platform.assetUrl('/n/a.svg')).toBe('/n/a.svg');
    changed('/n/a.svg');
    changed('/n/a.svg');
    expect(platform.assetUrl('/n/a.svg')).toBe('/n/a.svg?v=2');
    expect(platform.assetUrl('/n/b.svg')).toBe('/n/b.svg');
  });
});
