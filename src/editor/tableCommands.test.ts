import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { deleteColumn, insertRow } from './table';
import { editTable, tableAt } from './tableCommands';

const doc = 'Intro\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n\nAfter';
const at = (needle: string) => {
  const s = EditorState.create({
    doc,
    selection: EditorSelection.cursor(doc.indexOf(needle)),
    extensions: [markdown({ base: markdownLanguage })],
  });
  ensureSyntaxTree(s, s.doc.length, 5000);
  return s;
};

describe('table commands', () => {
  it('finds the row and column under the cursor', () => {
    expect(tableAt(at('b |'))).toMatchObject({ row: 0, col: 1 });
    expect(tableAt(at('3 |'))).toMatchObject({ row: 2, col: 0 });
    expect(tableAt(at('Intro'))).toBeNull();
  });

  it('inserts a row below and puts the cursor in it, formatted', () => {
    const s = at('1 |');
    const next = s.update(editTable(s, (c) => ({ table: insertRow(c.table, c.row + 1), row: c.row + 1, col: c.col }))!).state;
    expect(next.doc.toString()).toBe('Intro\n\n| a   | b   |\n| --- | --- |\n| 1   | 2   |\n|     |     |\n| 3   | 4   |\n\nAfter');
    const line = next.doc.lineAt(next.selection.main.head);
    expect(line.text).toBe('|     |     |');
  });

  it('deletes a column', () => {
    const s = at('2 |');
    const next = s.update(editTable(s, (c) => ({ table: deleteColumn(c.table, c.col), row: c.row, col: c.col }))!).state;
    expect(next.doc.toString()).toContain('| a   |\n| --- |\n| 1   |\n| 3   |');
  });
});
