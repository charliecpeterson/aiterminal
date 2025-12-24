use reqwest::Client;
use serde_json::Value;
use crate::chat::helpers::*;

pub async fn chat_request(
    client: &Client,
    api_key: &str,
    url: Option<&str>,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    if api_key.is_empty() {
        return Err("OpenAI API key is required".to_string());
    }
    let base = normalize_base_url(url.unwrap_or("https://api.openai.com/v1"));
    let endpoint = format!("{}/chat/completions", base);
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "user", "content": prompt }
        ]
    });
    let resp = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI error: {}", text));
    }
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    extract_openai_message(&json).ok_or_else(|| "OpenAI response missing content".to_string())
}

pub async fn test_connection(
    client: &Client,
    api_key: &str,
    url: Option<&str>,
) -> Result<Vec<String>, String> {
    if api_key.is_empty() {
        return Err("OpenAI API key is required".to_string());
    }
    let base = normalize_base_url(url.unwrap_or("https://api.openai.com/v1"));
    let endpoint = format!("{}/models", base);
    let resp = client
        .get(&endpoint)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI error: {}", text));
    }
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let models = json["data"]
        .as_array()
        .ok_or("Invalid OpenAI models response")?
        .iter()
        .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
        .collect();
    Ok(models)
}
