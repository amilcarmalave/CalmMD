// @vitest-environment jsdom
/**
 * Export smoke test: writes a realistic export to $CALMMD_EXPORT_OUT so it can be printed with
 * the real PDF engine and inspected by eye. Skipped unless the variable is set:
 *
 *   CALMMD_EXPORT_OUT=/tmp/out npx vitest run src/export/pdf.smoke.test.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadExportAssets } from './assets';
import { buildBody, buildDocument, DEFAULT_PDF } from './build';

const out = process.env.CALMMD_EXPORT_OUT;

const SAMPLE = `# The Calm Guide to Writing

A short document that exercises **everything** a real export needs: *emphasis*, \`inline code\`,
[links](https://commonmark.org), footnotes[^1], tables, code, quotes, task lists and images.

![A diagram](data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="200"><rect width="640" height="200" rx="14" fill="#e8a23b"/><text x="32" y="112" font-size="40" font-family="Georgia" fill="#1f2a44">Figure 1: an embedded image</text></svg>')})

## Principles

> Good tools disappear. What remains is the work.

1. Keep the interface quiet.
2. Make the common path fast.
3. Never lose a word.

- [x] Draft the outline
- [ ] Write the conclusion

## Data

| Feature | Status | Notes |
| :--- | :---: | ---: |
| Live mode | Done | 21 tests |
| Scroll sync | Done | < 0.03 lines |
| PDF export | Done | Paged.js |

## Code

\`\`\`ts
export function greet(name: string): string {
  // A comment
  return \`Hello, \${name}!\`;
}
\`\`\`

---pagebreak---

# Appendix

${'Longer prose to show pagination, widows and orphans. '.repeat(60)}

## Notes

${'More text so the appendix runs onto another page. '.repeat(90)}

[^1]: Footnotes are rendered at the end of the document.
`;

describe.skipIf(!out)('export smoke', () => {
  it('writes HTML and PDF-ready HTML', async () => {
    // Vitest turns CSS ?raw imports into empty strings, so read the stylesheets from disk here.
    // (Plain paths: Vite rewrites `new URL(template, import.meta.url)` as an asset pattern.)
    const css = ['tokens.css', 'preview.css'].map((f) => readFileSync(resolve(process.cwd(), 'src/styles', f), 'utf8')).join('\n');
    const assets = { ...(await loadExportAssets(true)), baseCss: css };
    expect(assets.fontCss).toContain('data:font/woff2;base64,');
    for (const theme of ['paper', 'studio'] as const) {
      const opts = { title: 'The Calm Guide to Writing', theme, userCss: null, toc: true, embedImages: true };
      const body = await buildBody(SAMPLE, '/docs/guide.md', opts, { readImage: async () => null });
      writeFileSync(`${out}/export-${theme}.html`, buildDocument(body, opts, { ...assets, pagedJs: undefined }));
      writeFileSync(`${out}/print-${theme}.html`, buildDocument(body, opts, assets, { ...DEFAULT_PDF, breakBeforeH1: false }));
    }
    // With a cover page (CalmMD Pro): its own page, no running header or page number.
    const cover = { title: 'The Calm Guide to Writing', subtitle: 'Notes on a quiet tool', author: 'Ada Lovelace', date: 'November 13, 2026' };
    const withCover = { title: 'The Calm Guide to Writing', theme: 'paper' as const, userCss: null, toc: true, embedImages: true, cover };
    const coverBody = await buildBody(SAMPLE, '/docs/guide.md', withCover, { readImage: async () => null });
    writeFileSync(`${out}/print-cover.html`, buildDocument(coverBody, withCover, assets, DEFAULT_PDF));
    // PDF templates (CalmMD Pro).
    for (const template of ['report', 'academic', 'minimal'] as const)
      writeFileSync(`${out}/print-${template}.html`, buildDocument(coverBody, withCover, assets, { ...DEFAULT_PDF, template }));
    expect(true).toBe(true);
  });
});
