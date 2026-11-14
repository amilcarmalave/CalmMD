//! CalmMD Pro licence keys, through the payment provider's public licence API (Lemon Squeezy).
//! Those endpoints need no secret: the key itself is the credential, and the provider enforces
//! the activation limit. Only these three fixed endpoints can be called from the app.

use std::time::Duration;

const API: &str = "https://api.lemonsqueezy.com/v1/licenses/";

fn endpoint(action: &str) -> Option<String> {
    match action {
        "activate" | "validate" | "deactivate" => Some(format!("{API}{action}")),
        _ => None,
    }
}

/// POSTs a licence request and returns the provider's JSON. Invalid keys come back as JSON with
/// an `error` field (HTTP 4xx); only network failures are errors here.
#[tauri::command]
pub async fn license_request(action: String, params: Vec<(String, String)>) -> Result<serde_json::Value, String> {
    let url = endpoint(&action).ok_or("Unknown licence action.")?;
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(20)).build();
        let pairs: Vec<(&str, &str)> = params.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
        let response = match agent.post(&url).set("Accept", "application/json").send_form(&pairs) {
            Ok(r) => r,
            Err(ureq::Error::Status(_, r)) => r,
            Err(e) => return Err(format!("Couldn't reach the licence server: {e}")),
        };
        response.into_json::<serde_json::Value>().map_err(|e| format!("Unexpected reply from the licence server: {e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Real network: a made-up key must come back as JSON with activated = false and an error.
    /// `cargo test --manifest-path src-tauri/Cargo.toml -- --ignored bogus_key`
    #[test]
    #[ignore]
    fn bogus_key_is_rejected_by_the_real_api() {
        let reply = tauri::async_runtime::block_on(license_request(
            "activate".into(),
            vec![("license_key".into(), "calmmd-not-a-real-key-0000".into()), ("instance_name".into(), "CalmMD test".into())],
        ))
        .expect("network");
        println!("{reply}");
        assert_eq!(reply["activated"], serde_json::Value::Bool(false));
        assert!(reply["error"].is_string());
    }

    #[test]
    fn only_licence_endpoints() {
        assert_eq!(endpoint("activate").as_deref(), Some("https://api.lemonsqueezy.com/v1/licenses/activate"));
        assert!(endpoint("../orders").is_none());
        assert!(endpoint("").is_none());
    }
}
