use super::helpers::*;
use crate::models::AiModelList;
use futures_util::StreamExt;
use serde_json::Value;
use tauri::Emitter;

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
                "max_tokens": crate::models::DEFAULT_MAX_TOKENS,
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
    max_tokens: Option<u32>,
    timeout_secs: Option<u64>,
    tools: Option<String>, // JSON-encoded tool definitions
    terminal_cwd: Option<String>, // Current working directory of the terminal
) -> Result<(), String> {
    use crate::models::{DEFAULT_MAX_TOKENS, MIN_MAX_TOKENS, MAX_MAX_TOKENS, 
                        HTTP_TIMEOUT_SECS, MAX_STREAM_BUFFER_SIZE};
    
    let provider = provider.to_lowercase();
    let api_key = api_key.trim().to_string();
    let url = url.map(|value| value.trim().to_string());
    let prompt = normalize_prompt(&prompt);
    
    // Clamp max_tokens to valid range
    let max_tokens = max_tokens
        .unwrap_or(DEFAULT_MAX_TOKENS)
        .clamp(MIN_MAX_TOKENS, MAX_MAX_TOKENS);
    
    // Use provided timeout or default
    let timeout = std::time::Duration::from_secs(
        timeout_secs.unwrap_or(HTTP_TIMEOUT_SECS)
    );
    
    if prompt.is_empty() {
        window
            .emit("ai-stream:error", serde_json::json!({ "request_id": request_id, "error": "Prompt is empty" }))
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let client = reqwest::Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|e| e.to_string())?;

    match provider.as_str() {
        "openai" => {
            if api_key.is_empty() {
                return Err("OpenAI API key is required".to_string());
            }
            let base = normalize_base_url(url.as_deref().unwrap_or("https://api.openai.com/v1"));
            let endpoint = format!("{}/chat/completions", base);
            
            // Parse tools if provided
            let tools_array: Option<Value> = tools.as_ref().and_then(|t| serde_json::from_str(t).ok());
            
            // Parse prompt as either a simple string or a messages array
            let mut messages_array: Vec<Value> = if prompt.trim().starts_with('[') {
                // Try to parse as JSON array (messages format)
                serde_json::from_str(&prompt).unwrap_or_else(|_| {
                    vec![serde_json::json!({ "role": "user", "content": prompt })]
                })
            } else {
                // Simple string, wrap in messages format
                vec![serde_json::json!({ "role": "user", "content": prompt })]
            };
            
            // Always prepend system prompt for tools if not already present
            let has_system = messages_array.iter().any(|msg| 
                msg.get("role").and_then(|r| r.as_str()) == Some("system")
            );
            
            if !has_system && tools_array.is_some() {
                let mut system_content = String::from("You are a helpful AI assistant with system access. When users ask questions that require information from the system, USE THE AVAILABLE TOOLS immediately without asking for clarification.\n\n");
                
                // Add terminal directory context if provided
                if let Some(cwd) = &terminal_cwd {
                    system_content.push_str(&format!("TERMINAL WORKING DIRECTORY: {}\n", cwd));
                    system_content.push_str("When users ask about 'current directory', use this EXACT path in list_directory - DO NOT use '/' or '.'!\n\n");
                } else {
                    system_content.push_str("TERMINAL WORKING DIRECTORY: Unknown\n");
                    system_content.push_str("When users ask about 'current directory': FIRST call pwd, THEN use that result in list_directory.\n");
                    system_content.push_str("DO NOT call list_directory with '/' or '.' - wait for pwd result first!\n\n");
                }
                
                system_content.push_str("IMPORTANT: ANSWER THE USER'S QUESTION COMPLETELY!\n");
                system_content.push_str("- If user asks 'what files', call list_directory with the actual path\n");
                system_content.push_str("- If you have TERMINAL WORKING DIRECTORY above, use that exact path\n");
                system_content.push_str("- If you don't have the path, call pwd FIRST in one response, then I'll continue with the result\n\n");
                system_content.push_str("The user will review and approve each tool call before execution.");
                
                messages_array.insert(0, serde_json::json!({
                    "role": "system",
                    "content": system_content
                }));
            }
            
            let messages_value = Value::Array(messages_array);
            
            // Newer models (GPT-4o, o1, etc.) use max_completion_tokens instead of max_tokens
            let mut body = serde_json::json!({
                "model": model,
                "stream": true,
                "messages": messages_value,
                "max_completion_tokens": max_tokens,
            });
            
            // Add tools if provided
            if let Some(tools_val) = tools_array {
                let tool_count = tools_val.as_array().map(|a| a.len()).unwrap_or(0);
                body["tools"] = tools_val;
                body["parallel_tool_calls"] = serde_json::json!(true); // Enable parallel tool calling
                eprintln!("🔧 Including {} tools in request (parallel calls enabled)", tool_count);
            }
            
            eprintln!("📤 Sending OpenAI request to: {}", endpoint);
            
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
                eprintln!("❌ OpenAI API error ({}): {}", status, text);
                return Err(format!("OpenAI error: {}", text));
            }
            eprintln!("✅ OpenAI request successful, streaming response");
            let mut stream = resp.bytes_stream();
            let mut buffer = String::new();
            let mut accumulated_tool_calls: std::collections::HashMap<usize, serde_json::Map<String, Value>> = std::collections::HashMap::new();
            
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|e| e.to_string())?;
                let part = String::from_utf8_lossy(&chunk);
                buffer.push_str(&part);
                
                // Backpressure: prevent unbounded buffer growth
                if buffer.len() > MAX_STREAM_BUFFER_SIZE {
                    return Err(format!(
                        "Stream buffer exceeded limit of {} bytes. Possible malformed response.",
                        MAX_STREAM_BUFFER_SIZE
                    ));
                }
                
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
                    
                    // Check for tool calls and accumulate them
                    if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
                        if let Some(choice) = choices.first() {
                            if let Some(delta) = choice.get("delta") {
                                if let Some(tool_calls) = delta.get("tool_calls").and_then(|tc| tc.as_array()) {
                                    for tool_call in tool_calls {
                                        if let Some(index) = tool_call.get("index").and_then(|i| i.as_u64()) {
                                            let index = index as usize;
                                            let entry = accumulated_tool_calls.entry(index).or_insert_with(|| {
                                                let mut map = serde_json::Map::new();
                                                map.insert("index".to_string(), Value::Number(serde_json::Number::from(index)));
                                                map
                                            });
                                            
                                            // Accumulate id, type, function name
                                            if let Some(id) = tool_call.get("id") {
                                                entry.insert("id".to_string(), id.clone());
                                            }
                                            if let Some(tc_type) = tool_call.get("type") {
                                                entry.insert("type".to_string(), tc_type.clone());
                                            }
                                            if let Some(function) = tool_call.get("function") {
                                                let function_map = entry.entry("function".to_string())
                                                    .or_insert_with(|| Value::Object(serde_json::Map::new()))
                                                    .as_object_mut()
                                                    .unwrap();
                                                
                                                if let Some(name) = function.get("name") {
                                                    function_map.insert("name".to_string(), name.clone());
                                                }
                                                if let Some(args) = function.get("arguments").and_then(|a| a.as_str()) {
                                                    let current_args = function_map.get("arguments")
                                                        .and_then(|a| a.as_str())
                                                        .unwrap_or("");
                                                    function_map.insert("arguments".to_string(), Value::String(format!("{}{}", current_args, args)));
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            
                            // Check if this is the end of tool calls
                            if let Some(finish_reason) = choice.get("finish_reason").and_then(|fr| fr.as_str()) {
                                if finish_reason == "tool_calls" && !accumulated_tool_calls.is_empty() {
                                    // Convert accumulated tool calls to array and emit
                                    let mut tool_calls_array: Vec<Value> = accumulated_tool_calls
                                        .into_iter()
                                        .map(|(_, v)| Value::Object(v))
                                        .collect();
                                    tool_calls_array.sort_by_key(|tc| tc.get("index").and_then(|i| i.as_u64()).unwrap_or(0));
                                    
                                    eprintln!("🔧 Complete tool calls: {:?}", tool_calls_array);
                                    window.emit(
                                        "ai-stream:tool-calls",
                                        serde_json::json!({ 
                                            "request_id": request_id, 
                                            "tool_calls": tool_calls_array 
                                        }),
                                    ).map_err(|e| e.to_string())?;
                                    
                                    accumulated_tool_calls = std::collections::HashMap::new();
                                }
                            }
                        }
                    }
                    
                    // Get regular content delta
                    let delta = json
                        .get("choices")
                        .and_then(|choices| choices.as_array())
                        .and_then(|choices| choices.first())
                        .and_then(|choice| choice.get("delta"))
                        .and_then(|delta| delta.get("content"))
                        .and_then(extract_text);
                    if let Some(text) = delta {
                        eprintln!("💬 Content chunk: {}", text);
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
                ],
                "options": {
                    "num_predict": max_tokens,
                }
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
                
                // Backpressure: prevent unbounded buffer growth
                if buffer.len() > MAX_STREAM_BUFFER_SIZE {
                    return Err(format!(
                        "Stream buffer exceeded limit of {} bytes. Possible malformed response.",
                        MAX_STREAM_BUFFER_SIZE
                    ));
                }
                
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
