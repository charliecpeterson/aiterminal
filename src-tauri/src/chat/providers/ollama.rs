use reqwest::Client;
use serde_json::Value;
use crate::chat::helpers::*;

pub async fn chat_request(
    client: &Client,
    _api_key: &str,
    url: Option<&str>,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let base = normalize_base_url(url.unwrap_or("http://localhost:11434"));
    let endpoint = format!("{}/api/chat", base);
    let body = serde_json::json!({
        "model": model,
        "messages": [
            { "role": "user", "content": prompt }
        ],
        "stream": false
    });
    let resp = client
        .post(endpoint)
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Ollama error: {}", text));
    }
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    extract_ollama_message(&json)
        .ok_or_else(|| "Ollama response missing content".to_string())
}

pub async fn test_connection(
    client: &Client,
    _api_key: &str,
    url: Option<&str>,
) -> Result<Vec<String>, String> {
    let base = normalize_base_url(url.unwrap_or("http://localhost:11434"));
    let endpoint = format!("{}/api/tags", base);
    let resp = client
        .get(&endpoint)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Ollama error: {}", text));
    }
    let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let models = json["models"]
        .as_array()
        .ok_or("Invalid Ollama models response")?
        .iter()
        .filter_map(|m| m["name"].as_str().map(|s| s.to_string()))
        .collect();
    Ok(models)
}
