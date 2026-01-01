use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickAction {
    pub id: String,
    pub name: String,
    pub commands: Vec<String>,
}

fn get_quick_actions_path() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let config_dir = PathBuf::from(home).join(".config/aiterminal");

    // Ensure config directory exists
    std::fs::create_dir_all(&config_dir).ok()?;

    Some(config_dir.join("quick-actions.json"))
}

#[tauri::command]
pub fn load_quick_actions() -> Result<Vec<QuickAction>, String> {
    let path =
        get_quick_actions_path().ok_or_else(|| "Failed to get config directory".to_string())?;

    if !path.exists() {
        // Return empty array if file doesn't exist yet
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read quick actions file: {}", e))?;

    let actions: Vec<QuickAction> = serde_json::from_str(&contents)
        .map_err(|e| format!("Failed to parse quick actions: {}", e))?;

    Ok(actions)
}

#[tauri::command]
pub fn save_quick_actions(actions: Vec<QuickAction>) -> Result<(), String> {
    let path =
        get_quick_actions_path().ok_or_else(|| "Failed to get config directory".to_string())?;

    let json = serde_json::to_string_pretty(&actions)
        .map_err(|e| format!("Failed to serialize quick actions: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write quick actions file: {}", e))?;

    Ok(())
}
