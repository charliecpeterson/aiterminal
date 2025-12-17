use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Emitter, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AppearanceSettings {
    theme: String,
    font_size: u16,
    font_family: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AiSettings {
    provider: String,
    model: String,
    api_key: String,
    embedding_model: Option<String>,
    url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AppSettings {
    appearance: AppearanceSettings,
    ai: AiSettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            appearance: AppearanceSettings {
                theme: "dark".to_string(),
                font_size: 14,
                font_family: "Menlo, Monaco, \"Courier New\", monospace".to_string(),
            },
            ai: AiSettings {
                provider: "openai".to_string(),
                model: "gpt-4o".to_string(),
                api_key: "".to_string(),
                embedding_model: None,
                url: None,
            },
        }
    }
}

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
# AI Terminal OSC 133 Shell Integration

# Guard to prevent multiple sourcing
if [ -n "$__AITERM_INTEGRATION_LOADED" ]; then
    return
fi
export __AITERM_INTEGRATION_LOADED=1

# Advertise to downstream shells
export TERM_PROGRAM=aiterminal

__aiterm_emit() { printf "\033]133;%s\007" "$1"; }
__aiterm_mark_prompt() { __aiterm_emit "A"; }
__aiterm_mark_output_start() { __aiterm_emit "C"; }
__aiterm_mark_done() { local ret=${1:-$?}; __aiterm_emit "D;${ret}"; }

if [ -n "$BASH_VERSION" ]; then
    __aiterm_original_pc="${PROMPT_COMMAND:-}"
    __aiterm_prompt_wrapper() {
        local ret=$?
        __aiterm_mark_done "$ret"
        __aiterm_mark_prompt
        if [ -n "$__aiterm_original_pc" ]; then
            eval "$__aiterm_original_pc"
        fi
    }
    PROMPT_COMMAND="__aiterm_prompt_wrapper"

    __aiterm_preexec() {
        if [ -n "$COMP_LINE" ]; then return; fi  # skip completion
        case "$BASH_COMMAND" in
            __aiterm_prompt_wrapper*|__aiterm_preexec*) return ;;
        esac
        __aiterm_mark_output_start
    }
    trap '__aiterm_preexec' DEBUG
elif [ -n "$ZSH_VERSION" ]; then
    autoload -Uz add-zsh-hook
    __aiterm_precmd() { __aiterm_mark_done $?; __aiterm_mark_prompt; }
    __aiterm_preexec() { __aiterm_mark_output_start; }
    add-zsh-hook precmd __aiterm_precmd
    add-zsh-hook preexec __aiterm_preexec
fi

if [ -z "$__AITERM_OSC133_BANNER_SHOWN" ]; then
    export __AITERM_OSC133_BANNER_SHOWN=1
    echo "AI Terminal OSC 133 shell integration active ($(basename "$SHELL"))"
fi

# Optional ssh wrapper to auto-provision OSC markers on remote shells
__aiterm_ssh_wrap_enabled() {
    [ -z "$AITERM_DISABLE_SSH_WRAP" ] && [ "$TERM_PROGRAM" = "aiterminal" ]
}

__aiterm_has_remote_command() {
    # Detect if a non-flag argument appears after the host
    local seen_host=""
    for arg in "$@"; do
        if [ -z "$seen_host" ]; then
            case "$arg" in
                -*) ;; # still parsing flags
                *) seen_host=1; continue ;;
            esac
        else
            case "$arg" in
                -*) ;;
                *) return 0 ;; # found a command
            esac
        fi
    done
    return 1
}

__aiterm_find_host_arg() {
    for arg in "$@"; do
        case "$arg" in
            -*) ;;  # flag
            *) printf '%s' "$arg"; return 0 ;;
        esac
    done
    return 1
}

__aiterm_ssh() {
    if ! __aiterm_ssh_wrap_enabled; then command ssh "$@"; return $?; fi

    # If user passed a remote command, tunneling, or control options, do not modify
    if __aiterm_has_remote_command "$@"; then command ssh "$@"; return $?; fi
    case "$*" in
        *" -N "*|-N|*-W*|*-w*) command ssh "$@"; return $? ;;
    esac

    local host
    host="$(__aiterm_find_host_arg "$@")" || { command ssh "$@"; return $?; }

    local helper_path="$HOME/.config/aiterminal/bash_init.sh"
    [ -f "$helper_path" ] || { command ssh "$@"; return $?; }

    # Stream helper to remote and start a login shell with markers enabled
    command ssh "$@" 'mkdir -p ~/.config/aiterminal && cat > ~/.config/aiterminal/bash_init.sh && TERM_PROGRAM=aiterminal source ~/.config/aiterminal/bash_init.sh && exec $SHELL -l' < "$helper_path" && return $?

    # Fallback if anything failed
    command ssh "$@"
}

alias ssh='__aiterm_ssh'
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

fn get_config_path() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(|home| {
        std::path::Path::new(&home).join(".config/aiterminal/settings.json")
    })
}

#[tauri::command]
fn load_settings() -> Result<AppSettings, String> {
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
    let settings: AppSettings = serde_json::from_str(&content).unwrap_or_else(|_| {
        AppSettings::default()
    });
    Ok(settings)
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    let config_path = get_config_path().ok_or("Could not determine config path")?;
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(config_path, json).map_err(|e| e.to_string())?;
    Ok(())
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
            close_pty,
            load_settings,
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
