// Module declarations
mod ai;
mod models;
mod pty;
mod settings;

// Re-export models and commands
pub use models::AppState;
use ai::{ai_chat, ai_chat_stream, test_ai_connection};
use pty::{close_pty, resize_pty, spawn_pty, write_to_pty};
use settings::{delete_api_key, get_api_key, load_settings, save_api_key, save_settings};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn ping() -> String {
    "ok".to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            ping,
            spawn_pty,
            write_to_pty,
            resize_pty,
            close_pty,
            load_settings,
            save_settings,
            get_api_key,
            save_api_key,
            delete_api_key,
            test_ai_connection,
            ai_chat,
            ai_chat_stream
        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            eprintln!("Fatal error: Failed to run application: {}", e);
            std::process::exit(1);
        })
        .ok();
}
