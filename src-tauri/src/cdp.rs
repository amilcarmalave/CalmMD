//! Minimal Chrome DevTools Protocol client for printing PDFs.
//!
//! `--print-to-pdf` with `--virtual-time-budget` can print before Paged.js has finished paginating,
//! and that's non-deterministic. Instead we drive the browser like Paged.js's own CLI does: open the
//! page, wait until it sets `window.__calmmdDone` (pagination and fonts finished), then call
//! `Page.printToPDF`.

use base64::Engine;
use serde_json::{json, Value};
use std::fs;
use std::net::TcpStream;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};

type Socket = WebSocket<MaybeTlsStream<TcpStream>>;

struct Session {
    ws: Socket,
    next_id: u64,
    deadline: Instant,
}

impl Session {
    /// Sends a command and waits for its response, skipping unrelated events.
    fn call(&mut self, session_id: Option<&str>, method: &str, params: Value) -> Result<Value, String> {
        self.next_id += 1;
        let id = self.next_id;
        let mut msg = json!({ "id": id, "method": method, "params": params });
        if let Some(s) = session_id {
            msg["sessionId"] = json!(s);
        }
        self.ws.send(Message::Text(msg.to_string().into())).map_err(|e| e.to_string())?;
        loop {
            if Instant::now() > self.deadline {
                return Err("PDF export took too long and was stopped.".into());
            }
            let reply = match self.ws.read() {
                Ok(Message::Text(t)) => t,
                Ok(_) => continue,
                Err(tungstenite::Error::Io(e)) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => continue,
                Err(e) => return Err(format!("Lost connection to the PDF engine: {e}")),
            };
            let v: Value = serde_json::from_str(reply.as_str()).map_err(|e| e.to_string())?;
            if v.get("id").and_then(Value::as_u64) != Some(id) {
                continue; // an event, or a reply to something else
            }
            if let Some(err) = v.get("error") {
                return Err(err.get("message").and_then(Value::as_str).unwrap_or("CDP error").to_string());
            }
            return Ok(v.get("result").cloned().unwrap_or(Value::Null));
        }
    }
}

struct KillOnDrop(Child);
impl Drop for KillOnDrop {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

/// Reads "<port>\n<ws path>" from the profile's DevToolsActivePort file, once the browser has written it.
fn wait_for_port(profile: &Path, deadline: Instant) -> Result<(u16, String), String> {
    let file = profile.join("DevToolsActivePort");
    loop {
        if let Ok(text) = fs::read_to_string(&file) {
            let mut lines = text.lines();
            if let (Some(port), Some(path)) = (lines.next(), lines.next()) {
                if let Ok(port) = port.trim().parse() {
                    return Ok((port, path.trim().to_string()));
                }
            }
        }
        if Instant::now() > deadline {
            return Err("The PDF engine didn't start.".into());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

pub fn print_to_pdf(browser: &str, page_url: &str, profile: &Path, out: &Path, timeout: Duration) -> Result<(), String> {
    let deadline = Instant::now() + timeout;
    // A stale port file from an earlier run would point at a closed port.
    let _ = fs::remove_file(profile.join("DevToolsActivePort"));
    let mut cmd = Command::new(browser);
    cmd.args([
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-sync",
        "--remote-debugging-port=0",
        "--remote-allow-origins=*",
    ])
    .arg(format!("--user-data-dir={}", profile.to_string_lossy()))
    .arg("about:blank")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null());
    crate::export::hide_console(&mut cmd);
    let _child = KillOnDrop(cmd.spawn().map_err(|e| format!("Couldn't start the PDF engine: {e}"))?);

    let (port, path) = wait_for_port(profile, deadline)?;
    let url = format!("ws://127.0.0.1:{port}{path}");
    let ws = loop {
        match tungstenite::connect(url.as_str()) {
            Ok((ws, _)) => break ws,
            Err(e) if Instant::now() > deadline => return Err(format!("Couldn't connect to the PDF engine: {e}")),
            Err(_) => std::thread::sleep(Duration::from_millis(100)),
        }
    };
    if let MaybeTlsStream::Plain(s) = ws.get_ref() {
        let _ = s.set_read_timeout(Some(Duration::from_millis(500)));
    }
    let mut s = Session { ws, next_id: 0, deadline };

    let target = s.call(None, "Target.createTarget", json!({ "url": "about:blank" }))?;
    let target_id = target["targetId"].as_str().ok_or("no target")?.to_string();
    let attached = s.call(None, "Target.attachToTarget", json!({ "targetId": target_id, "flatten": true }))?;
    let sid = attached["sessionId"].as_str().ok_or("no session")?.to_string();
    s.call(Some(&sid), "Page.enable", json!({}))?;
    s.call(Some(&sid), "Page.navigate", json!({ "url": page_url }))?;

    // Wait until the page says it's ready. Evaluation can fail while the navigation commits, so retry.
    loop {
        let r = s.call(
            Some(&sid),
            "Runtime.evaluate",
            json!({ "expression": "document.readyState === 'complete' && window.__calmmdDone === true", "returnByValue": true }),
        );
        if let Ok(v) = r {
            if v["result"]["value"].as_bool() == Some(true) {
                break;
            }
            if let Some(msg) = v["exceptionDetails"]["text"].as_str() {
                return Err(format!("The document failed to render: {msg}"));
            }
        }
        if Instant::now() > deadline {
            return Err("PDF export took too long and was stopped.".into());
        }
        std::thread::sleep(Duration::from_millis(80));
    }

    let pdf = s.call(
        Some(&sid),
        "Page.printToPDF",
        json!({
            "printBackground": true,
            "preferCSSPageSize": true,
            "displayHeaderFooter": false,
            "generateDocumentOutline": true,
            "generateTaggedPDF": true
        }),
    )?;
    let data = pdf["data"].as_str().ok_or("The PDF engine returned no data.")?;
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    crate::fsops::write_atomic(out, &bytes).map_err(|e| crate::fsops::describe(&e))?;
    let _ = s.call(None, "Browser.close", json!({}));
    Ok(())
}
