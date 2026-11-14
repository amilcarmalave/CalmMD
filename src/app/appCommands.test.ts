import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { insertFootnote } from './appCommands';

describe('insertFootnote', () => {
  it('numbers footnotes and puts the cursor in the new definition', () => {
    const s = EditorState.create({ doc: 'Claim.\n\n[^1]: First.', selection: EditorSelection.cursor(5) });
    const next = s.update(insertFootnote(s)).state;
    expect(next.doc.toString()).toBe('Claim[^2].\n\n[^1]: First.\n\n[^2]: ');
    expect(next.selection.main.head).toBe(next.doc.length);
  });
});
