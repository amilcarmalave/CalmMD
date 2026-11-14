import { syntaxTree } from '@codemirror/language';
import { EditorSelection, type EditorState, type TransactionSpec } from '@codemirror/state';
import { cellOffset, columnAt, formatTable, parseTable, type Table } from './table';

export interface TableContext {
  from: number;
  to: number;
  table: Table;
  /** 0 = header row, 1.. = body rows. */
  row: number;
  col: number;
}

/** The table under the main cursor, with the cursor's row and column. */
export function tableAt(state: EditorState, pos = state.selection.main.head): TableContext | null {
  let node = syntaxTree(state).resolveInner(pos, -1);
  while (node.name !== 'Table' && node.parent) node = node.parent;
  if (node.name !== 'Table') {
    node = syntaxTree(state).resolveInner(pos, 1);
    while (node.name !== 'Table' && node.parent) node = node.parent;
    if (node.name !== 'Table') return null;
  }
  const first = state.doc.lineAt(node.from);
  const last = state.doc.lineAt(node.to);
  const lines: string[] = [];
  for (let n = first.number; n <= last.number; n++) lines.push(state.doc.line(n).text);
  const table = parseTable(lines);
  if (!table) return null;
  const cur = state.doc.lineAt(pos);
  const index = cur.number - first.number;
  const row = index <= 1 ? 0 : index - 1;
  return { from: first.from, to: last.to, table, row, col: columnAt(cur.text, pos - cur.from) };
}

/**
 * Applies a table edit and re-formats the whole table with aligned columns, keeping the
 * cursor in the target cell.
 */
export function editTable(
  state: EditorState,
  op: (ctx: TableContext) => { table: Table; row: number; col: number },
): TransactionSpec | null {
  const ctx = tableAt(state);
  if (!ctx) return null;
  const next = op(ctx);
  const lines = formatTable(next.table);
  const insert = lines.join('\n');
  const rowLine = next.row === 0 ? 0 : next.row + 1;
  const safeRow = Math.min(rowLine, lines.length - 1);
  let offset = 0;
  for (let i = 0; i < safeRow; i++) offset += lines[i].length + 1;
  const col = Math.min(next.col, next.table.header.length - 1);
  offset += cellOffset(lines[safeRow], col);
  return {
    changes: { from: ctx.from, to: ctx.to, insert },
    selection: EditorSelection.cursor(ctx.from + offset),
    scrollIntoView: true,
  };
}
