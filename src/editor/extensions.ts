import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { inlineEnter } from './inlineEnter';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { indentOnInput } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { search, searchKeymap } from '@codemirror/search';
import { Annotation, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightSpecialChars,
  keymap,
  placeholder,
  rectangularSelection,
  type ViewUpdate,
} from '@codemirror/view';
import { mathSyntax } from './mathSyntax';
import { syntaxExtras } from './syntaxExtras';
import { typingColor } from './typingColor';
import { calmEditorTheme, calmHighlighting } from './theme';

/** Marks transactions that load content from disk, so they don't count as user edits. */
export const ExternalLoad = Annotation.define<boolean>();

export function isUserEdit(update: ViewUpdate): boolean {
  return update.docChanged && !update.transactions.some((tr) => tr.annotation(ExternalLoad));
}

export interface EditorExtensionOptions {
  onUpdate: (update: ViewUpdate) => void;
  /** App-provided extensions (command keymap, slash commands). These take precedence. */
  extra?: Extension[];
  /** Replaces the Markdown language (for example with a compartment holding it). */
  language?: Extension;
}

/** GFM base. Fenced code gets language highlighting, and its grammars load lazily. */
export const markdownSupport: Extension = markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: true, extensions: [mathSyntax, ...syntaxExtras] });

export function editorExtensions(opts: EditorExtensionOptions): Extension[] {
  return [
    ...(opts.extra ?? []),
    history(),
    drawSelection(),
    dropCursor(),
    rectangularSelection(),
    highlightSpecialChars(),
    indentOnInput(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.lineWrapping,
    // GFM base. Fenced code gets language highlighting, and its grammars load lazily.
    opts.language ?? markdownSupport,
    calmHighlighting,
    search({ top: true }),
    // Enter at the end of **bold** (and the like) keeps the closing marks on the line.
    inlineEnter,
    keymap.of([...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
    placeholder('Start writing…'),
    // Spellcheck is configured by the app (a compartment: on/off and language).
    EditorView.contentAttributes.of({ autocorrect: 'on', autocapitalize: 'off' }),
    calmEditorTheme,
    typingColor,
    EditorView.updateListener.of(opts.onUpdate),
  ];
}
