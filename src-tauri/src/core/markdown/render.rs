//! Mordant-backed HTML rendering and standalone code highlighting.

use mordant::{
    footnote::{
        footnote_html_renderer_extension, footnote_parser_extension, FootnoteHtmlRendererOptions,
    },
    highlighter::{
        highlight_code as mordant_highlight_code, highlighting_html_renderer_extension,
        HighlightingMode, HighlightingRendererOptions,
    },
    meta::{meta_parser_extension, MetaParserOptions},
    new_markdown_to_html_string,
    parser::{self, GfmOptions, ParserExtension},
    renderer::html::{self, RendererExtension},
    Result as MordantResult,
};

use super::parse::parse_document;
use crate::core::dto::{HighlightCodeResult, MarkdownRenderOptions, MarkdownRenderResult};

fn renderer_options() -> html::Options {
    html::Options {
        // The webview still sanitises with DOMPurify, so raw HTML can pass through the renderer.
        allows_unsafe: true,
        ..html::Options::default()
    }
}

fn parser_options(opts: &MarkdownRenderOptions) -> parser::Options {
    parser::Options {
        attributes: opts.attributes,
        auto_heading_ids: opts.auto_heading_ids,
        ..parser::Options::default()
    }
}

fn highlighter_options(opts: &MarkdownRenderOptions) -> HighlightingRendererOptions {
    HighlightingRendererOptions {
        theme: opts.theme.clone(),
        mode: HighlightingMode::Attribute,
        ..HighlightingRendererOptions::default()
    }
}

fn render_with<'r, P, R>(
    source: &str,
    opts: &MarkdownRenderOptions,
    parser_extension: P,
    renderer_extension: R,
) -> MordantResult<String>
where
    P: parser::ParserExtension,
    R: html::RendererExtension<'r, String>,
{
    let render = new_markdown_to_html_string(
        parser_options(opts),
        renderer_options(),
        parser_extension,
        renderer_extension,
    );
    let mut html = String::with_capacity(source.len() * 2);
    render(&mut html, source)?;
    Ok(html)
}

pub fn render_html(source: &str, opts: &MarkdownRenderOptions) -> MordantResult<MarkdownRenderResult> {
    let meta_ext = meta_parser_extension(MetaParserOptions::default());
    let footnote_ext = footnote_parser_extension();
    let footnote_renderer = footnote_html_renderer_extension(FootnoteHtmlRendererOptions::default());

    // Phase 1 always uses GFM: it matches the current TypeScript renderer (tables, tasks,
    // strikethrough) and keeps the extension types concrete. `options.gfm` stays in the DTO for
    // the parity tests and a later opt-out.
    let make_parser_extension = || {
        parser::gfm(GfmOptions::default())
            .and(meta_ext)
            .and(footnote_ext)
    };

    let html = if opts.highlight_code {
        render_with(
            source,
            opts,
            make_parser_extension(),
            footnote_renderer.and(highlighting_html_renderer_extension(highlighter_options(opts))),
        )?
    } else {
        render_with(source, opts, make_parser_extension(), footnote_renderer)?
    };

    Ok(MarkdownRenderResult {
        html,
        source_map: parse_document(source)?.blocks,
    })
}

pub fn highlight_code_block(
    language: &str,
    code: &str,
    theme: &str,
) -> HighlightCodeResult {
    HighlightCodeResult {
        html: mordant_highlight_code(language, code, theme, &HighlightingMode::Attribute),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CORPUS: &str = include_str!("tests/fixtures/extension-corpus.md");

    #[test]
    fn renders_the_extension_corpus() {
        let result = render_html(CORPUS, &MarkdownRenderOptions::default()).unwrap();
        assert!(result.html.contains("Project notes"));
        assert!(result.html.contains("<table"));
        assert!(result.html.contains("footnote"));
        assert_eq!(result.source_map.len(), parse_document(CORPUS).unwrap().blocks.len());
    }

    #[test]
    fn highlighting_emits_inline_styles() {
        let result = highlight_code_block("rust", "fn main() {}", "InspiredGitHub");
        assert!(result.html.contains("<pre"));
        assert!(result.html.contains("font"));
    }

    #[test]
    fn code_highlighting_can_be_enabled_during_render() {
        let opts = MarkdownRenderOptions {
            highlight_code: true,
            ..MarkdownRenderOptions::default()
        };
        let result = render_html(CORPUS, &opts).unwrap();
        assert!(result.html.contains("font"));
    }
}
