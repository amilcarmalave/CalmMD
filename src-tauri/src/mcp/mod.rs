//! Local MCP server. It never touches files by itself: every tool call is routed to the
//! running webview, where the document manager and explorer own the live state.

mod bridge;
mod tools;

use crate::kv;
use bridge::McpBridge;
use rmcp::transport::streamable_http_server::{
    session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tauri::{AppHandle, State};
use tokio::net::TcpListener;
use tokio::sync::{watch, Mutex};
use tools::CalmMdTools;
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub enabled: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    pub port: Option<u16>,
    pub window_label: String,
}

struct Running {
    stop: watch::Sender<bool>,
    status: McpStatus,
}

/// Endpoint remembered between launches so clients only need configuring once. The token stays
/// in the app's local state store (`state/mcp~endpoint.kv`), never in the repository.
const ENDPOINT_KEY: &str = "mcp/endpoint";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
struct SavedEndpoint {
    port: u16,
    token: String,
}

fn parse_endpoint(raw: &str) -> Option<SavedEndpoint> {
    let saved: SavedEndpoint = serde_json::from_str(raw).ok()?;
    (!saved.token.trim().is_empty() && saved.port != 0).then_some(saved)
}

fn endpoint_json(port: u16, token: &str) -> String {
    serde_json::json!({ "port": port, "token": token }).to_string()
}

/// Binds the remembered port when it is still free, otherwise any free loopback port. The retries
/// absorb the short window in which a restarting server has not released its old listener yet.
async fn bind_loopback(preferred: Option<u16>) -> Result<TcpListener, String> {
    if let Some(port) = preferred {
        for attempt in 0..20 {
            match TcpListener::bind(("127.0.0.1", port)).await {
                Ok(listener) => return Ok(listener),
                Err(_) if attempt < 19 => tokio::time::sleep(Duration::from_millis(50)).await,
                Err(_) => break,
            }
        }
    }
    TcpListener::bind(("127.0.0.1", 0))
        .await
        .map_err(|e| e.to_string())
}

pub struct McpManager {
    app: AppHandle,
    bridge: Arc<McpBridge>,
    running: Mutex<Option<Running>>,
}

impl McpManager {
    pub fn new(app: AppHandle) -> Arc<Self> {
        Arc::new(Self {
            bridge: McpBridge::new(app.clone()),
            app,
            running: Mutex::new(None),
        })
    }

    fn saved_endpoint(&self) -> Option<SavedEndpoint> {
        kv::read(&self.app, ENDPOINT_KEY)
            .ok()
            .flatten()
            .and_then(|raw| parse_endpoint(&raw))
    }

    pub async fn status(&self) -> McpStatus {
        match self.running.lock().await.as_ref() {
            Some(r) => r.status.clone(),
            None => McpStatus {
                enabled: false,
                url: None,
                token: None,
                port: None,
                window_label: "main".into(),
            },
        }
    }

    pub async fn start(&self) -> Result<McpStatus, String> {
        if let Some(r) = self.running.lock().await.as_ref() {
            return Ok(r.status.clone());
        }

        // Reuse the saved port and token so an MCP client keeps working across restarts. A token
        // is only replaced by `mcp_new_token`.
        let saved = self.saved_endpoint();
        let listener = bind_loopback(saved.as_ref().map(|endpoint| endpoint.port)).await?;
        let port = listener.local_addr().map_err(|e| e.to_string())?.port();
        let token = saved
            .map(|endpoint| endpoint.token)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        if let Err(error) = kv::write(&self.app, ENDPOINT_KEY, &endpoint_json(port, &token)) {
            eprintln!("CalmMD could not remember the MCP endpoint: {error}");
        }
        let (stop, mut stop_rx) = watch::channel(false);

        let bridge = self.bridge.clone();
        let service = StreamableHttpService::new(
            move || Ok(CalmMdTools::new(bridge.clone())),
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default(),
        );
        let router = axum::Router::new()
            .nest_service("/mcp", service)
            .layer(axum::middleware::from_fn_with_state(
                AuthState {
                    token: token.clone(),
                },
                authenticate,
            ));

        tauri::async_runtime::spawn(async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(async move {
                    let _ = stop_rx.changed().await;
                })
                .await;
        });

        let status = McpStatus {
            enabled: true,
            url: Some(format!("http://127.0.0.1:{port}/mcp")),
            token: Some(token),
            port: Some(port),
            window_label: "main".into(),
        };
        *self.running.lock().await = Some(Running {
            stop,
            status: status.clone(),
        });
        Ok(status)
    }

    /// Replaces the bearer token, keeping the port. Restarts a running server, so clients must be
    /// updated with the new connection string.
    pub async fn new_token(&self) -> Result<McpStatus, String> {
        let running = self.running.lock().await.is_some();
        let saved = self.saved_endpoint();
        let port = saved.as_ref().map(|endpoint| endpoint.port).unwrap_or(0);
        let token = Uuid::new_v4().to_string();
        if port != 0 {
            kv::write(&self.app, ENDPOINT_KEY, &endpoint_json(port, &token))?;
        } else {
            kv::delete(&self.app, ENDPOINT_KEY)?;
        }
        if running {
            self.stop().await;
            self.start().await
        } else {
            Ok(self.status().await)
        }
    }

    pub async fn stop(&self) -> McpStatus {
        if let Some(r) = self.running.lock().await.take() {
            let _ = r.stop.send(true);
        }
        McpStatus {
            enabled: false,
            url: None,
            token: None,
            port: None,
            window_label: "main".into(),
        }
    }
}

#[derive(Clone)]
struct AuthState {
    token: String,
}

/// MCP's Streamable HTTP security guidance: local binding, authentication and Origin checks.
async fn authenticate(
    axum::extract::State(state): axum::extract::State<AuthState>,
    req: axum::extract::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, axum::http::StatusCode> {
    use axum::http::header;

    let auth = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if auth != format!("Bearer {}", state.token) {
        return Err(axum::http::StatusCode::UNAUTHORIZED);
    }
    if let Some(origin) = req
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
    {
        if !is_local_origin(origin) {
            return Err(axum::http::StatusCode::FORBIDDEN);
        }
    }
    Ok(next.run(req).await)
}

fn is_local_origin(origin: &str) -> bool {
    if origin == "null" {
        return true;
    }
    let Some(rest) = origin
        .strip_prefix("http://")
        .or_else(|| origin.strip_prefix("https://"))
    else {
        return false;
    };
    let host = rest
        .split([':', '/'])
        .next()
        .unwrap_or("")
        .trim_start_matches('[')
        .trim_end_matches(']');
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saved_endpoints_need_a_port_and_token() {
        let saved = parse_endpoint(&endpoint_json(52431, "token-1")).unwrap();
        assert_eq!(saved.port, 52431);
        assert_eq!(saved.token, "token-1");
        assert!(parse_endpoint("not json").is_none());
        assert!(parse_endpoint(&endpoint_json(0, "token-1")).is_none());
        assert!(parse_endpoint(&endpoint_json(52431, "  ")).is_none());
    }

    #[test]
    fn only_local_origins_pass() {
        assert!(is_local_origin("null"));
        assert!(is_local_origin("http://127.0.0.1:1420"));
        assert!(is_local_origin("http://localhost"));
        assert!(!is_local_origin("http://localhost.evil.example"));
        assert!(!is_local_origin("https://example.com"));
    }
}

#[tauri::command]
pub async fn mcp_status(manager: State<'_, Arc<McpManager>>) -> Result<McpStatus, String> {
    Ok(manager.status().await)
}

#[tauri::command]
pub async fn mcp_start(manager: State<'_, Arc<McpManager>>) -> Result<McpStatus, String> {
    manager.start().await
}

#[tauri::command]
pub async fn mcp_stop(manager: State<'_, Arc<McpManager>>) -> Result<McpStatus, String> {
    Ok(manager.stop().await)
}

#[tauri::command]
pub async fn mcp_new_token(manager: State<'_, Arc<McpManager>>) -> Result<McpStatus, String> {
    manager.new_token().await
}

#[tauri::command]
pub async fn mcp_respond(manager: State<'_, Arc<McpManager>>, response: Value) -> Result<(), String> {
    manager.bridge.respond(response).await
}
