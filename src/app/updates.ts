/**
 * "A new version is out" notices. Only with the user's OK (asked once, changeable in Help): about
 * once a day CalmMD asks GitHub for the latest release, and nothing else is sent. A version you've
 * been told about isn't shown again.
 */
export const RELEASES_API = 'https://api.github.com/repos/amilcarmalave/CalmMD/releases/latest';
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export interface Release {
  version: string;
  url: string;
}

/** Compares dotted versions ("1.10.0" > "1.9.2"); a leading "v" and pre-release tags are ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** The latest release from GitHub's answer, or null for drafts, pre-releases and anything unexpected. */
export function parseRelease(json: unknown): Release | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };
  if (r.draft || r.prerelease || typeof r.tag_name !== 'string' || typeof r.html_url !== 'string') return null;
  if (!/^https:\/\/github\.com\//.test(r.html_url)) return null;
  return { version: r.tag_name.replace(/^v/i, ''), url: r.html_url };
}

/** Whether to tell the user about `latest`: newer than what's running, and not already shown. */
export function shouldAnnounce(latest: Release | null, current: string, alreadyShown: string | null): boolean {
  if (!latest || compareVersions(latest.version, current) <= 0) return false;
  return !alreadyShown || compareVersions(latest.version, alreadyShown) > 0;
}

export function isCheckDue(lastCheck: number | null, now: number): boolean {
  return lastCheck === null || now - lastCheck >= CHECK_EVERY_MS || now < lastCheck;
}
