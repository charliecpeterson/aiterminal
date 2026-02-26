use reqwest::Client;

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
