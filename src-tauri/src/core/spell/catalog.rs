//! Curated Hunspell dictionary catalogue.
//!
//! Bundled dictionaries are compiled into the binary and work offline. Optional dictionaries are
//! downloaded from a fixed, permissively licensed source only when the user asks for them.

use serde::Serialize;

pub const UPSTREAM: &str = "https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries";

#[derive(Debug, Clone, Copy)]
pub struct DictionaryEntry {
    pub id: &'static str,
    pub label: &'static str,
    /// BCP 47 tags this dictionary answers, first tag is the canonical one.
    pub languages: &'static [&'static str],
    pub license: &'static str,
    /// Upstream directory for downloadable dictionaries; empty for generated built-ins.
    pub upstream: &'static str,
    pub bundled: bool,
}

pub const DICTIONARIES: &[DictionaryEntry] = &[
    DictionaryEntry {
        id: "en_US",
        label: "English (US)",
        languages: &["en-US", "en"],
        license: "MIT AND BSD",
        upstream: "en",
        bundled: true,
    },
    DictionaryEntry {
        id: "en_GB",
        label: "English (UK)",
        languages: &["en-GB"],
        license: "MIT AND BSD",
        upstream: "en-GB",
        bundled: true,
    },
    DictionaryEntry {
        id: "de_DE",
        label: "German",
        languages: &["de-DE", "de"],
        license: "Apache-2.0",
        upstream: "",
        bundled: true,
    },
    DictionaryEntry {
        id: "fr_FR",
        label: "French",
        languages: &["fr-FR", "fr"],
        license: "Apache-2.0",
        upstream: "",
        bundled: true,
    },
    DictionaryEntry {
        id: "es_ES",
        label: "Spanish",
        languages: &["es-ES", "es"],
        license: "Apache-2.0",
        upstream: "",
        bundled: true,
    },
    DictionaryEntry {
        id: "ru_RU",
        label: "Russian",
        languages: &["ru-RU", "ru"],
        license: "BSD-3-Clause",
        upstream: "ru",
        bundled: false,
    },
    DictionaryEntry {
        id: "en_CA",
        label: "English (Canada)",
        languages: &["en-CA"],
        license: "MIT AND BSD",
        upstream: "en-CA",
        bundled: false,
    },
    DictionaryEntry {
        id: "en_AU",
        label: "English (Australia)",
        languages: &["en-AU"],
        license: "MIT AND BSD",
        upstream: "en-AU",
        bundled: false,
    },
    DictionaryEntry {
        id: "tr_TR",
        label: "Turkish",
        languages: &["tr-TR", "tr"],
        license: "MIT",
        upstream: "tr",
        bundled: false,
    },
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DictionaryInfo {
    pub id: String,
    pub label: String,
    pub languages: Vec<String>,
    pub license: String,
    pub installed: bool,
    pub bundled: bool,
    pub source: String,
}

pub fn by_id(id: &str) -> Option<&'static DictionaryEntry> {
    DICTIONARIES.iter().find(|entry| entry.id == id)
}

pub fn normalize_lang(lang: Option<&str>) -> String {
    lang.unwrap_or("en-US").trim().to_ascii_lowercase().replace('_', "-")
}

/// Exact tag, then primary language; unknown languages do not silently use English.
pub fn entry_for_lang(lang: Option<&str>) -> Option<&'static DictionaryEntry> {
    let tag = normalize_lang(lang);
    if let Some(entry) = DICTIONARIES.iter().find(|e| e.languages.iter().any(|l| l.to_ascii_lowercase() == tag)) {
        return Some(entry);
    }
    let primary = tag.split('-').next().unwrap_or("");
    DICTIONARIES
        .iter()
        .find(|e| e.languages.iter().any(|l| l.split('-').next().unwrap_or("") == primary && !l.contains('-')))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_language_tags_to_curated_dictionaries() {
        assert_eq!(entry_for_lang(None).unwrap().id, "en_US");
        assert_eq!(entry_for_lang(Some("en")).unwrap().id, "en_US");
        assert_eq!(entry_for_lang(Some("en_GB")).unwrap().id, "en_GB");
        assert_eq!(entry_for_lang(Some("de-DE")).unwrap().id, "de_DE");
        assert_eq!(entry_for_lang(Some("fr")).unwrap().id, "fr_FR");
        assert_eq!(entry_for_lang(Some("es-ES")).unwrap().id, "es_ES");
        assert_eq!(entry_for_lang(Some("ru-RU")).unwrap().id, "ru_RU");
        assert!(entry_for_lang(Some("pt-BR")).is_none());
    }

    #[test]
    fn catalogue_uses_only_permissive_licences() {
        for entry in DICTIONARIES {
            assert!(
                entry.license.contains("MIT")
                    || entry.license.contains("BSD")
                    || entry.license.contains("Apache")
                    || entry.license.contains("ISC"),
                "{} uses {}",
                entry.id,
                entry.license
            );
        }
    }
}
