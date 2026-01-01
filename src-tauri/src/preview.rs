use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebouncedEvent};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

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

    // Store content in app state to avoid URL length limits
    let content_store: tauri::State<ContentStore> = app.state();
    content_store
        .lock()
        .unwrap()
        .insert(window_label.clone(), (filename.clone(), content));

    // Pass only the window label in URL
    let url = format!("index.html?preview={}", urlencoding::encode(&window_label));

    // Create window
    WebviewWindowBuilder::new(&app, &window_label, WebviewUrl::App(url.into()))
        .title(format!("Preview: {}", filename))
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
    let store = content_store.lock().unwrap();

    store
        .get(&window_label)
        .cloned()
        .ok_or_else(|| "Preview content not found".to_string())
}

#[tauri::command]
pub async fn read_preview_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);
    let abs_path = if path.is_absolute() {
        path
    } else {
        std::env::current_dir()
            .map_err(|e| e.to_string())?
            .join(&path)
    };

    std::fs::read_to_string(&abs_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn stop_preview_watcher(app: AppHandle, window_label: String) -> Result<(), String> {
    let watchers: tauri::State<WatcherMap> = app.state();
    let mut map = watchers.lock().unwrap();
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
    let mut map = watchers.lock().unwrap();
    map.insert(window_label, debouncer);

    Ok(())
}
