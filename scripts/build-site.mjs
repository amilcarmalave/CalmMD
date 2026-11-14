// Assembles the website into dist-site/ from its sources, so nothing is duplicated in the repo:
//   site/                 pages and styles
//   docs/screenshots/     images
//   docs/samples/         example PDFs
//   packaging/install.*   the one-line install scripts
//
//   npm run site          then upload dist-site/ (GitHub Pages does this in CI)
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist-site');
const at = (...p) => resolve(root, ...p);

rmSync(out, { recursive: true, force: true });
mkdirSync(resolve(out, 'img'), { recursive: true });
mkdirSync(resolve(out, 'samples'), { recursive: true });

cpSync(at('site'), out, { recursive: true });
cpSync(at('assets/brand/calmmd-mark.svg'), resolve(out, 'img/mark.svg'));
for (const name of ['split-light', 'split-dark', 'appearance', 'search', 'pdf-export', 'live-light'])
  cpSync(at(`docs/screenshots/${name}.png`), resolve(out, `img/${name}.png`));
const samples = {
  'guide-paper.pdf': 'calmmd-standard.pdf',
  'report-template.pdf': 'calmmd-report-template.pdf',
  'academic-template.pdf': 'calmmd-academic-template.pdf',
};
for (const [from, to] of Object.entries(samples)) cpSync(at('docs/samples', from), resolve(out, 'samples', to));
cpSync(at('packaging/install.ps1'), resolve(out, 'install.ps1'));
cpSync(at('packaging/install.sh'), resolve(out, 'install.sh'));
console.log(`Website built in ${out}`);
