// Suppress cfg warnings from objc 0.2 crate macros (msg_send!, class!)
// These warnings come from the third-party objc crate and cannot be fixed
// without updating to objc 0.3+, which may break the macOS touch gesture code.
#![allow(unexpected_cfgs)]

// Module declarations
mod autocomplete;
mod chat;
mod context_index;
mod health_check;
mod history;
mod keychain;
mod models;
mod preview;
mod pty;
mod quick_actions;
mod secret_scanner;
mod security;
mod sessions;
mod settings;
mod ssh;
mod tools;
mod utils;

// Test modules
#[cfg(test)]
mod tests;

// macOS-specific imports
#[cfg(target_os = "macos")]
#[macro_use]
extern crate objc;

#[cfg(target_os = "macos")]
extern crate cocoa;

// Re-export models and commands
use autocomplete::{
    get_llm_completions, get_llm_inline_completion, get_path_commands, init_llm,
    is_command_in_path, list_dir_entries, llm_health_check, stop_llm, LLMEngine,
};
use chat::{ai_chat, ai_chat_stream, test_ai_connection};
use context_index::{ContextChunkInput, ContextIndexSyncStats, RetrievedChunk};
use history::get_shell_history;
use keychain::{
    check_keychain_available, delete_api_key_from_keychain, get_api_key_from_keychain,
    save_api_key_to_keychain,
};
pub use models::AppState;
use preview::{get_preview_content, open_preview_window, read_preview_file, stop_preview_watcher};
use pty::{check_pty_health, close_pty, focus_terminal, get_active_terminal, get_pty_cwd, get_pty_info, resize_pty, spawn_pty, write_to_pty};
use quick_actions::{load_quick_actions, save_quick_actions};
use secret_scanner::scan_content_for_secrets;
use sessions::{clear_session_state, has_saved_session, load_session_state, save_session_state};
use settings::{delete_api_key, get_api_key, load_settings, save_api_key, save_settings};
use ssh::{get_ssh_config_hosts, load_ssh_profiles, save_ssh_profiles};
use tauri::Emitter;
use tools::{
    analyze_error_tool, append_to_file_tool, calculate_tool, check_port_tool, diff_files_tool,
    execute_tool_command, file_sections_tool, find_errors_in_file_tool, find_process_tool,
    get_current_directory_tool, get_env_var_tool, get_file_info_tool, get_git_branch_tool,
    get_git_diff_tool, get_shell_history_tool, get_system_info_tool, git_status_tool,
    grep_in_files_tool, list_directory_tool, list_file_backups_tool, make_directory_tool,
    read_file_tool, read_multiple_files_tool, replace_in_file_tool, search_files_tool,
    tail_file_tool, undo_file_change_tool, web_search_tool, write_file_tool,
};
#[tauri::command]
async fn context_index_sync(
    state: tauri::State<'_, AppState>,
    provider: String,
    api_key: String,
    url: Option<String>,
    embedding_model: String,
    chunks: Vec<ContextChunkInput>,
) -> Result<ContextIndexSyncStats, String> {
    if embedding_model.trim().is_empty() {
        return Err("Embedding model is not configured".to_string());
    }

    // 1) Plan sync under lock (no awaits while holding MutexGuard)
    let (present, to_embed) = {
        let index = state
            .context_index
            .lock()
            .map_err(|e| format!("Failed to lock context index: {}", e))?;
        context_index::plan_sync(&index, &chunks)
    };

    // 2) Compute embeddings outside lock
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut embedded: Vec<(ContextChunkInput, Vec<f32>)> = Vec::new();
    if !to_embed.is_empty() {
        let batch_size = 32usize;
        let mut offset = 0usize;
        while offset < to_embed.len() {
            let end = std::cmp::min(offset + batch_size, to_embed.len());
            let batch_meta = &to_embed[offset..end];
            let batch_texts: Vec<String> = batch_meta.iter().map(|c| c.text.clone()).collect();

            let vectors = context_index::embed_texts_for_provider(
                &client,
                &provider,
                &api_key,
                url.as_deref(),
                &embedding_model,
                &batch_texts,
            )
            .await?;

            if vectors.len() != batch_meta.len() {
                return Err("Embeddings response size mismatch".to_string());
            }

            for i in 0..vectors.len() {
                embedded.push((batch_meta[i].clone(), vectors[i].clone()));
            }

            offset = end;
        }
    }

    // 3) Apply sync under lock
    let mut index = state
        .context_index
        .lock()
        .map_err(|e| format!("Failed to lock context index: {}", e))?;
    context_index::apply_sync(&mut index, present, embedded)
}

#[tauri::command]
async fn context_index_query(
    state: tauri::State<'_, AppState>,
    provider: String,
    api_key: String,
    url: Option<String>,
    embedding_model: String,
    query: String,
    top_k: Option<u32>,
) -> Result<Vec<RetrievedChunk>, String> {
    if embedding_model.trim().is_empty() {
        return Err("Embedding model is not configured".to_string());
    }

    let k = top_k.unwrap_or(8).max(1) as usize;

    // 1) Compute query embedding outside lock
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let inputs = vec![query.trim().to_string()];
    let mut vectors = context_index::embed_texts_for_provider(
        &client,
        &provider,
        &api_key,
        url.as_deref(),
        &embedding_model,
        &inputs,
    )
    .await?;

    let query_vec = vectors
        .pop()
        .ok_or_else(|| "Failed to compute query embedding".to_string())?;

    // 2) Score under lock (no awaits)
    let index = state
        .context_index
        .lock()
        .map_err(|e| format!("Failed to lock context index: {}", e))?;

    Ok(context_index::query_with_embedding(&index, query_vec, k))
}

#[tauri::command]
fn context_index_clear(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut index = state
        .context_index
        .lock()
        .map_err(|e| format!("Failed to lock context index: {}", e))?;
    index.clear();
    Ok(())
}

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
    let ssh_sessions = state
        .ssh_sessions
        .lock()
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
        .manage(std::sync::Arc::new(tokio::sync::Mutex::new(
            LLMEngine::new(),
        )))
        .setup(|app| {
            preview::init_preview_watchers(&app.handle());
            
            // Disable press-and-hold accent menu for all windows
            #[cfg(target_os = "macos")]
            {
                use cocoa::foundation::NSString;
                use tauri::Manager;
                for (_label, window) in app.webview_windows() {
                    let _ = window.with_webview(|webview| {
                        #[cfg(target_os = "macos")]
                        unsafe {
                            use cocoa::base::id;
                            let ns_view: id = webview.inner() as *const _ as *mut _;
                            let _: () = msg_send![ns_view, setAllowedTouchTypes: 0];
                            
                            // Disable press and hold at the window level
                            let defaults: id = msg_send![class!(NSUserDefaults), standardUserDefaults];
                            let key = NSString::alloc(cocoa::base::nil).init_str("ApplePressAndHoldEnabled");
                            let _: () = msg_send![defaults, setBool:false forKey:key];
                        }
                    });
                }
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            emit_event,
            measure_pty_latency,
            get_pty_info,
            get_pty_cwd,
            check_pty_health,
            focus_terminal,
            get_active_terminal,
            get_shell_history,
            spawn_pty,
            write_to_pty,
            resize_pty,
            close_pty,
            load_settings,
            save_settings,
            get_api_key,
            save_api_key,
            delete_api_key,
            save_api_key_to_keychain,
            get_api_key_from_keychain,
            delete_api_key_from_keychain,
            check_keychain_available,
            get_ssh_config_hosts,
            save_ssh_profiles,
            load_ssh_profiles,
            load_quick_actions,
            save_quick_actions,
            save_session_state,
            load_session_state,
            clear_session_state,
            has_saved_session,
            open_preview_window,
            get_preview_content,
            read_preview_file,
            stop_preview_watcher,
            test_ai_connection,
            ai_chat,
            ai_chat_stream,
            execute_tool_command,
            read_file_tool,
            get_file_info_tool,
            read_multiple_files_tool,
            grep_in_files_tool,
            analyze_error_tool,
            list_directory_tool,
            search_files_tool,
            get_current_directory_tool,
            get_env_var_tool,
            write_file_tool,
            append_to_file_tool,
            replace_in_file_tool,
            git_status_tool,
            get_git_branch_tool,
            find_process_tool,
            check_port_tool,
            get_system_info_tool,
            tail_file_tool,
            make_directory_tool,
            get_git_diff_tool,
            get_shell_history_tool,
            find_errors_in_file_tool,
            file_sections_tool,
            calculate_tool,
            web_search_tool,
            undo_file_change_tool,
            list_file_backups_tool,
            diff_files_tool,
            init_llm,
            stop_llm,
            get_llm_completions,
            get_llm_inline_completion,
            llm_health_check,
            is_command_in_path,
            get_path_commands,
            list_dir_entries,
            scan_content_for_secrets,
            context_index_sync,
            context_index_query,
            context_index_clear,
        ])
        .run(tauri::generate_context!())
        .map_err(|e| {
            eprintln!("Fatal error: Failed to run application: {}", e);
            std::process::exit(1);
        })
        .ok();
}
