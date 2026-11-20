//! A tiny durable key/value store under `<app data>/state/`. Each key is one file written
//! atomically. Used for drafts, the session, and settings. Keys look like `draft/abc123`.

use crate::fsops::{describe, write_atomic};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const EXT: &str = ".kv";

fn state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("state");
    fs::create_dir_all(&dir).map_err(|e| describe(&e))?;
    Ok(dir)
}

/// Maps a key to a file name. Only a conservative character set is allowed, so keys can
/// never escape the state directory. '/' becomes '~' because '~' isn't allowed in keys.
pub fn key_to_file(key: &str) -> Result<String, String> {
    let valid = !key.is_empty()
        && key.len() <= 200
        && !key.starts_with('/')
        && !key.contains("..")
        && key.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '/'));
    if !valid {
        return Err(format!("invalid key: {key:?}"));
    }
    Ok(format!("{}{EXT}", key.replace('/', "~")))
}

pub fn file_to_key(name: &str) -> Option<String> {
    name.strip_suffix(EXT).map(|s| s.replace('~', "/"))
}

fn key_path(dir: &Path, key: &str) -> Result<PathBuf, String> {
    Ok(dir.join(key_to_file(key)?))
}

/// Reads a key, or `None` when it was never written. Other callers (the MCP server) share this
/// store so settings written from Rust stay visible to the webview.
pub fn read(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    let p = key_path(&state_dir(app)?, key)?;
    match fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(describe(&e)),
    }
}

pub fn write(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let p = key_path(&state_dir(app)?, key)?;
    write_atomic(&p, value.as_bytes()).map_err(|e| describe(&e))
}

pub fn delete(app: &AppHandle, key: &str) -> Result<(), String> {
    let p = key_path(&state_dir(app)?, key)?;
    match fs::remove_file(&p) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(describe(&e)),
    }
}

#[tauri::command]
pub async fn kv_get(app: AppHandle, key: String) -> Result<Option<String>, String> {
    read(&app, &key)
}

#[tauri::command]
pub async fn kv_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    write(&app, &key, &value)
}

#[tauri::command]
pub async fn kv_delete(app: AppHandle, key: String) -> Result<(), String> {
    delete(&app, &key)
}

#[tauri::command]
pub async fn kv_list(app: AppHandle, prefix: String) -> Result<Vec<String>, String> {
    let dir = state_dir(&app)?;
    let mut keys: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| describe(&e))?
        .filter_map(|e| e.ok())
        .filter_map(|e| file_to_key(&e.file_name().to_string_lossy()))
        .filter(|k| k.starts_with(&prefix))
        .collect();
    keys.sort();
    Ok(keys)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_round_trip() {
        let f = key_to_file("draft/ab-12_x.y").unwrap();
        assert_eq!(f, "draft~ab-12_x.y.kv");
        assert_eq!(file_to_key(&f).unwrap(), "draft/ab-12_x.y");
    }

    #[test]
    fn rejects_unsafe_keys() {
        for bad in ["", "../x", "/abs", "a\\b", "a:b", "a~b", "a b"] {
            assert!(key_to_file(bad).is_err(), "{bad:?} should be rejected");
        }
    }
}
