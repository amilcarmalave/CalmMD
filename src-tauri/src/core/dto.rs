//! Serde DTOs shared by Rust core commands and the TypeScript platform layer.

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HeadingDto {
    pub level: u8,
    pub text: String,
    pub id: String,
    pub line: usize,
    pub byte_start: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceBlockDto {
    pub kind: String,
    pub start_line: usize,
    pub end_line: usize,
    pub byte_start: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownParseResult {
    pub headings: Vec<HeadingDto>,
    pub front_matter: Value,
    pub blocks: Vec<SourceBlockDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownRenderOptions {
    #[serde(default = "default_true")]
    pub gfm: bool,
    #[serde(default = "default_true")]
    pub footnotes: bool,
    #[serde(default = "default_true")]
    pub attributes: bool,
    #[serde(default = "default_true")]
    pub auto_heading_ids: bool,
    #[serde(default)]
    pub highlight_code: bool,
    #[serde(default = "default_theme")]
    pub theme: String,
}

impl Default for MarkdownRenderOptions {
    fn default() -> Self {
        Self {
            gfm: true,
            footnotes: true,
            attributes: true,
            auto_heading_ids: true,
            highlight_code: false,
            theme: default_theme(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_theme() -> String {
    "CalmMD Snow".to_owned()
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownRenderResult {
    pub html: String,
    pub source_map: Vec<SourceBlockDto>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HighlightCodeResult {
    pub html: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_options_default_to_the_current_preview_behaviour() {
        let opts = MarkdownRenderOptions::default();
        assert!(opts.gfm && opts.footnotes && opts.attributes && opts.auto_heading_ids);
        assert!(!opts.highlight_code);
        assert_eq!(opts.theme, "CalmMD Snow");
    }

    #[test]
    fn render_options_accept_partial_json() {
        let opts: MarkdownRenderOptions = serde_json::from_str(r#"{"highlightCode":true,"theme":"Dracula"}"#).unwrap();
        assert!(opts.gfm);
        assert!(opts.highlight_code);
        assert_eq!(opts.theme, "Dracula");
    }
}
