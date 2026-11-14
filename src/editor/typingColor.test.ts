// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setTypingColor, typingColor, typingColorField, typingColorInput } from './typingColor';

// jsdom has no layout: CodeMirror measures text ranges a moment after a view is created, so give
// Range the two methods it calls, and destroy views so no measurement runs after a test ends.
beforeAll(() => {
  const empty = Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getClientRects = () => empty;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

function view(doc: string, cursor = doc.length) {
  const v = new EditorView({ state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: [typingColor] }) });
  views.push(v);
  return v;
}

describe('typing colour', () => {
  it('wraps the next typed text and keeps the cursor inside the span', () => {
    const v = view('Hello ');
    v.dispatch({ effects: setTypingColor.of({ pos: 6, value: '#e5484d' }) });
    expect(v.state.doc.toString()).toBe('Hello '); // nothing inserted when picking
    expect(typingColorInput(v, 6, 6, 'w')).toBe(true);
    expect(v.state.doc.toString()).toBe('Hello <span style="color: #e5484d">w</span>');
    expect(v.state.selection.main.head).toBe('Hello <span style="color: #e5484d">w'.length);
    expect(v.state.field(typingColorField)).toBeNull();
    // The rest of the word continues inside the span.
    v.dispatch(v.state.replaceSelection('orld'));
    expect(v.state.doc.toString()).toBe('Hello <span style="color: #e5484d">world</span>');
  });

  it('disarms when the cursor moves or the text changes elsewhere', () => {
    const v = view('Hello there');
    v.dispatch({ effects: setTypingColor.of({ pos: 5, value: '#3b82e0' }) });
    v.dispatch({ selection: { anchor: 2 } });
    expect(v.state.field(typingColorField)).toBeNull();
    expect(typingColorInput(v, 2, 2, 'x')).toBe(false);
  });

  it('ignores input at another position and multi-line input', () => {
    const v = view('abc', 3);
    v.dispatch({ effects: setTypingColor.of({ pos: 3, value: '#3b82e0' }) });
    expect(typingColorInput(v, 1, 1, 'x')).toBe(false);
    expect(typingColorInput(v, 3, 3, '\n')).toBe(false);
  });

  it('marks the editor so the cursor shows the colour', () => {
    const v = view('a');
    v.dispatch({ effects: setTypingColor.of({ pos: 1, value: '#2f9e57' }) });
    expect(v.dom.classList.contains('cm-typing-color')).toBe(true);
    expect(v.dom.style.getPropertyValue('--typing-color')).toBe('#2f9e57');
  });
});
