use crate::chat::helpers::*;
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
        return Err("Gemini API key is required".to_string());
    }
    if model.trim().is_empty() {
        return Err("Gemini model is required".to_string());
    }
    let base =
        normalize_base_url(url.unwrap_or("https://generativelanguage.googleapis.com/v1beta"));
    let endpoint = format!("{}/models/{}:generateContent", base, model);
    let body = serde_json::json!({
        "contents": [
            { "role": "user", "parts": [{ "text": prompt }] }
        ]
    });
    let resp = client
        .post(endpoint)
        .query(&[("key", api_key)])
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(sanitize_api_error("Gemini", status.as_u16(), &text));
    }
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    extract_gemini_message(&json).ok_or_else(|| "Gemini response missing content".to_string())
}

pub async fn test_connection(
    _client: &Client,
    api_key: &str,
    _url: Option<&str>,
) -> Result<Vec<String>, String> {
    if api_key.is_empty() {
        return Err("Gemini API key is required".to_string());
    }
    // Return predefined Gemini models including embeddings
    Ok(vec![
        "gemini-1.5-flash".to_string(),
        "gemini-1.5-flash-8b".to_string(),
        "gemini-1.5-pro".to_string(),
        "gemini-2.0-flash-exp".to_string(),
        "text-embedding-004".to_string(),
    ])
}
