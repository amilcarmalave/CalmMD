/**
 * Reversible switches for the Rust service migration.
 *
 * Build-time values come from `VITE_CALMMD_*`; a local override in `localStorage` wins so a
 * developer or a smoke test can flip one service without rebuilding. All services are off by
 * default: the TypeScript implementations remain authoritative until parity is accepted.
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

function flag(name: string, key: string): boolean {
  const value = override(key) ?? envValue(name);
  return value !== undefined && TRUE.has(value.toLowerCase());
}

export function useRustMarkdown(): boolean {
  return flag('VITE_CALMMD_RUST_MARKDOWN', 'calmmd.rust.markdown');
}

export function useRustSpell(): boolean {
  return flag('VITE_CALMMD_RUST_SPELL', 'calmmd.rust.spell');
}

export function pdfEngine(): PdfEngine {
  const value = (override('calmmd.pdf.engine') ?? envValue('VITE_CALMMD_PDF_ENGINE') ?? 'browser').toLowerCase();
  return value === 'takumi' || value === 'ikat' ? value : 'browser';
}
