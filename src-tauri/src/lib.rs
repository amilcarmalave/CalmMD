mod cdp;
mod export;
mod fsops;
mod kv;
mod search;
mod spell;
mod tree;
mod windows;

use std::path::Path;
use tauri::{Emitter, Manager};

fn file_args<I: IntoIterator<Item = String>>(args: I) -> Vec<String> {
    args.into_iter()
        .filter(|a| !a.starts_with('-'))
        .filter(|a| Path::new(a).is_file())
        .map(|a| {
            std::path::absolute(&a)
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or(a)
        })
        .collect()
}

/// Files passed on the command line (also how "Open with" works on Windows and Linux).
#[tauri::command]
fn launch_paths() -> Vec<String> {
    file_args(std::env::args().skip(1))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Opening a file while CalmMD is running hands it to the running instance instead of
        // starting a second one.
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let paths = file_args(args.into_iter().skip(1));
            let target = app
                .get_webview_window("main")
                .or_else(|| app.webview_windows().into_values().next());
            if let Some(w) = target {
                let _ = w.unminimize();
                let _ = w.set_focus();
                if !paths.is_empty() {
                    let _ = app.emit_to(w.label(), "calmmd://open-paths", paths);
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(windows::SpaceClaims::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                window.state::<windows::SpaceClaims>().release(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            fsops::read_text_file,
            fsops::write_text_file,
            fsops::stat_path,
            fsops::write_binary_file,
            fsops::copy_file,
            fsops::pending_assets_dir,
            tree::list_dir,
            search::search_files,
            tree::create_file,
            tree::create_dir,
            tree::rename_path,
            tree::trash_path,
            kv::kv_get,
            kv::kv_set,
            kv::kv_delete,
            kv::kv_list,
            windows::claim_space,
            windows::space_window,
            windows::open_window,
            windows::focus_window,
            windows::window_labels,
            export::find_browser,
            export::print_pdf,
            export::read_image_data_url,
            export::find_pandoc,
            export::pandoc_convert,
            export::themes_dir,
            spell::spell_check,
            spell::spell_check_text,
            spell::spell_learn,
            launch_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running CalmMD");
}
