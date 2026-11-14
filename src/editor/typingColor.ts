import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * "Type in colour": choosing a text colour with nothing selected arms it at the cursor, the way a
 * word processor does. The next text typed there is wrapped in `<span style="color: …">`, and the
 * cursor stays inside the span so the rest of the word follows. Moving the cursor away, or
 * choosing again, disarms it. Nothing is inserted until something is typed.
 */
export interface TypingColor {
  pos: number;
  value: string;
}

export const setTypingColor = StateEffect.define<TypingColor | null>();

export const typingColorField = StateField.define<TypingColor | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setTypingColor)) return e.value;
    if (!value) return null;
    // Any other edit or cursor move disarms it.
    if (tr.docChanged) return null;
    if (tr.selection) {
      const r = tr.selection.main;
      if (!r.empty || r.head !== value.pos || tr.selection.ranges.length > 1) return null;
    }
    return value;
  },
});

/** Wraps typed text in the armed colour. Exported for tests. */
export function typingColorInput(view: EditorView, from: number, to: number, text: string): boolean {
  const armed = view.state.field(typingColorField, false);
  if (!armed || from !== to || from !== armed.pos || !text || text.includes('\n')) return false;
  const open = `<span style="color: ${armed.value}">`;
  view.dispatch({
    changes: { from, insert: `${open}${text}</span>` },
    selection: { anchor: from + open.length + text.length },
    effects: setTypingColor.of(null),
    userEvent: 'input.type',
    scrollIntoView: true,
  });
  return true;
}

export const typingColor: Extension = [
  typingColorField,
  EditorView.inputHandler.of(typingColorInput),
  // Show it: the cursor takes the colour while armed.
  EditorView.editorAttributes.compute([typingColorField], (state): Record<string, string> => {
    const armed = state.field(typingColorField);
    return armed ? { class: 'cm-typing-color', style: `--typing-color: ${armed.value}` } : {};
  }),
];
