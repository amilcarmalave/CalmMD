//! Rust core services: Markdown parsing/rendering and native spellchecking behind Tauri commands.

pub mod dto;
pub mod markdown;
pub mod spell;

use dto::{HighlightCodeResult, MarkdownParseResult, MarkdownRenderOptions, MarkdownRenderResult};

#[tauri::command]
pub fn markdown_parse(text: String) -> Result<MarkdownParseResult, String> {
    markdown::parse_document(&text).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn markdown_render(
    text: String,
    options: Option<MarkdownRenderOptions>,
) -> Result<MarkdownRenderResult, String> {
    markdown::render_html(&text, &options.unwrap_or_default()).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn markdown_highlight_code(
    language: String,
    code: String,
    theme: Option<String>,
) -> HighlightCodeResult {
    markdown::highlight_code_block(
        &language,
        &code,
        theme.as_deref().unwrap_or("InspiredGitHub"),
    )
}
