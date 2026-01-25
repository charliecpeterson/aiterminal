use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use crate::security::path_validator::validate_path;
use crate::utils::mutex::safe_lock_with_context;

type WatcherMap =
    Arc<Mutex<HashMap<String, notify_debouncer_mini::Debouncer<notify::RecommendedWatcher>>>>;
type ContentStore = Arc<Mutex<HashMap<String, (String, String)>>>; // Maps window_label -> (filename, content)

#[derive(Clone, serde::Serialize)]
#[allow(dead_code)]
struct FileChangedPayload {
    path: String,
}

pub fn init_preview_watchers(app: &AppHandle) {
    app.manage(WatcherMap::new(Mutex::new(HashMap::new())));
    app.manage(ContentStore::new(Mutex::new(HashMap::new())));
}

#[tauri::command]
pub async fn open_preview_window(
    app: AppHandle,
    filename: String,
    content: String,
) -> Result<(), String> {
    let window_label = format!("preview-{}", uuid::Uuid::new_v4());
    let display_name = PathBuf::from(&filename)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(&filename)
        .to_string();

    // Store content in app state to avoid URL length limits
    let content_store: tauri::State<ContentStore> = app.state();
    safe_lock_with_context(&content_store, "Failed to lock content store")?
        .insert(window_label.clone(), (filename.clone(), content));

    // Pass only the window label in URL
    let url = format!("index.html?preview={}", urlencoding::encode(&window_label));

    // Create window
    WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title(format!("Preview: {}", display_name))
        .inner_size(900.0, 700.0)
        .resizable(true)
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_preview_content(
    app: AppHandle,
    window_label: String,
) -> Result<(String, String), String> {
    let content_store: tauri::State<ContentStore> = app.state();
    let store = safe_lock_with_context(&content_store, "Failed to lock content store")?;

    store
        .get(&window_label)
        .cloned()
        .ok_or_else(|| "Preview content not found".to_string())
}

#[tauri::command]
pub async fn read_preview_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    
    // SECURITY: Validate path to prevent traversal attacks
    let safe_path = validate_path(&path)?;
    
    std::fs::read_to_string(&safe_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn stop_preview_watcher(app: AppHandle, window_label: String) -> Result<(), String> {
    let watchers: tauri::State<WatcherMap> = app.state();
    let mut map = safe_lock_with_context(&watchers, "Failed to lock preview watchers")?;
    map.remove(&window_label);
    Ok(())
}

#[allow(dead_code)]
fn start_file_watcher(
    app: AppHandle,
    window_label: String,
    file_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    let window_label_clone = window_label.clone();
    let file_path_clone = file_path.clone();
    let app_clone = app.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |res: Result<Vec<DebouncedEvent>, notify::Error>| {
            match res {
                Ok(_events) => {
                    // File changed, emit event
                    let _ = app_clone.emit_to(
                        &window_label_clone,
                        "preview-file-changed",
                        FileChangedPayload {
                            path: file_path_clone.clone(),
                        },
                    );
                }
                Err(error) => {
                    eprintln!("File watcher error: {:?}", error);
                }
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(&path, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    // Store watcher
    let watchers: tauri::State<WatcherMap> = app.state();
    let mut map = safe_lock_with_context(&watchers, "Failed to lock preview watchers")?;
    map.insert(window_label, debouncer);

    Ok(())
}
