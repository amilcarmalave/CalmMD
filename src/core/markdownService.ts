import type { Platform } from '../platform/types';
import type {
  HighlightCodeResult,
  MarkdownParseResult,
  MarkdownRenderOptions,
  MarkdownRenderResult,
} from '../markdown/types';

/**
 * Typed client for the Rust Markdown core, now used by the preview and HTML export by default.
 * The TypeScript renderer remains available through the feature flag as a reversible fallback.
 */
export function createMarkdownService(platform: Platform) {
  return {
    parse(text: string): Promise<MarkdownParseResult> {
      return platform.markdownParse(text);
    },
    render(text: string, options?: MarkdownRenderOptions): Promise<MarkdownRenderResult> {
      return platform.markdownRender(text, options);
    },
    highlightCode(language: string, code: string, theme?: string): Promise<HighlightCodeResult> {
      return platform.markdownHighlightCode(language, code, theme);
    },
  };
}
