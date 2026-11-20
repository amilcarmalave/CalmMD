/**
 * Reversible switches for the Rust service migration.
 *
 * Build-time values come from `VITE_CALMMD_*`; a local override in `localStorage` wins so a
 * developer or a smoke test can flip one service without rebuilding. Rust Markdown is authoritative
 * after the Phase 1/4 parity review. Spellchecking defaults to the bundled zspell dictionaries;
 * other languages fall back to the OS checker.
 */

export type PdfEngine = 'browser' | 'takumi' | 'ikat';

const TRUE = new Set(['1', 'true', 'yes', 'on']);

function envValue(name: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return env?.[name];
}

function override(key: string): string | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function flag(name: string, key: string, defaultValue = false): boolean {
  const value = override(key) ?? envValue(name);
  return value === undefined ? defaultValue : TRUE.has(value.toLowerCase());
}

export function useRustMarkdown(): boolean {
  return flag('VITE_CALMMD_RUST_MARKDOWN', 'calmmd.rust.markdown', true);
}

export function useRustSpell(): boolean {
  return flag('VITE_CALMMD_RUST_SPELL', 'calmmd.rust.spell', true);
}

export function pdfEngine(): PdfEngine {
  const value = (override('calmmd.pdf.engine') ?? envValue('VITE_CALMMD_PDF_ENGINE') ?? 'takumi').toLowerCase();
  return value === 'browser' || value === 'takumi' || value === 'ikat' ? value : 'takumi';
}

/**
 * Takumi rasterises variable fonts slightly heavier than Chromium. This is a reversible body-text
 * weight adjustment; explicit heading weights still come from the export CSS.
 */
export function takumiFontWeight(): number {
  const raw = override('calmmd.takumi.fontWeight') ?? envValue('VITE_CALMMD_TAKUMI_FONT_WEIGHT');
  const value = raw === undefined ? 350 : Number(raw);
  return Number.isFinite(value) && value >= 1 && value <= 1000 ? value : 350;
}
