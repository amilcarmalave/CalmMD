import { describe, expect, it } from 'vitest';
import {
  cellOffset,
  columnAt,
  deleteColumn,
  deleteRow,
  formatTable,
  insertColumn,
  insertRow,
  parseTable,
  setAlign,
  splitRow,
  textWidth,
} from './table';

const src = ['| Name | Qty |', '|:---|---:|', '| apple | 3 |', '| kiwi | 12 |'];

describe('table model', () => {
  it('splits rows with escaped pipes and code', () => {
    expect(splitRow('| a \\| b | `x|y` | c |')).toEqual(['a \\| b', '`x|y`', 'c']);
    expect(splitRow('a | b')).toEqual(['a', 'b']);
  });

  it('parses alignment and pads short rows', () => {
    const t = parseTable(['| a | b | c |', '|:-:|--:|:--|', '| 1 |'])!;
    expect(t.align).toEqual(['center', 'right', 'left']);
    expect(t.rows).toEqual([['1', '', '']]);
    expect(parseTable(['| a |', 'not a delimiter'])).toBeNull();
  });

  it('formats with aligned columns', () => {
    expect(formatTable(parseTable(src)!)).toEqual([
      '| Name  | Qty |',
      '| :---- | --: |',
      '| apple |   3 |',
      '| kiwi  |  12 |',
    ]);
  });

  it('round-trips', () => {
    const once = formatTable(parseTable(src)!);
    expect(formatTable(parseTable(once)!)).toEqual(once);
  });

  it('counts wide characters as two columns', () => {
    expect(textWidth('日本')).toBe(4);
    const lines = formatTable(parseTable(['| 日本 | x |', '|---|---|', '| a | b |'])!);
    expect(lines[2]).toBe('| a    | b   |');
  });

  it('inserts and deletes rows and columns', () => {
    const t = parseTable(src)!;
    expect(insertRow(t, 1).rows[0]).toEqual(['', '']);
    expect(deleteRow(t, 2).rows).toEqual([['apple', '3']]);
    expect(deleteRow(t, 0).header).toEqual(['apple', '3']);
    const c = insertColumn(t, 1);
    expect(c.header).toEqual(['Name', '', 'Qty']);
    expect(c.align).toEqual(['left', null, 'right']);
    expect(deleteColumn(t, 0).header).toEqual(['Qty']);
    expect(deleteColumn(deleteColumn(t, 0), 0).header).toEqual(['Qty']); // never below one column
    expect(setAlign(t, 0, 'center').align[0]).toBe('center');
  });

  it('finds the column under a cursor and the start of a cell', () => {
    expect(columnAt('| aa | bb |', 3)).toBe(0);
    expect(columnAt('| aa | bb |', 7)).toBe(1);
    expect(columnAt('aa | bb', 1)).toBe(0);
    expect(columnAt('aa | bb', 6)).toBe(1);
    expect(cellOffset('| aa | bb |', 1)).toBe(7);
  });
});
