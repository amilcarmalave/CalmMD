//! The operating system's spellchecker, for suggestions in CalmMD's own right-click menu. The
//! webview draws the red underlines, but its native menu (which lists suggestions) is replaced by
//! ours, so we ask the same OS spellchecker directly. Windows: ISpellChecker. macOS: NSSpellChecker.
//! Elsewhere there's no checker and the menu shows no suggestions.

use serde::Serialize;

#[derive(Serialize, Debug, PartialEq)]
pub struct SpellCheck {
    pub misspelled: bool,
    pub suggestions: Vec<String>,
}

/// Up to this many suggestions go in the menu.
const MAX_SUGGESTIONS: usize = 6;

/// Checks one word. `lang` is a BCP 47 tag ("en-US") or none for the system language.
/// `Ok(None)`: no spellchecker for that language on this system.
#[tauri::command]
pub fn spell_check(word: String, lang: Option<String>) -> Result<Option<SpellCheck>, String> {
    let word = word.trim();
    if word.is_empty() {
        return Ok(None);
    }
    imp::check(word, lang.as_deref()).map_err(|e| e.to_string())
}

/// Adds a word to the user's dictionary (shared with other apps on this system).
#[tauri::command]
pub fn spell_learn(word: String, lang: Option<String>) -> Result<(), String> {
    imp::learn(word.trim(), lang.as_deref()).map_err(|e| e.to_string())
}

#[cfg(windows)]
mod imp {
    use super::{SpellCheck, MAX_SUGGESTIONS};
    use ::windows::core::{HSTRING, PWSTR};
    use ::windows::Win32::Foundation::S_OK;
    use ::windows::Win32::Globalization::{GetUserDefaultLocaleName, ISpellChecker, ISpellCheckerFactory, SpellCheckerFactory};
    use ::windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};

    fn system_language() -> String {
        let mut buf = [0u16; 85];
        let n = unsafe { GetUserDefaultLocaleName(&mut buf) };
        if n > 1 {
            String::from_utf16_lossy(&buf[..(n as usize - 1)])
        } else {
            "en-US".into()
        }
    }

    fn checker(lang: Option<&str>) -> ::windows::core::Result<Option<ISpellChecker>> {
        unsafe {
            // Already initialised on this thread (by the webview) is fine.
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let factory: ISpellCheckerFactory = CoCreateInstance(&SpellCheckerFactory, None, CLSCTX_INPROC_SERVER)?;
            let wanted = lang.map(str::to_string).unwrap_or_else(system_language);
            for tag in [wanted.as_str(), wanted.split('-').next().unwrap_or(""), "en-US"] {
                if tag.is_empty() {
                    continue;
                }
                let tag = HSTRING::from(tag);
                if factory.IsSupported(&tag)?.as_bool() {
                    return Ok(Some(factory.CreateSpellChecker(&tag)?));
                }
            }
            Ok(None)
        }
    }

    pub fn check(word: &str, lang: Option<&str>) -> ::windows::core::Result<Option<SpellCheck>> {
        let Some(checker) = checker(lang)? else { return Ok(None) };
        unsafe {
            let errors = checker.Check(&HSTRING::from(word))?;
            let mut first = None;
            let misspelled = errors.Next(&mut first) == S_OK && first.is_some();
            let mut suggestions = Vec::new();
            if misspelled {
                let list = checker.Suggest(&HSTRING::from(word))?;
                while suggestions.len() < MAX_SUGGESTIONS {
                    let mut item = [PWSTR::null()];
                    let mut fetched = 0u32;
                    if list.Next(&mut item, Some(&mut fetched)) != S_OK || fetched == 0 {
                        break;
                    }
                    if let Ok(s) = item[0].to_string() {
                        if s != word {
                            suggestions.push(s);
                        }
                    }
                    CoTaskMemFree(Some(item[0].0 as *const _));
                }
            }
            Ok(Some(SpellCheck { misspelled, suggestions }))
        }
    }

    pub fn learn(word: &str, lang: Option<&str>) -> ::windows::core::Result<()> {
        if let Some(checker) = checker(lang)? {
            unsafe { checker.Add(&HSTRING::from(word))? };
        }
        Ok(())
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use super::{SpellCheck, MAX_SUGGESTIONS};
    use objc2_app_kit::NSSpellChecker;
    use objc2_foundation::{NSRange, NSString};

    pub fn check(word: &str, lang: Option<&str>) -> Result<Option<SpellCheck>, String> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let text = NSString::from_str(word);
        let language = lang.map(NSString::from_str);
        let found = unsafe {
            checker.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                &text,
                0,
                language.as_deref(),
                false,
                0,
                std::ptr::null_mut(),
            )
        };
        // NSNotFound (location) means no misspelling.
        let misspelled = found.length > 0 && found.location != usize::MAX;
        let mut suggestions = Vec::new();
        if misspelled {
            let range = NSRange::new(0, text.length());
            if let Some(guesses) = checker.guessesForWordRange_inString_language_inSpellDocumentWithTag(range, &text, language.as_deref(), 0) {
                for g in guesses.iter().take(MAX_SUGGESTIONS) {
                    suggestions.push(g.to_string());
                }
            }
        }
        Ok(Some(SpellCheck { misspelled, suggestions }))
    }

    pub fn learn(word: &str, _lang: Option<&str>) -> Result<(), String> {
        NSSpellChecker::sharedSpellChecker().learnWord(&NSString::from_str(word));
        Ok(())
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod imp {
    use super::SpellCheck;

    pub fn check(_word: &str, _lang: Option<&str>) -> Result<Option<SpellCheck>, String> {
        Ok(None)
    }

    pub fn learn(_word: &str, _lang: Option<&str>) -> Result<(), String> {
        Ok(())
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn suggests_for_a_misspelled_word_and_accepts_a_correct_one() {
        let bad = spell_check("recieve".into(), Some("en-US".into())).unwrap().expect("Windows has an en-US spellchecker");
        assert!(bad.misspelled);
        assert!(bad.suggestions.iter().any(|s| s == "receive"), "{:?}", bad.suggestions);
        let good = spell_check("receive".into(), Some("en-US".into())).unwrap().unwrap();
        assert_eq!(good, SpellCheck { misspelled: false, suggestions: vec![] });
    }
}
