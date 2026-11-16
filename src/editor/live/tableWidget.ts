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
  /**
   * Our own edits change the table's Markdown (adding a row changes its lines), and the editor then
   * offers a new widget. When that Markdown is exactly what this table wrote, keep the DOM: the cell
   * you're typing in keeps the focus.
   */
  updateDOM(dom: HTMLElement) {
    return (dom as HTMLElement & { tableSource?: () => string }).tableSource?.() === this.source;
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
      wrap.appendChild(toolbar());
    };

    // A small toolbar over the table: it acts on the cell you're in (or the table's end).
    let current: { r: number; c: number } | null = null;
    const toolbar = () => {
      const bar = document.createElement('div');
      bar.className = 'cm-live-table-bar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Table');
      const button = (label: string, title: string, run: () => void, cls = '') => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cm-live-table-btn' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.title = title;
        // mousedown, so the cell keeps its place while the button acts.
        b.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          run();
        };
        return b;
      };
      const sep = () => {
        const s = document.createElement('span');
        s.className = 'cm-live-table-sep';
        return s;
      };
      // The cell with the focus, else the last one used, else the end of the table.
      const here = () => {
        const a = document.activeElement as HTMLElement | null;
        if (a && wrap.contains(a) && a.dataset.r !== undefined) return { r: Number(a.dataset.r), c: Number(a.dataset.c) };
        return current ?? { r: table.rows.length, c: table.header.length - 1 };
      };
      bar.append(
        button('+ Row', 'Add a row below', () => {
          const { r, c } = here();
          restructure(insertRow(table, r + 1), { r: r + 1, c });
        }),
        button('+ Column', 'Add a column to the right', () => {
          const { r, c } = here();
          restructure(insertColumn(table, c + 1), { r, c: c + 1 });
        }),
        sep(),
        button('⇤', 'Align column left', () => restructure(setAlign(table, here().c, 'left'), here()), 'icon'),
        button('↔', 'Center column', () => restructure(setAlign(table, here().c, 'center'), here()), 'icon'),
        button('⇥', 'Align column right', () => restructure(setAlign(table, here().c, 'right'), here()), 'icon'),
        sep(),
        button('− Row', 'Delete this row', () => {
          const { r, c } = here();
          if (r === 0 && !table.rows.length) return;
          restructure(deleteRow(table, r), { r: Math.max(0, Math.min(r, table.rows.length - 1)), c });
        }, 'danger'),
        button('− Column', 'Delete this column', () => {
          const { r, c } = here();
          if (table.header.length <= 1) return;
          restructure(deleteColumn(table, c), { r, c: Math.max(0, c - 1) });
        }, 'danger'),
      );
      return bar;
    };
    draw();

    const at = (e: Event) => {
      const td = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
      return td ? { td, r: Number(td.dataset.r), c: Number(td.dataset.c) } : null;
    };
    wrap.addEventListener('focusin', (e) => {
      const hit = at(e);
      if (hit) current = { r: hit.r, c: hit.c };
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
    (wrap as HTMLElement & { tableSource?: () => string }).tableSource = () => formatTable(table).join('\n');
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
