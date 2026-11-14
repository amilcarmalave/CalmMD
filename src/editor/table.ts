/**
 * GFM table model: parse, edit, and format with aligned columns. Pure and tested. The editor
 * glue (finding the table under the cursor) is in tableCommands.ts.
 */
export type Align = 'left' | 'center' | 'right' | null;

export interface Table {
  header: string[];
  align: Align[];
  rows: string[][];
}

/** Splits a table row into cells, honouring escaped pipes (\|) and pipes inside `code`. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '\\|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function parseAlign(cell: string): Align {
  const c = cell.trim();
  const l = c.startsWith(':');
  const r = c.endsWith(':');
  return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
}

export function parseTable(lines: string[]): Table | null {
  if (lines.length < 2) return null;
  const delim = splitRow(lines[1]);
  if (!delim.every((c) => /^:?-+:?$/.test(c.trim()))) return null;
  const header = splitRow(lines[0]);
  const width = header.length;
  const fit = (cells: string[]) => Array.from({ length: width }, (_, i) => cells[i] ?? '');
  return {
    header,
    align: fit(delim).map(parseAlign),
    rows: lines.slice(2).map((l) => fit(splitRow(l))),
  };
}

/** Display width: wide (CJK, emoji) characters count as two columns. */
export function textWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    w +=
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1faff)
        ? 2
        : 1;
  }
  return w;
}

function pad(s: string, width: number, align: Align): string {
  const gap = width - textWidth(s);
  if (gap <= 0) return s;
  if (align === 'right') return ' '.repeat(gap) + s;
  if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + s + ' '.repeat(Math.ceil(gap / 2));
  return s + ' '.repeat(gap);
}

/** Formats with padded, aligned columns. Round-trips through parseTable. */
export function formatTable(t: Table): string[] {
  const cols = t.header.length;
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(3, textWidth(t.header[c]), ...t.rows.map((r) => textWidth(r[c] ?? ''))),
  );
  const row = (cells: string[]) => '| ' + cells.map((c, i) => pad(c, widths[i], t.align[i])).join(' | ') + ' |';
  const delim =
    '| ' +
    widths
      .map((w, i) => {
        const a = t.align[i];
        const dashes = '-'.repeat(Math.max(1, w - (a === 'center' ? 2 : a ? 1 : 0)));
        return a === 'center' ? `:${dashes}:` : a === 'right' ? `${dashes}:` : a === 'left' ? `:${dashes}` : dashes;
      })
      .join(' | ') +
    ' |';
  return [row(t.header), delim, ...t.rows.map(row)];
}

const clone = (t: Table): Table => ({ header: [...t.header], align: [...t.align], rows: t.rows.map((r) => [...r]) });

/** Row index: 0 is the header and 1.. are body rows (the delimiter isn't a row). */
export function insertRow(t: Table, at: number): Table {
  const n = clone(t);
  const empty = n.header.map(() => '');
  n.rows.splice(Math.max(0, at - 1), 0, empty);
  return n;
}

export function deleteRow(t: Table, row: number): Table {
  const n = clone(t);
  if (row === 0) {
    // Deleting the header promotes the first body row, if there is one.
    if (n.rows.length) n.header = n.rows.shift()!;
    else n.header = n.header.map(() => '');
  } else n.rows.splice(row - 1, 1);
  return n;
}

export function insertColumn(t: Table, at: number): Table {
  const n = clone(t);
  n.header.splice(at, 0, '');
  n.align.splice(at, 0, null);
  for (const r of n.rows) r.splice(at, 0, '');
  return n;
}

export function deleteColumn(t: Table, col: number): Table {
  if (t.header.length <= 1) return t;
  const n = clone(t);
  n.header.splice(col, 1);
  n.align.splice(col, 1);
  for (const r of n.rows) r.splice(col, 1);
  return n;
}

export function setAlign(t: Table, col: number, align: Align): Table {
  const n = clone(t);
  n.align[col] = align;
  return n;
}

/** Column index of a character offset within a row's text. */
export function columnAt(line: string, offset: number): number {
  let col = -1;
  let inCode = false;
  const lead = line.length - line.trimStart().length;
  for (let i = 0; i < Math.min(offset, line.length); i++) {
    const ch = line[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) col++;
  }
  // Rows without a leading pipe start in column 0.
  if (line[lead] !== '|') col++;
  return Math.max(0, col);
}

/** Offset of a cell's content start within a formatted row ("| a | b |"). */
export function cellOffset(line: string, col: number): number {
  let seen = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '|' && line[i - 1] !== '\\') {
      seen++;
      if (seen === col) return Math.min(line.length, i + 2);
    }
  }
  return line.length;
}
