use crate::models::AiModelList;
use futures_util::StreamExt;
use serde_json::Value;
use tauri::Emitter;

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

pub fn normalize_prompt(prompt: &str) -> String {
    prompt.trim().to_string()
}

pub fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

pub fn extract_string_list(json: &Value, array_key: &str, item_key: &str) -> Vec<String> {
    json.get(array_key)
        .and_then(|arr| arr.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.get(item_key).and_then(|v| v.as_str()))
                .map(|s| s.to_string())
                .collect()
        })
        .unwrap_or_default()
}

pub fn extract_text(value: &Value) -> Option<String> {
    value.as_str().map(|text| text.to_string())
}

pub fn extract_openai_message(json: &Value) -> Option<String> {
    json.get("choices")
        .and_then(|choices| choices.as_array())
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(extract_text)
}

pub fn extract_anthropic_message(json: &Value) -> Option<String> {
    json.get("content")
        .and_then(|content| content.as_array())
        .and_then(|content| content.first())
        .and_then(|part| part.get("text"))
        .and_then(extract_text)
}

pub fn extract_gemini_message(json: &Value) -> Option<String> {
    json.get("candidates")
        .and_then(|candidates| candidates.as_array())
        .and_then(|candidates| candidates.first())
        .and_then(|candidate| candidate.get("content"))
        .and_then(|content| content.get("parts"))
        .and_then(|parts| parts.as_array())
        .and_then(|parts| parts.first())
        .and_then(|part| part.get("text"))
        .and_then(extract_text)
}

pub fn extract_ollama_message(json: &Value) -> Option<String> {
    json.get("message")
        .and_then(|message| message.get("content"))
        .and_then(extract_text)
}

pub async fn ai_chat_request(
    provider: &str,
    api_key: &str,
    url: Option<String>,
    model: &str,
    prompt: &str,
) -> Result<String, String> {
    let provider = provider.to_lowercase();
    let api_key = api_key.trim().to_string();
    let url = url.map(|value| value.trim().to_string());
    let prompt = normalize_prompt(prompt);
    if prompt.is_empty() {
        return Err("Prompt is empty".to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "openai" => {
            if api_key.is_empty() {
                return Err("OpenAI API key is required".to_string());
            }
            let base = normalize_base_url(url.as_deref().unwrap_or("https://api.openai.com/v1"));
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
        "anthropic" => {
            if api_key.is_empty() {
                return Err("Anthropic API key is required".to_string());
            }
            let base = normalize_base_url(url.as_deref().unwrap_or("https://api.anthropic.com/v1"));
            let endpoint = format!("{}/messages", base);
            let body = serde_json::json!({
                "model": model,
                "max_tokens": 1024,
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
                return Err(format!("Anthropic error: {}", text));
            }
            let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            extract_anthropic_message(&json)
                .ok_or_else(|| "Anthropic response missing content".to_string())
        }
        "gemini" => {
            if api_key.is_empty() {
                return Err("Gemini API key is required".to_string());
            }
            if model.trim().is_empty() {
                return Err("Gemini model is required".to_string());
            }
            let base = normalize_base_url(
                url.as_deref()
                    .unwrap_or("https://generativelanguage.googleapis.com/v1beta"),
            );
            let endpoint = format!("{}/models/{}:generateContent?key={}", base, model, api_key);
            let body = serde_json::json!({
                "contents": [
                    { "role": "user", "parts": [{ "text": prompt }] }
                ]
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
                return Err(format!("Gemini error: {}", text));
            }
            let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            extract_gemini_message(&json)
                .ok_or_else(|| "Gemini response missing content".to_string())
        }
        "ollama" => {
            let base = normalize_base_url(url.as_deref().unwrap_or("http://localhost:11434"));
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
        _ => Err(format!("Unsupported provider: {}", provider)),
    }
}

#[tauri::command]
pub async fn test_ai_connection(
    provider: String,
    api_key: String,
    url: Option<String>,
) -> Result<AiModelList, String> {
    let provider = provider.to_lowercase();
    let api_key = api_key.trim().to_string();
    let url = url.map(|value| value.trim().to_string());
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "openai" => {
            if api_key.trim().is_empty() {
                return Err("OpenAI API key is required".to_string());
            }
            let base = normalize_base_url(url.as_deref().unwrap_or("https://api.openai.com/v1"));
            let endpoint = format!("{}/models", base);
            let resp = client
                .get(endpoint)
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
            let mut models = extract_string_list(&json, "data", "id");
            models.sort();
            models.dedup();
            let mut embedding_models = filter_embedding_models(&models);
            embedding_models.sort();
            embedding_models.dedup();
            Ok(AiModelList {
                models,
                embedding_models,
            })
        }
        "anthropic" => {
            if api_key.trim().is_empty() {
                return Err("Anthropic API key is required".to_string());
            }
            let models = vec![
                "claude-3-5-sonnet-20241022".to_string(),
                "claude-3-5-haiku-20241022".to_string(),
                "claude-3-opus-20240229".to_string(),
            ];
            Ok(AiModelList {
                models,
                embedding_models: Vec::new(),
            })
        }
        "gemini" => {
            if api_key.trim().is_empty() {
                return Err("Gemini API key is required".to_string());
            }
            let models = vec![
                "gemini-1.5-flash".to_string(),
                "gemini-1.5-flash-8b".to_string(),
                "gemini-1.5-pro".to_string(),
                "gemini-2.0-flash-exp".to_string(),
            ];
            let embedding_models = vec![
                "text-embedding-004".to_string(),
            ];
            Ok(AiModelList {
                models,
                embedding_models,
            })
        }
        "ollama" => {
            let base = normalize_base_url(url.as_deref().unwrap_or("http://localhost:11434"));
            let endpoint = format!("{}/api/tags", base);
            let resp = client
                .get(endpoint)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = resp.status();
            let text = resp.text().await.map_err(|e| e.to_string())?;
            if !status.is_success() {
                return Err(format!("Ollama error: {}", text));
            }
            let json: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
            let mut models = extract_string_list(&json, "models", "name");
            models.sort();
            models.dedup();
            let mut embedding_models = filter_embedding_models(&models);
            embedding_models.sort();
            embedding_models.dedup();
            Ok(AiModelList {
                models,
                embedding_models,
            })
        }
        _ => Err(format!("Unsupported provider: {}", provider)),
    }
}

#[tauri::command]
pub async fn ai_chat(
    provider: String,
    api_key: String,
    url: Option<String>,
    model: String,
    prompt: String,
) -> Result<String, String> {
    ai_chat_request(&provider, &api_key, url, &model, &prompt).await
}

#[tauri::command]
pub async fn ai_chat_stream(
    window: tauri::Window,
    provider: String,
    api_key: String,
    url: Option<String>,
    model: String,
    prompt: String,
    request_id: String,
) -> Result<(), String> {
    let provider = provider.to_lowercase();
    let api_key = api_key.trim().to_string();
    let url = url.map(|value| value.trim().to_string());
    let prompt = normalize_prompt(&prompt);
    if prompt.is_empty() {
        window
            .emit("ai-stream:error", serde_json::json!({ "request_id": request_id, "error": "Prompt is empty" }))
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "openai" => {
            if api_key.is_empty() {
                return Err("OpenAI API key is required".to_string());
            }
            let base = normalize_base_url(url.as_deref().unwrap_or("https://api.openai.com/v1"));
            let endpoint = format!("{}/chat/completions", base);
            let body = serde_json::json!({
                "model": model,
                "stream": true,
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
            if !status.is_success() {
                let text = resp.text().await.map_err(|e| e.to_string())?;
                return Err(format!("OpenAI error: {}", text));
            }
            let mut stream = resp.bytes_stream();
            let mut buffer = String::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| e.to_string())?;
                let part = String::from_utf8_lossy(&chunk);
                buffer.push_str(&part);
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();
                    if !line.starts_with("data:") {
                        continue;
                    }
                    let payload = line.trim_start_matches("data:").trim();
                    if payload == "[DONE]" {
                        window
                            .emit("ai-stream:end", serde_json::json!({ "request_id": request_id }))
                            .map_err(|e| e.to_string())?;
                        return Ok(());
                    }
                    let json: Value = serde_json::from_str(payload).map_err(|e| e.to_string())?;
                    let delta = json
                        .get("choices")
                        .and_then(|choices| choices.as_array())
                        .and_then(|choices| choices.first())
                        .and_then(|choice| choice.get("delta"))
                        .and_then(|delta| delta.get("content"))
                        .and_then(extract_text);
                    if let Some(text) = delta {
                        window
                            .emit(
                                "ai-stream:chunk",
                                serde_json::json!({ "request_id": request_id, "content": text }),
                            )
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
            window
                .emit("ai-stream:end", serde_json::json!({ "request_id": request_id }))
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        "ollama" => {
            let base = normalize_base_url(url.as_deref().unwrap_or("http://localhost:11434"));
            let endpoint = format!("{}/api/chat", base);
            let body = serde_json::json!({
                "model": model,
                "stream": true,
                "messages": [
                    { "role": "user", "content": prompt }
                ]
            });
            let resp = client
                .post(endpoint)
                .json(&body)
                .send()
                .await
                .map_err(|e| e.to_string())?;
            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.map_err(|e| e.to_string())?;
                return Err(format!("Ollama error: {}", text));
            }
            let mut stream = resp.bytes_stream();
            let mut buffer = String::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| e.to_string())?;
                let part = String::from_utf8_lossy(&chunk);
                buffer.push_str(&part);
                while let Some(pos) = buffer.find('\n') {
                    let line = buffer[..pos].trim().to_string();
                    buffer = buffer[pos + 1..].to_string();
                    if line.is_empty() {
                        continue;
                    }
                    let json: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
                    if let Some(text) = extract_ollama_message(&json) {
                        window
                            .emit(
                                "ai-stream:chunk",
                                serde_json::json!({ "request_id": request_id, "content": text }),
                            )
                            .map_err(|e| e.to_string())?;
                    }
                    if json.get("done").and_then(|v| v.as_bool()) == Some(true) {
                        window
                            .emit("ai-stream:end", serde_json::json!({ "request_id": request_id }))
                            .map_err(|e| e.to_string())?;
                        return Ok(());
                    }
                }
            }
            window
                .emit("ai-stream:end", serde_json::json!({ "request_id": request_id }))
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        _ => {
            let response = ai_chat_request(&provider, &api_key, url, &model, &prompt).await?;
            window
                .emit(
                    "ai-stream:chunk",
                    serde_json::json!({ "request_id": request_id, "content": response }),
                )
                .map_err(|e| e.to_string())?;
            window
                .emit("ai-stream:end", serde_json::json!({ "request_id": request_id }))
                .map_err(|e| e.to_string())?;
            Ok(())
        }
    }
}
