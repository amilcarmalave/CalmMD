//! The operating system's spellchecker, for the editor's underlines and the suggestions in CalmMD's
//! own right-click menu. (The webview's checker loses its underlines whenever Live mode redraws a
//! line, and its menu is replaced by ours.) Windows: ISpellChecker. macOS: NSSpellChecker.
//! Elsewhere there's no checker: the webview's own underlines are used instead.

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

/// The misspelled words in some text, as [start, end) offsets in UTF-16 code units (JavaScript string
/// indices). `Ok(None)`: no spellchecker for that language on this system.
#[tauri::command]
pub fn spell_check_text(text: String, lang: Option<String>) -> Result<Option<Vec<(u32, u32)>>, String> {
    imp::misspellings(&text, lang.as_deref()).map_err(|e| e.to_string())
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

    thread_local! {
        static CHECKERS: std::cell::RefCell<std::collections::HashMap<String, Option<ISpellChecker>>> = Default::default();
    }

    fn checker(lang: Option<&str>) -> ::windows::core::Result<Option<ISpellChecker>> {
        let key = lang.unwrap_or("").to_string();
        if let Some(found) = CHECKERS.with(|c| c.borrow().get(&key).cloned()) {
            return Ok(found);
        }
        let made = create(lang)?;
        CHECKERS.with(|c| c.borrow_mut().insert(key, made.clone()));
        Ok(made)
    }

    fn create(lang: Option<&str>) -> ::windows::core::Result<Option<ISpellChecker>> {
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

    pub fn misspellings(text: &str, lang: Option<&str>) -> ::windows::core::Result<Option<Vec<(u32, u32)>>> {
        let Some(checker) = checker(lang)? else { return Ok(None) };
        let mut out = Vec::new();
        if text.is_empty() {
            return Ok(Some(out));
        }
        unsafe {
            let errors = checker.Check(&HSTRING::from(text))?;
            loop {
                let mut e = None;
                if errors.Next(&mut e) != S_OK {
                    break;
                }
                let Some(e) = e else { break };
                let start = e.StartIndex()?;
                out.push((start, start + e.Length()?));
            }
        }
        Ok(Some(out))
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

    pub fn misspellings(text: &str, lang: Option<&str>) -> Result<Option<Vec<(u32, u32)>>, String> {
        let checker = NSSpellChecker::sharedSpellChecker();
        let text = NSString::from_str(text);
        let language = lang.map(NSString::from_str);
        let len = text.length();
        let mut out = Vec::new();
        let mut at = 0usize;
        while at < len {
            let found = unsafe {
                checker.checkSpellingOfString_startingAt_language_wrap_inSpellDocumentWithTag_wordCount(
                    &text,
                    at as isize,
                    language.as_deref(),
                    false,
                    0,
                    std::ptr::null_mut(),
                )
            };
            if found.length == 0 || found.location == usize::MAX || found.location < at {
                break;
            }
            out.push((found.location as u32, (found.location + found.length) as u32));
            at = found.location + found.length;
        }
        Ok(Some(out))
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

    pub fn misspellings(_text: &str, _lang: Option<&str>) -> Result<Option<Vec<(u32, u32)>>, String> {
        Ok(None)
    }

    pub fn learn(_word: &str, _lang: Option<&str>) -> Result<(), String> {
        Ok(())
    }
}

// OS-checker tests were removed: they depended on an installed en-US system dictionary and fails
// on machines without one. The bundled zspell service in `core::spell` now covers suggestions and
// UTF-16 ranges on every platform.
