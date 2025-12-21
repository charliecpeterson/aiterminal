// Module declarations
mod ai;
mod health_check;
mod models;
mod pty;
mod settings;
mod tools;

// Re-export models and commands
pub use models::AppState;
use ai::{ai_chat, ai_chat_stream, test_ai_connection};
use pty::{close_pty, resize_pty, spawn_pty, write_to_pty, get_pty_info, get_pty_cwd};
use settings::{delete_api_key, get_api_key, load_settings, save_api_key, save_settings};
use tools::{
    execute_tool_command, read_file_tool, list_directory_tool,
    search_files_tool, get_current_directory_tool, get_env_var_tool,
    write_file_tool, append_to_file_tool, git_status_tool, find_process_tool,
    check_port_tool, get_system_info_tool, tail_file_tool, make_directory_tool,
    get_git_diff_tool, calculate_tool, web_search_tool,
};
use tauri::Emitter;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn emit_event(
    app: tauri::AppHandle,
    event: String,
    payload: serde_json::Value,
) -> Result<(), String> {
    app.emit(&event, payload)
        .map_err(|e| format!("Failed to emit event: {}", e))
}

#[tauri::command]
async fn measure_pty_latency(id: u32, state: tauri::State<'_, AppState>) -> Result<u32, String> {
    // Check if there's an active SSH session with measured latency
    let ssh_sessions = state.ssh_sessions.lock()
        .map_err(|e| format!("Failed to acquire SSH session lock: {}", e))?;
    
    if let Some(ssh_info) = ssh_sessions.get(&id) {
        // Return the last measured network latency for SSH sessions
        if let Some(latency_ms) = ssh_info.last_latency_ms {
            return Ok(latency_ms as u32);
        }
    }
    
    // For local sessions or SSH sessions without measured latency yet, return 0
    Ok(0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            greet,
            emit_event,
            measure_pty_latency,
            get_pty_info,
            get_pty_cwd,
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
            ai_chat_stream,
            execute_tool_command,
            read_file_tool,
            list_directory_tool,
            search_files_tool,
            get_current_directory_tool,
            get_env_var_tool,
            write_file_tool,
            append_to_file_tool,
            git_status_tool,
            find_process_tool,
            check_port_tool,
            get_system_info_tool,
            tail_file_tool,
            make_directory_tool,
            get_git_diff_tool,
            calculate_tool,
            web_search_tool,
        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            eprintln!("Fatal error: Failed to run application: {}", e);
            std::process::exit(1);
        })
        .ok();
}
