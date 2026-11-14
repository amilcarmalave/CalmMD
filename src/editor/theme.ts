import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * Editor chrome. All colours come from CSS custom properties (see styles/tokens.css),
 * so light and dark themes switch without rebuilding the editor.
 */
export const calmEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--fg)',
    backgroundColor: 'var(--bg)',
    fontSize: 'var(--editor-font-size)',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': {
    fontFamily: 'var(--font-source)',
    lineHeight: 'var(--editor-line-height)',
    overflowX: 'hidden',
  },
  '.cm-content': {
    padding: '48px 0 40vh',
    caretColor: 'var(--caret)',
  },
  // The centred column comes from *line* padding (see styles/editor.css), not content padding.
  // CodeMirror measures selection rectangles from line padding, and clicks in the side margins
  // still land on a line.
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--caret)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'var(--selection)' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-placeholder': { color: 'var(--fg-faint)', fontStyle: 'italic' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)', borderRadius: '2px' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--search-match-current)' },
  '.cm-panels': { backgroundColor: 'var(--surface)', color: 'var(--fg)', fontFamily: 'var(--font-ui)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--hairline)' },
  '.cm-panel.cm-search': { padding: '8px 12px', fontSize: '13px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontFamily: 'var(--font-ui)', fontSize: '13px' },
  '.cm-textfield': {
    backgroundColor: 'var(--bg)',
    border: '1px solid var(--hairline-strong)',
    borderRadius: '6px',
    padding: '3px 8px',
    color: 'var(--fg)',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--surface-raised)',
    border: '1px solid var(--hairline-strong)',
    borderRadius: '6px',
    color: 'var(--fg)',
    padding: '3px 10px',
  },
  '.cm-panel.cm-search [name=close]': { color: 'var(--fg-muted)', fontSize: '16px' },
});

/** Source-mode highlighting: structure is visible, markup characters recede. */
export const calmHighlightStyle = HighlightStyle.define([
  // Sizes come from variables so live mode can set them on the line instead (no nested scaling).
  { tag: t.heading1, fontWeight: '700', fontSize: 'var(--cm-h1, 1.3em)', color: 'var(--fg-strong)' },
  { tag: t.heading2, fontWeight: '700', fontSize: 'var(--cm-h2, 1.16em)', color: 'var(--fg-strong)' },
  { tag: t.heading3, fontWeight: '700', fontSize: 'var(--cm-h3, 1.06em)', color: 'var(--fg-strong)' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--fg-strong)' },
  { tag: t.strong, fontWeight: '700', color: 'var(--fg-strong)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--fg-muted)' },
  { tag: t.link, color: 'var(--link)' },
  { tag: t.url, color: 'var(--fg-faint)' },
  { tag: t.processingInstruction, color: 'var(--fg-faint)' }, // # * _ > - and other markup
  { tag: t.contentSeparator, color: 'var(--fg-faint)' },
  { tag: t.quote, color: 'var(--fg-muted)' },
  { tag: t.monospace, color: 'var(--code-fg)' },
  { tag: t.meta, color: 'var(--fg-faint)' },
  { tag: t.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--syntax-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syntax-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syntax-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syntax-function)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--syntax-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--syntax-property)' },
  { tag: [t.tagName, t.angleBracket], color: 'var(--syntax-tag)' },
  { tag: t.invalid, color: 'var(--danger)' },
]);

export const calmHighlighting = syntaxHighlighting(calmHighlightStyle);
