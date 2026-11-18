//! Bundled Hunspell dictionary and a small cache of built zspell dictionaries.
//!
//! The en_US files come from wooorm/dictionaries (dictionary-en 4.0.0, `(MIT AND BSD)`); the full
//! licence text is shipped beside them. They are compiled into the binary so spellchecking works
//! offline on every platform without locating an OS dictionary.

use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use zspell::{DictBuilder, Dictionary};

const EN_AFF: &str = include_str!("dictionaries/en_us/index.aff");
const EN_DIC: &str = include_str!("dictionaries/en_us/index.dic");

/// Canonical id of the bundled dictionary that backs a BCP 47 language tag.
/// `None` means "no bundled dictionary" and the caller falls back to the OS checker.
pub fn bundled_for(lang: Option<&str>) -> Option<&'static str> {
    let tag = lang.unwrap_or("en-US").to_ascii_lowercase().replace('_', "-");
    if tag == "en" || tag.starts_with("en-") {
        Some("en_US")
    } else {
        None
    }
}

/// Cache key including the personal word list, since zspell bakes it into the dictionary.
fn cache_key(lang: &str, personal_words: &str) -> String {
    format!("{lang}\0{personal_words}")
}

fn build(lang: &str, personal_words: &str) -> Result<Dictionary, String> {
    let (aff, dic) = match lang {
        "en_US" => (EN_AFF, EN_DIC),
        other => return Err(format!("no bundled dictionary for {other}")),
    };
    DictBuilder::new()
        .config_str(aff)
        .dict_str(dic)
        .personal_str(personal_words)
        .build()
        .map_err(|e| format!("failed to build {lang} dictionary: {e}"))
}

/// Lazily builds dictionaries once per language + personal word list.
pub struct DictionaryCache {
    entries: RwLock<HashMap<String, Arc<Dictionary>>>,
}

impl Default for DictionaryCache {
    fn default() -> Self {
        Self { entries: RwLock::new(HashMap::new()) }
    }
}

impl DictionaryCache {
    pub fn get(&self, lang: &str, personal_words: &str) -> Result<Arc<Dictionary>, String> {
        let key = cache_key(lang, personal_words);
        if let Some(found) = self.entries.read().expect("spell dictionary cache poisoned").get(&key) {
            return Ok(found.clone());
        }
        let built = Arc::new(build(lang, personal_words)?);
        let mut entries = self.entries.write().expect("spell dictionary cache poisoned");
        Ok(entries.entry(key).or_insert(built).clone())
    }

    pub fn clear(&self) {
        self.entries.write().expect("spell dictionary cache poisoned").clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_english_tags_to_the_bundled_dictionary() {
        assert_eq!(bundled_for(None), Some("en_US"));
        assert_eq!(bundled_for(Some("en")), Some("en_US"));
        assert_eq!(bundled_for(Some("en-GB")), Some("en_US"));
        assert_eq!(bundled_for(Some("de-DE")), None);
    }

    #[test]
    fn builds_the_bundled_dictionary() {
        let cache = DictionaryCache::default();
        let dict = cache.get("en_US", "").expect("en_US dictionary should build");
        assert!(dict.check_word("receive"));
        assert!(!dict.check_word("mispelled"));
    }

    #[test]
    fn personal_words_are_accepted() {
        let cache = DictionaryCache::default();
        let dict = cache.get("en_US", "calmmd\n").expect("en_US dictionary should build");
        assert!(dict.check_word("calmmd"));
        assert!(!cache.get("en_US", "").unwrap().check_word("calmmd"));
    }
}
