use crate::models::{AppSettings, AppState};
use keyring::Entry;
use std::fs;
use std::path::PathBuf;
use tauri::State;

pub fn get_config_path() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(|home| std::path::Path::new(&home).join(".config/aiterminal/settings.json"))
}

fn get_keychain_service(provider: &str) -> String {
    format!("aiterminal.{}", provider)
}

fn save_api_key_to_keychain(provider: &str, api_key: &str) -> Result<(), String> {
    if api_key.trim().is_empty() {
        // Empty key means delete from keychain
        return delete_api_key_from_keychain(provider);
    }

    let service = get_keychain_service(provider);
    eprintln!(
        "[Keychain] Saving API key for service: {} (username: api_key)",
        service
    );
    let entry =
        Entry::new(&service, "api_key").map_err(|e| format!("Failed to access keychain: {}", e))?;

    entry
        .set_password(api_key)
        .map_err(|e| {
            eprintln!("[Keychain] Error saving: {}", e);
            format!("Failed to save API key to keychain: {}", e)
        })
        .map(|_| {
            eprintln!("[Keychain] Successfully saved API key");
            ()
        })
}

fn load_api_key_from_keychain(provider: &str) -> Result<String, String> {
    let service = get_keychain_service(provider);
    eprintln!(
        "[Keychain] Loading API key for service: {} (username: api_key)",
        service
    );
    let entry = Entry::new(&service, "api_key").map_err(|e| {
        eprintln!("[Keychain] Failed to create Entry: {}", e);
        format!("Failed to access keychain: {}", e)
    })?;

    entry
        .get_password()
        .map(|key| {
            eprintln!(
                "[Keychain] Successfully loaded API key (length: {})",
                key.len()
            );
            key
        })
        .map_err(|e| {
            eprintln!("[Keychain] Error loading: {}", e);
            // Don't expose keychain errors if key simply doesn't exist
            if e.to_string().contains("No such item") || e.to_string().contains("not found") {
                "API key not found".to_string()
            } else {
                format!("Failed to load API key from keychain: {}", e)
            }
        })
}

fn delete_api_key_from_keychain(provider: &str) -> Result<(), String> {
    let service = get_keychain_service(provider);
    let entry =
        Entry::new(&service, "api_key").map_err(|e| format!("Failed to access keychain: {}", e))?;

    // Ignore errors if key doesn't exist
    let _ = entry.delete_credential();
    Ok(())
}

pub fn clamp_max_markers(value: u16) -> u16 {
    value.clamp(20, 2000)
}

#[tauri::command]
pub fn load_settings(_state: State<AppState>) -> Result<AppSettings, String> {
    let config_path = get_config_path().ok_or("Could not determine config path")?;

    if !config_path.exists() {
        let default_settings = AppSettings::default();
        let json = serde_json::to_string_pretty(&default_settings).map_err(|e| e.to_string())?;
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&config_path, json).map_err(|e| e.to_string())?;
        return Ok(default_settings);
    }

    let content = fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let mut settings: AppSettings =
        serde_json::from_str(&content).unwrap_or_else(|_| AppSettings::default());
    settings.terminal.max_markers = clamp_max_markers(settings.terminal.max_markers);

    Ok(settings)
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    let mut settings = settings;
    settings.terminal.max_markers = clamp_max_markers(settings.terminal.max_markers);

    let config_path = get_config_path().ok_or("Could not determine config path")?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(config_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_api_key(provider: String, state: State<AppState>) -> Result<String, String> {
    // Check cache first
    let mut cache = state.api_key_cache.lock().unwrap();
    if let Some(cached_key) = cache.get(&provider) {
        return Ok(cached_key.clone());
    }

    // Load from keychain and cache it
    let api_key = load_api_key_from_keychain(&provider)?;
    cache.insert(provider, api_key.clone());
    Ok(api_key)
}

#[tauri::command]
pub fn save_api_key(
    provider: String,
    api_key: String,
    state: State<AppState>,
) -> Result<(), String> {
    save_api_key_to_keychain(&provider, &api_key)?;

    // Update cache
    let mut cache = state.api_key_cache.lock().unwrap();
    if api_key.is_empty() {
        cache.remove(&provider);
    } else {
        cache.insert(provider, api_key);
    }

    Ok(())
}

#[tauri::command]
pub fn delete_api_key(provider: String, state: State<AppState>) -> Result<(), String> {
    delete_api_key_from_keychain(&provider)?;

    // Clear from cache
    let mut cache = state.api_key_cache.lock().unwrap();
    cache.remove(&provider);

    Ok(())
}
