use super::helpers::*;
use super::providers;
use crate::models::AiModelList;

/// Test AI connection and retrieve available models
/// This is used by the settings UI to validate API keys and show model options
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

    let models = match provider.as_str() {
        "openai" => providers::openai::test_connection(&client, &api_key, url.as_deref()).await?,
        "anthropic" => {
            providers::anthropic::test_connection(&client, &api_key, url.as_deref()).await?
        }
        "gemini" => providers::gemini::test_connection(&client, &api_key, url.as_deref()).await?,
        "ollama" => providers::ollama::test_connection(&client, &api_key, url.as_deref()).await?,
        _ => return Err(format!("Unsupported provider: {}", provider)),
    };

    let mut sorted_models = models;
    sorted_models.sort();
    sorted_models.dedup();

    let mut embedding_models = filter_embedding_models(&sorted_models);
    embedding_models.sort();
    embedding_models.dedup();

    Ok(AiModelList {
        models: sorted_models,
        embedding_models,
    })
}
