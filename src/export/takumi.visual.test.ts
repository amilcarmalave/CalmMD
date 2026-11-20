// @vitest-environment jsdom
/** Writes Takumi option files for the manual visual review. */
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF } from './build';
import { adaptHtmlForTakumi, takumiOptions } from './takumi';

const out = process.env.CALMMD_EXPORT_OUT;

describe.skipIf(!out)('takumi visual options', () => {
  it('writes options for every review fixture', () => {
    const title = 'The Calm Guide to Writing';
    const pdf = (template: typeof DEFAULT_PDF.template) => ({ ...DEFAULT_PDF, template });
    const cases = [
      ['paper', pdf('standard'), false],
      ['report', pdf('report'), true],
      ['academic', pdf('academic'), true],
      ['minimal', pdf('minimal'), true],
      ['cover', pdf('standard'), true],
    ] as const;
    for (const [name, prefs, cover] of cases) {
      const options = takumiOptions({ title, pdf: prefs, cover });
      writeFileSync(`${out}/takumi-${name}.json`, JSON.stringify(options));
      if (name === 'paper') {
        const html = readFileSync(`${out}/print-paper.html`, 'utf8');
        writeFileSync(`${out}/takumi-adapted-paper.html`, adaptHtmlForTakumi(html, options));
      }
    }
    expect(cases).toHaveLength(5);
  });
});
