use regex::Regex;
use serde_json::Value;

pub fn filter_embedding_models(models: &[String]) -> Vec<String> {
    models
        .iter()
        .filter(|name| {
            let lowered = name.to_lowercase();
            lowered.contains("embedding") || lowered.contains("embed")
        })
        .cloned()
        .collect()
}

pub fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// Sanitize an API error response before returning it to the frontend.
/// Strips API keys, bearer tokens, and other credentials that may appear
/// in error response bodies or echoed request details.
pub fn sanitize_api_error(provider: &str, status: u16, raw_body: &str) -> String {
    // Try to extract just the error message from JSON responses
    if let Ok(json) = serde_json::from_str::<Value>(raw_body) {
        // Most providers return {"error": {"message": "..."}}
        if let Some(msg) = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return format!("{} error ({}): {}", provider, status, redact_secrets(msg));
        }
        // Some return {"error": "string"}
        if let Some(msg) = json.get("error").and_then(|e| e.as_str()) {
            return format!("{} error ({}): {}", provider, status, redact_secrets(msg));
        }
        // Gemini uses {"error": {"status": "...", "message": "..."}}
        if let Some(msg) = json
            .get("error")
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
        {
            return format!("{} error ({}): {}", provider, status, redact_secrets(msg));
        }
    }

    // Fallback: redact the raw body but truncate to prevent huge error messages
    let truncated = if raw_body.len() > 500 {
        format!("{}...[truncated]", &raw_body[..500])
    } else {
        raw_body.to_string()
    };

    format!("{} error ({}): {}", provider, status, redact_secrets(&truncated))
}

/// Redact common secret patterns from a string.
fn redact_secrets(text: &str) -> String {
    let mut result = text.to_string();

    // Redact API key patterns (sk-..., key-..., AIza..., etc.)
    let key_pattern = Regex::new(
        r"(?i)(sk-[a-zA-Z0-9]{20,}|key-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{30,}|[a-zA-Z0-9]{32,})"
    ).unwrap();
    result = key_pattern.replace_all(&result, "[REDACTED_KEY]").to_string();

    // Redact Bearer tokens
    let bearer_pattern = Regex::new(r"(?i)Bearer\s+[a-zA-Z0-9._\-]+").unwrap();
    result = bearer_pattern.replace_all(&result, "Bearer [REDACTED]").to_string();

    // Redact ?key=... query parameters
    let query_key_pattern = Regex::new(r"[?&]key=[^&\s]+").unwrap();
    result = query_key_pattern.replace_all(&result, "?key=[REDACTED]").to_string();

    // Redact x-api-key header values
    let header_pattern = Regex::new(r"(?i)(x-api-key[:\s]+)[^\s,]+").unwrap();
    result = header_pattern.replace_all(&result, "${1}[REDACTED]").to_string();

    result
}
