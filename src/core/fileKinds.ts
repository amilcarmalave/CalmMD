import { isMarkdownPath } from './paths';

/**
 * What CalmMD does with a file in the sidebar. Notes open in the editor; everything else opens in
 * the read-only Quick view, which shows images, PDFs, text and tables, or a card with the file's
 * details and "Open with default app".
 */
export type FileKind = 'note' | 'image' | 'pdf' | 'table' | 'text' | 'other';

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i;
const TABLE = /\.(csv|tsv)$/i;
const TEXT =
  /\.(json|jsonc|ya?ml|toml|xml|html?|css|scss|less|js|mjs|cjs|jsx|ts|tsx|py|rb|rs|go|java|kt|swift|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|ps1|bat|cmd|sql|ini|cfg|conf|env|log|tex|bib|r|lua|pl|vue|svelte|dockerfile|gitignore|editorconfig)$/i;
const TEXT_NAMES = /^(readme|license|licence|changelog|makefile|dockerfile|\.gitignore|\.editorconfig)$/i;

export function fileKind(name: string): FileKind {
  if (isMarkdownPath(name)) return 'note';
  if (IMAGE.test(name)) return 'image';
  if (/\.pdf$/i.test(name)) return 'pdf';
  if (TABLE.test(name)) return 'table';
  if (TEXT.test(name) || TEXT_NAMES.test(name.replace(/^.*[\\/]/, ''))) return 'text';
  return 'other';
}

/** Largest text file Quick view reads (bigger ones get the details card). */
export const QUICK_VIEW_MAX_BYTES = 2 * 1024 * 1024;

/** A small CSV/TSV reader for previews: quoted fields, escaped quotes, CRLF. Caps the rows. */
export function parseDelimited(text: string, delimiter: string, maxRows = 500): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;
  const pushRow = () => {
    row.push(field);
    rows.push(row);
    row = [];
    field = '';
  };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (c === '"') quoted = false;
      else field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      pushRow();
      if (rows.length >= maxRows) return { rows, truncated: i + 1 < text.length };
    } else field += c;
    i++;
  }
  if (field !== '' || row.length) pushRow();
  return { rows, truncated: false };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
