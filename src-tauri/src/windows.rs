//! Windows and Spaces. Each window holds at most one Space, and a Space is open in at most one
//! window. The map lives here (not in the frontend) so every window sees the same truth, and
//! entries disappear when their window is destroyed.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder, Window};

#[derive(Default)]
pub struct SpaceClaims {
    /// window label → space id
    by_window: Mutex<HashMap<String, String>>,
    next: AtomicU32,
}

impl SpaceClaims {
    /// Binds `space` to `window`, or reports the other window that already holds it.
    pub fn claim(&self, window: &str, space: Option<&str>) -> Option<String> {
        let mut map = self.by_window.lock().unwrap();
        if let Some(space) = space {
            if let Some((other, _)) = map.iter().find(|(w, s)| s.as_str() == space && w.as_str() != window) {
                return Some(other.clone());
            }
            map.insert(window.to_string(), space.to_string());
        } else {
            map.remove(window);
        }
        None
    }

    pub fn holder(&self, space: &str) -> Option<String> {
        let map = self.by_window.lock().unwrap();
        map.iter().find(|(_, s)| s.as_str() == space).map(|(w, _)| w.clone())
    }

    pub fn release(&self, window: &str) {
        self.by_window.lock().unwrap().remove(window);
    }
}

#[tauri::command]
pub fn claim_space(window: Window, claims: State<'_, SpaceClaims>, space_id: Option<String>) -> Option<String> {
    claims.claim(window.label(), space_id.as_deref())
}

/// The window currently holding a Space, if any.
#[tauri::command]
pub fn space_window(claims: State<'_, SpaceClaims>, space_id: String) -> Option<String> {
    claims.holder(&space_id)
}

/// Opens a new editor window, optionally for a Space. Returns its label.
#[tauri::command]
pub async fn open_window(app: AppHandle, claims: State<'_, SpaceClaims>, space_id: Option<String>) -> Result<String, String> {
    let label = loop {
        let n = claims.next.fetch_add(1, Ordering::SeqCst) + 1;
        let label = format!("space-{n}");
        if app.get_webview_window(&label).is_none() {
            break label;
        }
    };
    // The frontend reads which Space to load from this global before any script runs.
    let init = format!(
        "window.__CALMMD_SPACE__ = {};",
        serde_json::to_string(&space_id).map_err(|e| e.to_string())?
    );
    let offset = 28.0 * (app.webview_windows().len() as f64 % 8.0);
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("CalmMD")
        .inner_size(1100.0, 760.0)
        .min_inner_size(480.0, 360.0)
        .position(80.0 + offset, 60.0 + offset)
        .initialization_script(&init)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(label)
}

/// The window label for a drawing: the same file always gets the same window.
pub fn drawing_label(path: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    path.replace('\\', "/").to_lowercase().hash(&mut h);
    format!("drawing-{:016x}", h.finish())
}

/// Opens a drawing in its own window, or brings its window forward if it's already open.
#[tauri::command]
pub async fn open_drawing_window(app: AppHandle, path: String, title: String) -> Result<String, String> {
    let label = drawing_label(&path);
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(label);
    }
    // The frontend reads which drawing to open from this global before any script runs.
    let init = format!("window.__CALMMD_DRAWING__ = {};", serde_json::to_string(&path).map_err(|e| e.to_string())?);
    let offset = 28.0 * (app.webview_windows().len() as f64 % 8.0);
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(1200.0, 820.0)
        .min_inner_size(560.0, 400.0)
        .position(100.0 + offset, 80.0 + offset)
        .initialization_script(&init)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(label)
}

#[tauri::command]
pub fn focus_window(app: AppHandle, label: String) -> Result<(), String> {
    let w = app.get_webview_window(&label).ok_or("window not found")?;
    let _ = w.unminimize();
    w.show().map_err(|e| e.to_string())?;
    w.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_labels(app: AppHandle) -> Vec<String> {
    app.webview_windows().keys().cloned().collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_drawing_always_gets_the_same_window() {
        assert_eq!(drawing_label("C:\\Notes\\Plan.excalidraw.svg"), drawing_label("c:/notes/plan.excalidraw.svg"));
        assert_ne!(drawing_label("/n/a.excalidraw.svg"), drawing_label("/n/b.excalidraw.svg"));
        assert!(drawing_label("/n/a.excalidraw.svg").starts_with("drawing-"));
    }

    #[test]
    fn a_space_lives_in_one_window() {
        let c = SpaceClaims::default();
        assert_eq!(c.claim("main", Some("a")), None);
        assert_eq!(c.claim("space-1", Some("a")), Some("main".to_string()));
        // Re-claiming your own space is fine.
        assert_eq!(c.claim("main", Some("a")), None);
        // Switching releases the old one.
        assert_eq!(c.claim("main", Some("b")), None);
        assert_eq!(c.claim("space-1", Some("a")), None);
        c.release("space-1");
        assert_eq!(c.claim("main", Some("a")), None);
        assert_eq!(c.claim("main", None), None);
        assert_eq!(c.claim("space-2", Some("b")), None);
        assert_eq!(c.holder("b"), Some("space-2".to_string()));
        assert_eq!(c.holder("zzz"), None);
    }
}
