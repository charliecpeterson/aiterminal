use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Emitter, State};

struct AppState {
    pty_master: Arc<Mutex<Option<Box<dyn portable_pty::MasterPty + Send>>>>,
    pty_writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn spawn_pty(window: tauri::Window, state: State<AppState>) {
    let pty_system = NativePtySystem::default();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .unwrap();

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

    let _child = pair.slave.spawn_command(cmd).unwrap();

    let mut reader = pair.master.try_clone_reader().unwrap();
    let master = pair.master;
    let writer = master.take_writer().unwrap();

    // Store master and writer in state
    *state.pty_master.lock().unwrap() = Some(master);
    *state.pty_writer.lock().unwrap() = Some(writer);

    // Spawn thread to read
    thread::spawn(move || {
        let mut buf = [0u8; 1024];
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let data = &buf[..n];
                    // Emit data to frontend
                    // We use String::from_utf8_lossy to handle potential non-UTF8 sequences gracefully
                    let data_str = String::from_utf8_lossy(data).to_string();
                    window.emit("pty-data", data_str).unwrap();
                }
                Ok(_) => break, // EOF
                Err(_) => break,
            }
        }
    });
}

#[tauri::command]
fn write_to_pty(data: String, state: State<AppState>) {
    if let Some(writer) = &mut *state.pty_writer.lock().unwrap() {
        write!(writer, "{}", data).unwrap();
        writer.flush().unwrap();
    }
}

#[tauri::command]
fn resize_pty(rows: u16, cols: u16, state: State<AppState>) {
    if let Some(master) = &mut *state.pty_master.lock().unwrap() {
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .unwrap();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            pty_master: Arc::new(Mutex::new(None)),
            pty_writer: Arc::new(Mutex::new(None)),
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            spawn_pty,
            write_to_pty,
            resize_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
