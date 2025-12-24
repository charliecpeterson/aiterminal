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

pub fn normalize_prompt(prompt: &str) -> String {
    prompt.trim().to_string()
}

pub fn normalize_base_url(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
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
