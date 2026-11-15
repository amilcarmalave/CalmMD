import { pathKey } from '../core/paths';
import type { Platform } from './types';

/**
 * File URLs that change when the file does: after `changed(path)`, assetUrl adds `?v=<n>` so the
 * webview loads the new file instead of its cached copy (a drawing that was just saved, say).
 */
export function withAssetVersions(platform: Platform): { platform: Platform; changed: (path: string) => void } {
  const versions = new Map<string, number>();
  const wrapped = Object.assign(Object.create(platform) as Platform, {
    assetUrl: (absPath: string) => {
      const url = platform.assetUrl(absPath);
      const v = versions.get(pathKey(absPath));
      if (!v || url.startsWith('data:')) return url;
      return `${url}${url.includes('?') ? '&' : '?'}v=${v}`;
    },
  });
  return { platform: wrapped, changed: (path) => versions.set(pathKey(path), (versions.get(pathKey(path)) ?? 0) + 1) };
}
