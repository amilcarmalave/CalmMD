//! Native spellchecking service backed by zspell and a bundled Hunspell dictionary.
//!
//! The OS checker in `spell.rs` stays as a fallback for languages we do not bundle. This module is
//! feature-flagged from the webview (`VITE_CALMMD_RUST_SPELL` / `calmmd.rust.spell`), so the OS path
//! remains available while dictionaries and suggestion quality are being compared.

mod dictionary;
mod utf16;

use std::sync::OnceLock;

use serde::Serialize;
use tauri::AppHandle;

pub use dictionary::bundled_for;
use dictionary::DictionaryCache;

#[derive(Serialize, Debug, PartialEq)]
pub struct SpellCheckDto {
    pub misspelled: bool,
    pub suggestions: Vec<String>,
}

const MAX_SUGGESTIONS: usize = 6;

static CACHE: OnceLock<DictionaryCache> = OnceLock::new();

fn cache() -> &'static DictionaryCache {
    CACHE.get_or_init(DictionaryCache::default)
}

fn personal_key(lang: &str) -> String {
    format!("spell/personal/{lang}")
}

fn read_personal(app: &AppHandle, lang: &str) -> Result<String, String> {
    Ok(crate::kv::read(app, &personal_key(lang))?.unwrap_or_default())
}

/// Adds a word to a Hunspell personal dictionary, keeping the file stable and duplicate-free.
fn add_personal_word(current: &str, word: &str) -> String {
    let word = word.trim();
    if word.is_empty() || !word.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '\'' | '’')) {
        return current.to_string();
    }
    let mut words: Vec<String> = current
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_string)
        .collect();
    // zspell checks the exact word and its lowercase form; storing lowercase makes a learned
    // capitalised word accepted in any case, matching the old OS dictionary behaviour.
    let word = word.to_lowercase();
    if !words.iter().any(|w| w.eq_ignore_ascii_case(&word)) {
        words.push(word);
    }
    words.sort();
    words.dedup();
    words.join("\n")
}

/// Checks a single word against the bundled dictionary for `lang`.
/// `Ok(None)` means no bundled dictionary is available for that language.
pub fn check(word: &str, lang: Option<&str>, personal_words: &str) -> Result<Option<SpellCheckDto>, String> {
    let word = word.trim();
    if word.is_empty() {
        return Ok(None);
    }
    let Some(lang) = bundled_for(lang) else { return Ok(None) };
    let dict = cache().get(lang, personal_words)?;
    let misspelled = !dict.check_word(word);
    let suggestions = if misspelled {
        dict.entry(word)
            .suggest()
            .unwrap_or_default()
            .into_iter()
            .filter(|s| *s != word)
            .take(MAX_SUGGESTIONS)
            .map(str::to_string)
            .collect()
    } else {
        Vec::new()
    };
    Ok(Some(SpellCheckDto { misspelled, suggestions }))
}

/// Misspelled ranges as UTF-16 code units, matching CodeMirror's string offsets.
pub fn check_text(text: &str, lang: Option<&str>, personal_words: &str) -> Result<Option<Vec<(u32, u32)>>, String> {
    let Some(lang) = bundled_for(lang) else { return Ok(None) };
    let dict = cache().get(lang, personal_words)?;
    let mut ranges = Vec::new();
    for (start, word) in dict.check_indices(text) {
        let end = start + word.len();
        ranges.push((utf16::byte_to_utf16(text, start), utf16::byte_to_utf16(text, end)));
    }
    Ok(Some(ranges))
}

#[tauri::command]
pub fn core_spell_check(app: AppHandle, word: String, lang: Option<String>) -> Result<Option<SpellCheckDto>, String> {
    let Some(lang) = bundled_for(lang.as_deref()) else { return Ok(None) };
    check(&word, Some(lang), &read_personal(&app, lang)?)
}

#[tauri::command]
pub fn core_spell_check_text(app: AppHandle, text: String, lang: Option<String>) -> Result<Option<Vec<(u32, u32)>>, String> {
    let Some(lang) = bundled_for(lang.as_deref()) else { return Ok(None) };
    check_text(&text, Some(lang), &read_personal(&app, lang)?)
}

/// Returns `true` when the Rust service handled the word; `false` asks the webview to fall back
/// to the OS user dictionary (unknown language).
#[tauri::command]
pub fn core_spell_learn(app: AppHandle, word: String, lang: Option<String>) -> Result<bool, String> {
    let Some(lang) = bundled_for(lang.as_deref()) else { return Ok(false) };
    let word = word.trim();
    if word.is_empty() || !word.chars().all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '\'' | '’')) {
        return Ok(true);
    }
    let current = read_personal(&app, lang)?;
    let updated = add_personal_word(&current, word);
    if updated != current {
        crate::kv::write(&app, &personal_key(lang), &updated)?;
        cache().clear();
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_misspellings_and_offers_suggestions() {
        let result = check("mispelled", Some("en-US"), "").unwrap().unwrap();
        assert!(result.misspelled);
        assert!(result.suggestions.iter().any(|s| s == "misspelled"), "{:?}", result.suggestions);

        let good = check("receive", Some("en-US"), "").unwrap().unwrap();
        assert_eq!(good, SpellCheckDto { misspelled: false, suggestions: Vec::new() });
    }

    #[test]
    fn reports_utf16_ranges_after_multibyte_characters() {
        let text = "Café 😀 I mispelled teh mail.";
        // "Café" is a proper noun absent from the bundled dictionary; teach it to keep the test
        // focused on UTF-16 offset conversion.
        let found = check_text(text, Some("en-US"), "Café\n").unwrap().unwrap();
        let utf16: Vec<u16> = text.encode_utf16().collect();
        let words: Vec<String> = found
            .iter()
            .map(|&(a, b)| String::from_utf16_lossy(&utf16[a as usize..b as usize]))
            .collect();
        assert_eq!(words, vec!["mispelled", "teh"]);
    }

    #[test]
    fn personal_words_are_accepted_and_sorted() {
        let stored = add_personal_word("", "calmmd");
        let stored = add_personal_word(&stored, "Zettel");
        let stored = add_personal_word(&stored, "calmmd");
        assert_eq!(stored, "calmmd\nzettel");

        let dict = cache().get("en_US", &stored).unwrap();
        assert!(dict.check_word("calmmd"));
        assert!(dict.check_word("zettel"));
    }

    #[test]
    fn unknown_languages_fall_back_to_the_os_checker() {
        assert!(check("mispelled", Some("de-DE"), "").unwrap().is_none());
        assert!(check_text("mispelled", Some("de-DE"), "").unwrap().is_none());
    }
}
