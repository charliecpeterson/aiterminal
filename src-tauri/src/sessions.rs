use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Complete session state for persistence
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionState {
    /// Schema version for migration support
    pub version: String,
    
    /// Timestamp when session was saved
    pub timestamp: String,
    
    /// All open tabs
    pub tabs: Vec<SessionTab>,
    
    /// Currently active tab ID (PTY ID)
    pub active_tab_id: Option<u32>,
    
    /// Window state (future use)
    pub window_state: Option<WindowState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
}

/// Saved state for a single tab
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionTab {
    /// PTY ID (serves as tab ID)
    pub id: u32,
    
    /// Display title
    pub title: String,
    
    /// User-customized name
    pub custom_name: Option<String>,
    
    /// Split layout configuration
    pub split_layout: String, // "single" | "vertical" | "horizontal"
    
    /// Split ratio (10-90)
    pub split_ratio: f64,
    
    /// All panes in this tab
    pub panes: Vec<SessionPane>,
    
    /// Which pane has focus
    pub focused_pane_id: Option<u32>,
}

/// Saved state for a single terminal pane
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionPane {
    /// PTY ID
    pub id: u32,
    
    /// Whether this is a remote SSH connection
    pub is_remote: bool,
    
    /// Remote hostname (if SSH)
    pub remote_host: Option<String>,
    
    /// SSH profile ID for reconnection
    pub ssh_profile_id: Option<String>,
    
    /// Working directory at time of save
    pub working_directory: Option<String>,
    
    /// How to restore this pane
    pub restore_type: String, // "local" | "ssh" | "skip"
}

/// Get the path to the session state file
/// Path: ~/.config/aiterminal/last-session.json
pub fn get_session_path() -> Option<PathBuf> {
    std::env::var("HOME")
        .ok()
        .map(|home| std::path::Path::new(&home).join(".config/aiterminal/last-session.json"))
}

/// Save session state to disk
#[tauri::command]
pub fn save_session_state(state: SessionState) -> Result<(), String> {
    let session_path = get_session_path().ok_or("Could not determine session path")?;
    
    // Create config directory if it doesn't exist
    if let Some(parent) = session_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    // Serialize to JSON with pretty printing
    let json = serde_json::to_string_pretty(&state)
        .map_err(|e| format!("Failed to serialize session state: {}", e))?;
    
    // Write to file
    fs::write(&session_path, json)
        .map_err(|e| format!("Failed to write session state: {}", e))?;
    
    eprintln!("[Session] Saved session with {} tabs to {:?}", state.tabs.len(), session_path);
    Ok(())
}

/// Load session state from disk
#[tauri::command]
pub fn load_session_state() -> Result<Option<SessionState>, String> {
    let session_path = get_session_path().ok_or("Could not determine session path")?;
    
    // If file doesn't exist, return None (no session to restore)
    if !session_path.exists() {
        eprintln!("[Session] No saved session found at {:?}", session_path);
        return Ok(None);
    }
    
    // Read and parse the file
    let content = fs::read_to_string(&session_path)
        .map_err(|e| format!("Failed to read session state: {}", e))?;
    
    let state: SessionState = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session state: {}", e))?;
    
    eprintln!("[Session] Loaded session with {} tabs from {:?}", state.tabs.len(), session_path);
    Ok(Some(state))
}

/// Clear session state (delete the file)
#[tauri::command]
pub fn clear_session_state() -> Result<(), String> {
    let session_path = get_session_path().ok_or("Could not determine session path")?;
    
    if session_path.exists() {
        fs::remove_file(&session_path)
            .map_err(|e| format!("Failed to delete session state: {}", e))?;
        eprintln!("[Session] Cleared session state");
    }
    
    Ok(())
}

/// Check if a saved session exists
#[tauri::command]
pub fn has_saved_session() -> Result<bool, String> {
    let session_path = get_session_path().ok_or("Could not determine session path")?;
    Ok(session_path.exists())
}
