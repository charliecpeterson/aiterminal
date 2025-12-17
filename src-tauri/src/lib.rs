use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Emitter, State};

struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
}

struct AppState {
    ptys: Mutex<HashMap<u32, PtySession>>,
    next_id: Mutex<u32>,
}

impl AppState {
    fn new() -> Self {
        Self {
            ptys: Mutex::new(HashMap::new()),
            next_id: Mutex::new(0),
        }
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn spawn_pty(window: tauri::Window, state: State<AppState>) -> Result<u32, String> {
    let id = {
        let mut next_id = state.next_id.lock().unwrap();
        let id = *next_id;
        *next_id += 1;
        id
    };

    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Detect user's preferred shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "windows") {
            "powershell.exe".to_string()
        } else {
            "/bin/bash".to_string()
        }
    });

    let mut cmd = CommandBuilder::new(&shell);

    // Start as a login shell to ensure user config (.bash_profile/.zshrc) is loaded
    if !cfg!(target_os = "windows") {
        cmd.args(&["-l"]);
    }

    // Setup configuration directory (Safe Mode: Create file but don't force load)
    if let Ok(home) = std::env::var("HOME") {
        let config_dir = std::path::Path::new(&home).join(".config/aiterminal");
        if std::fs::create_dir_all(&config_dir).is_ok() {
            let bash_init_path = config_dir.join("bash_init.sh");
            let bash_script = r#"
# OSC 133 Shell Integration (VS Code Style Wrapper)

# Guard to prevent multiple sourcing
if [ -n "$__AITERM_INTEGRATION_LOADED" ]; then
    return
fi
export __AITERM_INTEGRATION_LOADED=1

# 1. Save the original PROMPT_COMMAND
__aiterm_original_pc="${PROMPT_COMMAND:-}"

# 2. Define our wrapper function
__aiterm_wrapper() {
    local RET=$?
    
    # Emit Command Finished (D) with exit code
    builtin printf "\033]133;D;%s\007" "$RET"
    
    # Emit Prompt Start (A)
    builtin printf "\033]133;A\007"
    
    # Run the original PROMPT_COMMAND if it existed
    if [ -n "$__aiterm_original_pc" ]; then
        eval "$__aiterm_original_pc"
    fi
}

# 3. Replace PROMPT_COMMAND with our wrapper
PROMPT_COMMAND="__aiterm_wrapper"

# 4. Pre-exec trap for Output Start (C)
# This runs before every command to mark the start of output
__aiterm_preexec() {
    if [ -n "$COMP_LINE" ]; then return; fi  # Don't run during completion
    if [[ "$BASH_COMMAND" == "__aiterm_wrapper" ]]; then return; fi # Don't run for our own wrapper
    builtin printf "\033]133;C\007"
}
trap '__aiterm_preexec' DEBUG

echo "AI Terminal Shell Integration Loaded"
"#;
            let _ = std::fs::write(&bash_init_path, bash_script);
        }
    }

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let master = pair.master;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    // Store session in state
    {
        let mut ptys = state.ptys.lock().unwrap();
        ptys.insert(id, PtySession { master, writer });
    }

    // Spawn thread to read
    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let data = &buf[..n];
                    let data_str = String::from_utf8_lossy(data).to_string();
                    if let Err(e) = window.emit(&format!("pty-data:{}", id), data_str) {
                        eprintln!("Failed to emit pty-data: {}", e);
                    }
                }
                _ => {
                    let _ = window.emit(&format!("pty-exit:{}", id), ());
                    break;
                }
            }
        }
    });

    Ok(id)
}

#[tauri::command]
fn write_to_pty(id: u32, data: String, state: State<AppState>) {
    let mut ptys = state.ptys.lock().unwrap();
    if let Some(session) = ptys.get_mut(&id) {
        if let Err(e) = write!(session.writer, "{}", data) {
            eprintln!("Failed to write to PTY: {}", e);
        }
    }
}

#[tauri::command]
fn resize_pty(id: u32, rows: u16, cols: u16, state: State<AppState>) {
    let mut ptys = state.ptys.lock().unwrap();
    if let Some(session) = ptys.get_mut(&id) {
        if let Err(e) = session.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }) {
            eprintln!("Failed to resize PTY: {}", e);
        }
    }
}

#[tauri::command]
fn close_pty(id: u32, state: State<AppState>) {
    let mut ptys = state.ptys.lock().unwrap();
    ptys.remove(&id);
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
            spawn_pty,
            write_to_pty,
            resize_pty,
            close_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
