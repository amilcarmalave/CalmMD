import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { classHighlighter, highlightCode } from '@lezer/highlight';

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const loading = new Map<string, Promise<unknown>>();

/** Loads the grammars for every fenced code language in a document (exports need them up front). */
export async function preloadLanguages(markdown: string): Promise<void> {
  const langs = new Set<string>();
  for (const m of markdown.matchAll(/^ {0,3}(?:`{3,}|~{3,})\s*([\w+#.-]+)/gm)) langs.add(m[1]);
  await Promise.all(
    [...langs].map((l) => {
      const desc = LanguageDescription.matchLanguageName(languages, l, true);
      return desc && !desc.support ? desc.load().catch(() => undefined) : undefined;
    }),
  );
}

/**
 * Highlights code with the same Lezer grammars the editor uses, so source and preview colours
 * match. Grammars load lazily. If one isn't loaded yet, this returns plain escaped code and
 * calls `onLoaded` once it arrives so the caller can re-render.
 */
export function highlightToHtml(code: string, lang: string, onLoaded?: () => void): string {
  if (!lang) return escapeHtml(code);
  const desc = LanguageDescription.matchLanguageName(languages, lang, true);
  if (!desc) return escapeHtml(code);

  if (!desc.support) {
    let p = loading.get(desc.name);
    if (!p) {
      p = desc.load().catch(() => undefined);
      loading.set(desc.name, p);
    }
    if (onLoaded) void p.then(onLoaded);
    return escapeHtml(code);
  }

  const tree = desc.support.language.parser.parse(code);
  let out = '';
  highlightCode(
    code,
    tree,
    classHighlighter,
    (text, classes) => {
      out += classes ? `<span class="${classes}">${escapeHtml(text)}</span>` : escapeHtml(text);
    },
    () => {
      out += '\n';
    },
  );
  return out;
}
