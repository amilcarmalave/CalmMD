import { syntaxTree } from '@codemirror/language';
import { EditorView, WidgetType } from '@codemirror/view';
import { deleteColumn, deleteRow, formatTable, insertColumn, insertRow, parseTable, setAlign, type Align, type Table } from '../table';
import { liveConfig } from './config';

/**
 * Tables in Live mode: a real table you type into, not Markdown with pipes. Click a cell to edit
 * its text (the cell shows its Markdown while you're in it, rendered when you leave). Tab and
 * Shift+Tab move between cells, Enter moves down, and both add a row at the end. Every change is
 * written back as a normal, aligned Markdown table, so the file reads the same everywhere.
 */

/** What the editor's right-click menu can do to the table under a cell. */
export interface TableActions {
  row: number;
  col: number;
  insertRow: (below: boolean) => void;
  insertColumn: (right: boolean) => void;
  deleteRow: () => void;
  deleteColumn: () => void;
  align: (a: Align) => void;
}

/** A pipe typed in a cell would split it: keep it as text. */
const escapePipes = (s: string) => s.replace(/(^|[^\\])\|/g, '$1\\|').replace(/\n/g, ' ');

/** The document range of the table drawn by this widget, from the syntax tree. */
function tableRange(view: EditorView, dom: HTMLElement): { from: number; to: number } | null {
  let pos: number;
  try {
    pos = view.posAtDOM(dom);
  } catch {
    return null;
  }
  for (let n: ReturnType<ReturnType<typeof syntaxTree>['resolveInner']> | null = syntaxTree(view.state).resolveInner(pos, 1); n; n = n.parent) {
    if (n.name === 'Table') return { from: view.state.doc.lineAt(n.from).from, to: view.state.doc.lineAt(n.to).to };
  }
  return null;
}

export class TableWidget extends WidgetType {
  constructor(
    /** Updated as the table is edited, so redraws caused by our own edits keep the DOM (and focus). */
    public source: string,
    readonly pos: number,
  ) {
    super();
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  ignoreEvent() {
    return true; // the table handles its own clicks and keys
  }
  get estimatedHeight() {
    return (this.source.split('\n').length - 1) * 34 + 16;
  }

  toDOM(view: EditorView) {
    const widget = this;
    const wrap = document.createElement('div');
    wrap.className = 'cm-live-table md-body cm-live-table-edit';
    let table: Table = parseTable(this.source.split('\n')) ?? { header: [''], align: [null], rows: [] };
    const render = (md: string) => view.state.facet(liveConfig).renderMarkdown(md).replace(/^\s*<p[^>]*>([\s\S]*)<\/p>\s*$/, '$1');
    const raw = (r: number, c: number) => (r === 0 ? table.header[c] : table.rows[r - 1]?.[c]) ?? '';
    const setRaw = (r: number, c: number, v: string) => {
      if (r === 0) table.header[c] = v;
      else table.rows[r - 1][c] = v;
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const commit = () => {
      clearTimeout(timer);
      const range = tableRange(view, wrap);
      if (!range) return;
      const text = formatTable(table).join('\n');
      if (view.state.sliceDoc(range.from, range.to) === text) return;
      widget.source = text;
      view.dispatch({ changes: { from: range.from, to: range.to, insert: text }, userEvent: 'input.table' });
    };
    /** Structural changes (rows, columns, alignment) redraw the table, then focus a cell. */
    const restructure = (next: Table, focus?: { r: number; c: number }) => {
      table = next;
      draw();
      commit();
      if (focus) focusCell(focus.r, focus.c);
    };

    const cellEl = (r: number, c: number) => wrap.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`);
    const focusCell = (r: number, c: number) => {
      const el = cellEl(r, c);
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(el);
        sel.collapseToEnd();
      }
    };
    const move = (r: number, c: number, dr: number, dc: number) => {
      const cols = table.header.length;
      let nr = r + dr;
      let nc = c + dc;
      if (nc >= cols) [nr, nc] = [nr + 1, 0];
      if (nc < 0) [nr, nc] = [nr - 1, cols - 1];
      if (nr < 0) return;
      if (nr > table.rows.length) return restructure(insertRow(table, table.rows.length + 1), { r: nr, c: dc ? 0 : c });
      focusCell(nr, nc);
    };

    const draw = () => {
      wrap.textContent = '';
      const el = document.createElement('table');
      const head = el.createTHead().insertRow();
      const body = el.createTBody();
      const cell = (tr: HTMLTableRowElement, tag: 'th' | 'td', r: number, c: number) => {
        const td = document.createElement(tag);
        td.dataset.r = String(r);
        td.dataset.c = String(c);
        td.contentEditable = 'true';
        td.spellcheck = true;
        if (table.align[c]) td.style.textAlign = table.align[c]!;
        td.innerHTML = render(raw(r, c));
        tr.appendChild(td);
      };
      table.header.forEach((_, c) => cell(head, 'th', 0, c));
      table.rows.forEach((row, i) => {
        const tr = body.insertRow();
        table.header.forEach((_, c) => cell(tr, 'td', i + 1, c));
        void row;
      });
      wrap.appendChild(el);
      const addRow = document.createElement('button');
      addRow.className = 'cm-live-table-add row';
      addRow.title = 'Add a row';
      addRow.textContent = '+';
      addRow.onmousedown = (e) => {
        e.preventDefault();
        restructure(insertRow(table, table.rows.length + 1), { r: table.rows.length + 1, c: 0 });
      };
      const addCol = document.createElement('button');
      addCol.className = 'cm-live-table-add col';
      addCol.title = 'Add a column';
      addCol.textContent = '+';
      addCol.onmousedown = (e) => {
        e.preventDefault();
        restructure(insertColumn(table, table.header.length), { r: 0, c: table.header.length });
      };
      wrap.append(addRow, addCol);
    };
    draw();

    const at = (e: Event) => {
      const td = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      return td ? { td, r: Number(td.dataset.r), c: Number(td.dataset.c) } : null;
    };
    wrap.addEventListener('focusin', (e) => {
      const hit = at(e);
      if (!hit || hit.td.classList.contains('editing')) return;
      hit.td.classList.add('editing');
      hit.td.textContent = raw(hit.r, hit.c); // the cell's Markdown while editing it
    });
    wrap.addEventListener('input', (e) => {
      const hit = at(e);
      if (!hit) return;
      setRaw(hit.r, hit.c, escapePipes(hit.td.textContent ?? ''));
      clearTimeout(timer);
      timer = setTimeout(commit, 400);
    });
    wrap.addEventListener('focusout', (e) => {
      const hit = at(e);
      if (!hit) return;
      hit.td.classList.remove('editing');
      hit.td.innerHTML = render(raw(hit.r, hit.c));
      commit();
    });
    wrap.addEventListener('keydown', (e) => {
      const hit = at(e);
      if (!hit) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.altKey) {
        // Editing keys stay in the cell (not the app's Select All, Undo or Bold, which act on the note).
        if (key === 'a') {
          e.preventDefault();
          window.getSelection()?.selectAllChildren(hit.td);
        } else if (key === 'b' || key === 'i') {
          e.preventDefault();
          const mark = key === 'b' ? '**' : '_';
          const sel = window.getSelection()?.toString() ?? '';
          document.execCommand('insertText', false, sel ? `${mark}${sel}${mark}` : mark + mark);
        } else if (key === 'u') e.preventDefault();
        else if (key !== 'z' && key !== 'y') return; // Save, palette and the rest go to the app
        e.stopPropagation();
        return;
      }
      if (e.key === 'Tab') move(hit.r, hit.c, 0, e.shiftKey ? -1 : 1);
      else if (e.key === 'Enter' && !e.shiftKey) move(hit.r, hit.c, 1, 0);
      else if (e.key === 'Escape') {
        // Back to the text, just after the table.
        commit();
        const range = tableRange(view, wrap);
        hit.td.blur();
        if (range) view.dispatch({ selection: { anchor: Math.min(view.state.doc.length, range.to + 1) } });
        view.focus();
      } else {
        // Typing stays in the cell: no editor or app shortcuts.
        e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    });
    // Pasted text goes in as plain text (a cell holds one line).
    wrap.addEventListener('paste', (e) => {
      if (!at(e)) return;
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain').replace(/\s*\n\s*/g, ' ') ?? '';
      document.execCommand('insertText', false, text);
    });

    // The right-click menu reads these (App's onEditorContextMenu).
    (wrap as HTMLElement & { tableActions?: (target: Element) => TableActions | null }).tableActions = (target) => {
      const td = target.closest<HTMLElement>('[data-r]');
      if (!td) return null;
      const r = Number(td.dataset.r);
      const c = Number(td.dataset.c);
      return {
        row: r,
        col: c,
        insertRow: (below) => restructure(insertRow(table, below ? r + 1 : Math.max(1, r)), { r: below ? r + 1 : Math.max(1, r), c }),
        insertColumn: (right) => restructure(insertColumn(table, right ? c + 1 : c), { r, c: right ? c + 1 : c }),
        deleteRow: () => restructure(deleteRow(table, r)),
        deleteColumn: () => restructure(deleteColumn(table, c)),
        align: (a) => restructure(setAlign(table, c, a)),
      };
    };
    return wrap;
  }
}
