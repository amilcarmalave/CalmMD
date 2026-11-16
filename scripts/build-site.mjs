// Assembles the website into dist-site/ from its sources, so nothing is duplicated in the repo:
//   site/                 pages and styles
//   docs/screenshots/     images
//   docs/samples/         example PDFs
//   packaging/install.*   the one-line install scripts
//
//   npm run site          then upload dist-site/ (GitHub Pages does this in CI)
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist-site');
const at = (...p) => resolve(root, ...p);

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'img'), { recursive: true });
mkdirSync(resolve(out, 'samples'), { recursive: true });

cpSync(at('site'), out, { recursive: true });
cpSync(at('assets/brand/calmmd-mark.svg'), resolve(out, 'img/mark.svg'));
for (const name of ['split-light', 'split-dark', 'appearance', 'search', 'pdf-export', 'live-light', 'palette', 'images'])
  cpSync(at(`docs/screenshots/${name}.png`), resolve(out, `img/${name}.png`));
const samples = {
  'guide-paper.pdf': 'calmmd-standard.pdf',
  'report-template.pdf': 'calmmd-report-template.pdf',
  'academic-template.pdf': 'calmmd-academic-template.pdf',
};
for (const [from, to] of Object.entries(samples)) cpSync(at('docs/samples', from), resolve(out, 'samples', to));
cpSync(at('packaging/install.ps1'), resolve(out, 'install.ps1'));
cpSync(at('packaging/install.sh'), resolve(out, 'install.sh'));
// Pages caches files for 10 minutes: version the script and stylesheet by their content, so a
// changed file is fetched at once instead of an old cached copy running with the new page.
const version = (file) => createHash('sha256').update(readFileSync(resolve(out, file))).digest('hex').slice(0, 10);
const stamps = { 'site.js': version('site.js'), 'style.css': version('style.css') };
for (const page of readdirSync(out).filter((f) => f.endsWith('.html'))) {
  let html = readFileSync(resolve(out, page), 'utf8');
  for (const [file, v] of Object.entries(stamps)) html = html.replaceAll(`"${file}"`, `"${file}?v=${v}"`);
  writeFileSync(resolve(out, page), html);
}
console.log(`Website built in ${out}`);
