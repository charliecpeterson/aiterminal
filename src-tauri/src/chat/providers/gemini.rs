use reqwest::Client;

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
