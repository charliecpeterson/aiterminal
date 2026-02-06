use crate::chat::helpers::*;
use crate::models::DEFAULT_MAX_TOKENS;
use reqwest::Client;
use serde_json::Value;

pub async fn chat_request(
    client: &Client,
    api_key: &str,
    url: Option<&str>,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    if api_key.is_empty() {
        return Err("Anthropic API key is required".to_string());
    }
    let base = normalize_base_url(url.unwrap_or("https://api.anthropic.com/v1"));
    let endpoint = format!("{}/messages", base);
    let body = serde_json::json!({
        "model": model,
        "max_tokens": DEFAULT_MAX_TOKENS,
        "messages": [
            { "role": "user", "content": prompt }
        ]
    });
    let resp = client
        .post(endpoint)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(sanitize_api_error("Anthropic", status.as_u16(), &text));
    }
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    extract_anthropic_message(&json).ok_or_else(|| "Anthropic response missing content".to_string())
}

pub async fn test_connection(
    client: &Client,
    api_key: &str,
    url: Option<&str>,
) -> Result<Vec<String>, String> {
    if api_key.is_empty() {
        return Err("Anthropic API key is required".to_string());
    }
    // Anthropic has a predefined list of models
    let _ = (client, url); // Suppress unused warnings
    Ok(vec![
        "claude-3-5-sonnet-20241022".to_string(),
        "claude-3-5-haiku-20241022".to_string(),
        "claude-3-opus-20240229".to_string(),
        "claude-3-sonnet-20240229".to_string(),
        "claude-3-haiku-20240307".to_string(),
    ])
}
