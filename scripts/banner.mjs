// Renders scripts/banner.html to docs/screenshots/banner.png (README header and social preview).
//
//   node scripts/banner.mjs [--browser <path>]
//
// Run it after scripts/screenshots.mjs, since the banner shows a screenshot.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const i = args.indexOf('--browser');
const browser =
  (i !== -1 && args[i + 1]) ||
  [
    process.env.CALMMD_CHROME,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => p && existsSync(p));
if (!browser) throw new Error('No Chrome/Edge found. Pass --browser <path>.');

const root = resolve(import.meta.dirname, '..');
const file = resolve(root, 'docs/screenshots/banner.png');
const profile = mkdtempSync(join(tmpdir(), 'calmmd-banner-'));
execFileSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    `--user-data-dir=${profile}`,
    '--window-size=1280,640',
    '--force-device-scale-factor=2',
    '--virtual-time-budget=3000',
    `--screenshot=${file}`,
    pathToFileURL(resolve(root, 'scripts/banner.html')).href,
  ],
  { stdio: 'ignore' },
);
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
} catch {
  // a leftover temp folder is harmless
}
console.log('wrote', file);
