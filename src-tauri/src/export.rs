//! Export helpers.
//!
//! PDF: the frontend builds a self-contained HTML page (fonts and images inlined, Paged.js for
//! pagination, running headers, page numbers and TOC page numbers). Here we print it with a headless
//! Chromium-family browser. Edge ships with Windows 10/11, so Windows needs no install. On
//! macOS and Linux any Chrome, Edge, Chromium or Brave works. Without one, the frontend falls back to
//! the system print dialog.

use base64::Engine;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

fn on_path(names: &[&str]) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        for name in names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
            #[cfg(windows)]
            {
                let exe = dir.join(format!("{name}.exe"));
                if exe.is_file() {
                    return Some(exe);
                }
            }
        }
    }
    None
}

pub fn browser_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Some(custom) = std::env::var_os("CALMMD_CHROME") {
        out.push(PathBuf::from(custom));
    }
    #[cfg(windows)]
    {
        let roots: Vec<PathBuf> = ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"]
            .iter()
            .filter_map(|v| std::env::var_os(v).map(PathBuf::from))
            .collect();
        for rel in [
            r"Microsoft\Edge\Application\msedge.exe",
            r"Google\Chrome\Application\chrome.exe",
            r"BraveSoftware\Brave-Browser\Application\brave.exe",
            r"Chromium\Application\chrome.exe",
        ] {
            for root in &roots {
                out.push(root.join(rel));
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_default();
        for app in [
            "Google Chrome.app/Contents/MacOS/Google Chrome",
            "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "Chromium.app/Contents/MacOS/Chromium",
            "Brave Browser.app/Contents/MacOS/Brave Browser",
        ] {
            out.push(Path::new("/Applications").join(app));
            out.push(home.join("Applications").join(app));
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        for name in [
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
            "microsoft-edge",
            "microsoft-edge-stable",
            "brave-browser",
        ] {
            if let Some(p) = on_path(&[name]) {
                out.push(p);
            }
        }
    }
    out
}

#[tauri::command]
pub fn find_browser() -> Option<String> {
    browser_candidates().into_iter().find(|p| p.is_file()).map(|p| p.to_string_lossy().into_owned())
}

fn unique_temp_dir(tag: &str) -> std::io::Result<PathBuf> {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    let dir = std::env::temp_dir().join(format!("calmmd-{tag}-{}-{nanos}", std::process::id()));
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub(crate) fn hide_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

/// Runs a command with a timeout, killing it if it overruns.
fn run_with_timeout(mut cmd: Command, timeout: Duration) -> Result<(), String> {
    cmd.stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null());
    hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Couldn't start the PDF engine: {e}"))?;
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => return Ok(()),
            Ok(None) if start.elapsed() > timeout => {
                let _ = child.kill();
                return Err("PDF export took too long and was stopped.".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(60)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

#[tauri::command]
pub async fn print_pdf(html: String, out: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let browser = find_browser().ok_or_else(|| "NO_BROWSER".to_string())?;
        let dir = unique_temp_dir("print").map_err(|e| e.to_string())?;
        let page = dir.join("export.html");
        fs::write(&page, html).map_err(|e| e.to_string())?;
        let out_path = PathBuf::from(&out);
        let url = format!("file:///{}", page.to_string_lossy().replace('\\', "/").trim_start_matches('/'));
        // A private profile, so a running browser never takes over the job.
        let profile = dir.join("profile");
        let result = crate::cdp::print_to_pdf(&browser, &url, &profile, &out_path, Duration::from_secs(120));
        // The profile may still be locked for a moment, so cleanup is best-effort.
        for _ in 0..10 {
            if fs::remove_dir_all(&dir).is_ok() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        result?;
        match fs::metadata(&out_path) {
            Ok(m) if m.len() > 0 => Ok(()),
            _ => Err("The PDF engine didn't produce a file.".into()),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

pub fn mime_for(path: &Path) -> Option<&'static str> {
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    Some(match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => return None,
    })
}

/// A local image as a data: URL, for self-contained exports.
#[tauri::command]
pub async fn read_image_data_url(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let mime = mime_for(&p).ok_or("Not an image")?;
    let meta = fs::metadata(&p).map_err(|e| crate::fsops::describe(&e))?;
    if meta.len() > 25 * 1024 * 1024 {
        return Err("Image is larger than 25 MB".into());
    }
    let bytes = fs::read(&p).map_err(|e| crate::fsops::describe(&e))?;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn find_pandoc() -> Option<String> {
    on_path(&["pandoc"]).map(|p| p.to_string_lossy().into_owned())
}

/// Optional Pandoc export (Word, ODT, EPUB…). Only offered when pandoc is installed.
#[tauri::command]
pub async fn pandoc_convert(markdown: String, out: String, resource_dir: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let pandoc = find_pandoc().ok_or("Pandoc isn't installed")?;
        let dir = unique_temp_dir("pandoc").map_err(|e| e.to_string())?;
        let input = dir.join("input.md");
        fs::write(&input, markdown).map_err(|e| e.to_string())?;
        let mut cmd = Command::new(pandoc);
        cmd.arg("--from=gfm+footnotes+tex_math_dollars")
            .arg("--standalone")
            .arg(format!("--output={out}"))
            .arg(&input);
        if let Some(r) = resource_dir {
            cmd.arg(format!("--resource-path={r}"));
        }
        let result = run_with_timeout(cmd, Duration::from_secs(120));
        let _ = fs::remove_dir_all(&dir);
        result?;
        if Path::new(&out).is_file() {
            Ok(())
        } else {
            Err("Pandoc didn't produce a file.".into())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

const EXAMPLE_THEME: &str = r#"/*
  @name Sepia
  @base paper

  A CalmMD preview theme. Themes are plain CSS files in this folder.
  They apply to the preview, live mode and exports (HTML and PDF).

  - "@base" picks the built-in style to start from: paper, studio or typewriter.
  - Target `.md-body` for document styles. Variables you can change include
    --md-font, --md-heading-font, --md-size, --md-leading, --md-measure,
    --fg, --fg-strong, --fg-muted, --link and --code-fg.
  - --preview-bg sets the page background.
*/

:root {
  --preview-bg: #f5ecdc;
}

.md-body {
  --fg: #46382a;
  --fg-strong: #2d2219;
  --fg-muted: #7a6a58;
  --link: #9a4d12;
  --code-fg: #7c3f1d;
}

.md-body h1,
.md-body h2 {
  letter-spacing: 0;
}
"#;

/// The user themes folder (created on first use, with one example theme).
#[tauri::command]
pub fn themes_dir(app: AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("themes");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| crate::fsops::describe(&e))?;
        let _ = fs::write(dir.join("Sepia.css"), EXAMPLE_THEME);
    }
    Ok(dir.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn image_mime_types() {
        assert_eq!(mime_for(Path::new("a/b.PNG")), Some("image/png"));
        assert_eq!(mime_for(Path::new("x.svg")), Some("image/svg+xml"));
        assert_eq!(mime_for(Path::new("x.md")), None);
        assert_eq!(mime_for(Path::new("noext")), None);
    }

    /// End-to-end: paginates a real document with Paged.js in a headless browser and checks the
    /// page count. Needs Chrome or Edge and `npm install`; run with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn prints_paginated_pdf() {
        let Some(browser) = find_browser() else { return };
        let paged = fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/pagedjs/dist/paged.polyfill.min.js")).unwrap();
        let mut body = String::from("<nav><a href='#c'>Chapter</a><span class='n'></span></nav>");
        for i in 0..3 {
            body += &format!("<h1 id='{}'>Part {i}</h1>", if i == 2 { "c" } else { "x" });
            body += &"<p>Lorem ipsum dolor sit amet. </p>".repeat(5);
        }
        let html = format!(
            "<!doctype html><html><head><meta charset=utf-8><style>@page {{ size: A5; @bottom-center {{ content: counter(page) ' / ' counter(pages) }} }} h1 {{ break-before: page }} nav a::after {{ content: target-counter(attr(href url), page) }}</style>\
             <script>window.PagedConfig = {{ auto: true, after: () => document.fonts.ready.then(() => window.__calmmdDone = true) }};</script><script>{paged}</script></head><body>{body}</body></html>"
        );
        let dir = unique_temp_dir("test-print").unwrap();
        let page = dir.join("t.html");
        fs::write(&page, html).unwrap();
        let out = dir.join("t.pdf");
        let url = format!("file:///{}", page.to_string_lossy().replace('\\', "/").trim_start_matches('/'));
        for _ in 0..3 {
            // Repeat to catch nondeterminism (the bug virtual-time printing had).
            let _ = fs::remove_file(&out);
            crate::cdp::print_to_pdf(&browser, &url, &dir.join("profile"), &out, Duration::from_secs(60)).unwrap();
            let bytes = fs::read(&out).unwrap();
            let text = String::from_utf8_lossy(&bytes);
            let pages = text.matches("/Type /Page\n").count() + text.matches("/Type /Page/").count() + text.matches("/Type /Page>>").count() + text.matches("/Type /Page ").count();
            assert!(pages >= 4, "expected 4 pages (nav + 3 parts), got {pages}");
        }
        let _ = fs::remove_dir_all(&dir);
    }

    /// Manual check: prints $CALMMD_PRINT_HTML to $CALMMD_PRINT_OUT with the real pipeline.
    #[test]
    #[ignore]
    fn prints_file_from_env() {
        let (Ok(html), Ok(out)) = (std::env::var("CALMMD_PRINT_HTML"), std::env::var("CALMMD_PRINT_OUT")) else { return };
        let browser = find_browser().expect("no browser");
        let dir = unique_temp_dir("manual-print").unwrap();
        let url = format!("file:///{}", html.replace('\\', "/").trim_start_matches('/'));
        let t = Instant::now();
        crate::cdp::print_to_pdf(&browser, &url, &dir.join("profile"), Path::new(&out), Duration::from_secs(90)).unwrap();
        eprintln!("printed in {} ms", t.elapsed().as_millis());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn timeout_kills_long_commands() {
        #[cfg(windows)]
        let cmd = {
            let mut c = Command::new("powershell");
            c.args(["-NoProfile", "-Command", "Start-Sleep 5"]);
            c
        };
        #[cfg(not(windows))]
        let cmd = {
            let mut c = Command::new("sleep");
            c.arg("5");
            c
        };
        let t = Instant::now();
        assert!(run_with_timeout(cmd, Duration::from_millis(300)).is_err());
        assert!(t.elapsed() < Duration::from_secs(4));
    }
}
