import { EditorSelection, EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { stepOutOfInline } from './inlineEnter';

/** Applies the step to a document with ‸ as the cursor, and shows the result the same way. */
function step(doc: string): string | null {
  const at = doc.indexOf('‸');
  const state = EditorState.create({ doc: doc.replace('‸', ''), selection: EditorSelection.cursor(at) });
  const spec = stepOutOfInline(state);
  if (!spec) return null;
  const next = state.update(spec).state;
  const head = next.selection.main.head;
  const text = next.doc.toString();
  return text.slice(0, head) + '‸' + text.slice(head);
}

describe('Enter at the end of formatted text', () => {
  it('steps past closing marks so they stay on the line', () => {
    expect(step('Some **bold‸**')).toBe('Some **bold**‸');
    expect(step('*it‸*')).toBe('*it*‸');
    expect(step('_it‸_')).toBe('_it_‸');
    expect(step('~~gone‸~~')).toBe('~~gone~~‸');
    expect(step('==hi‸==')).toBe('==hi==‸');
    expect(step('`code‸`')).toBe('`code`‸');
    expect(step('***both‸***')).toBe('***both***‸');
    expect(step('**_nested‸_**')).toBe('**_nested_**‸');
  });

  it('steps past closing colour and highlight tags', () => {
    expect(step('<span style="color: #e5484d">red‸</span>')).toBe('<span style="color: #e5484d">red</span>‸');
    expect(step('<mark style="background: #fde68a">hi‸</mark>')).toBe('<mark style="background: #fde68a">hi</mark>‸');
  });

  it('removes an empty pair instead of leaving it behind', () => {
    expect(step('Start **‸**')).toBe('Start ‸');
    expect(step('<span style="color: #e5484d">‸</span>')).toBe('‸');
  });

  it('leaves ordinary Enter alone', () => {
    expect(step('plain‸ text')).toBeNull();
    expect(step('**bold** and ‸more')).toBeNull();
    expect(step('end of line‸')).toBeNull();
    expect(step('a lone star‸*')).toBeNull(); // no opening mark before the cursor
    expect(step('**bold‸** then text')).toBeNull(); // text after the marks: a real split
  });
});
