import type { Platform } from '../platform/types';
import type {
  HighlightCodeResult,
  MarkdownParseResult,
  MarkdownRenderOptions,
  MarkdownRenderResult,
} from '../markdown/types';

/**
 * Typed client for the Rust Markdown core. The flag is still off by default, so this module is
 * currently used by tests and by the opt-in rollout path rather than by the preview itself.
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
