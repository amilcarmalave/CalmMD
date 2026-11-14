/**
 * Heavy export assets (fonts, styles, Paged.js, KaTeX), loaded only when exporting, so they stay
 * out of the main bundle.
 */
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline';
import jetbrains from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2?inline';
import literata from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?inline';
import previewCss from '../styles/preview.css?raw';
import tokensCss from '../styles/tokens.css?raw';
import type { ExportAssets } from './build';

const face = (family: string, url: string) =>
  `@font-face { font-family: '${family}'; font-style: normal; font-display: block; font-weight: 100 900; src: url(${url}) format('woff2'); }`;

const katexFonts = import.meta.glob('/node_modules/katex/dist/fonts/*.woff2', { query: '?inline', import: 'default' }) as Record<
  string,
  () => Promise<string>
>;

/** KaTeX's stylesheet with its fonts embedded (woff2 only), for self-contained exports. */
export async function loadKatexCss(): Promise<string> {
  const css = (await import('katex/dist/katex.min.css?raw')).default;
  const urls = new Map<string, string>();
  await Promise.all(
    Object.entries(katexFonts).map(async ([path, load]) => urls.set(path.split('/').pop()!, await load())),
  );
  return (
    css
      // Keep only the woff2 source of each @font-face, as a data: URL.
      .replace(/,\s*url\(fonts\/[^)]+\.woff\)\s*format\("woff"\)/g, '')
      .replace(/,\s*url\(fonts\/[^)]+\.ttf\)\s*format\("truetype"\)/g, '')
      .replace(/url\(fonts\/([^)]+\.woff2)\)/g, (m, file: string) => (urls.has(file) ? `url(${urls.get(file)})` : m))
  );
}

export async function loadExportAssets(withPaged: boolean, withMath = false): Promise<ExportAssets> {
  const fontCss = [face('Inter Variable', inter), face('Literata Variable', literata), face('JetBrains Mono Variable', jetbrains)].join('\n');
  const [pagedJs, katexCss] = await Promise.all([
    // A relative file import: pagedjs doesn't export its prebuilt polyfill, and an alias gets caught
    // by Vite's dev dependency optimiser.
    withPaged ? import('../../node_modules/pagedjs/dist/paged.polyfill.min.js?raw').then((m) => m.default as string) : undefined,
    withMath ? loadKatexCss() : undefined,
  ]);
  return { baseCss: tokensCss + '\n' + previewCss, fontCss, pagedJs, katexCss };
}
