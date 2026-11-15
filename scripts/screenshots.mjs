// Captures README screenshots from the browser demo mode with headless Edge or Chrome.
//
//   npm run dev          (in another terminal)
//   node scripts/screenshots.mjs [--browser <path>] [--url http://localhost:1420]
//
// Writes PNGs to docs/screenshots/.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};

const candidates = [
  process.env.CALMMD_CHROME,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const browser = opt('--browser', candidates.find((p) => existsSync(p)));
if (!browser) throw new Error('No Chrome/Edge found. Pass --browser <path>.');
const base = opt('--url', 'http://localhost:1420');
const out = resolve('docs/screenshots');
mkdirSync(out, { recursive: true });

const shots = [
  { name: 'split-light', q: 'demo&mode=split&scheme=light&theme=paper&sidebar=files' },
  { name: 'live-light', q: 'demo&mode=live&scheme=light&light=paper&theme=paper&sidebar=files&toolbar=0' },
  { name: 'split-dark', q: 'demo&mode=split&scheme=dark&dark=github-dark&theme=github&sidebar=none' },
  { name: 'preview-outline', q: 'demo&mode=preview&scheme=light&theme=clear&sidebar=outline&toolbar=0' },
  { name: 'appearance', q: 'demo&mode=split&scheme=light&theme=paper&sidebar=files&ui=appearance' },
  { name: 'search', q: 'demo&mode=split&scheme=light&theme=paper&sidebar=files&ui=search' },
  { name: 'pdf-export', q: 'demo&mode=split&scheme=light&theme=paper&sidebar=files&ui=export' },
  { name: 'palette', q: 'demo&mode=live&scheme=dark&dark=midnight&theme=paper&sidebar=files&palette=' + encodeURIComponent('>them') },
];

for (const s of shots) {
  const profile = mkdtempSync(join(tmpdir(), 'calmmd-shot-'));
  const file = join(out, `${s.name}.png`);
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--hide-scrollbars',
      // No open/close animations mid-capture.
      '--force-prefers-reduced-motion',
      `--user-data-dir=${profile}`,
      '--window-size=1440,900',
      '--force-device-scale-factor=2',
      '--virtual-time-budget=8000',
      `--screenshot=${file}`,
      `${base}/?${s.q}`,
    ],
    { stdio: 'ignore' },
  );
  // Edge can hold the profile folder for a moment after exiting.
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch {
    // a leftover temp folder is harmless
  }
  console.log('wrote', file);
}
