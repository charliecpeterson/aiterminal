use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::thread::{self, JoinHandle};
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
struct TerminalSettings {
    max_markers: u16,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
struct AppSettings {
    appearance: AppearanceSettings,
    ai: AiSettings,
    terminal: TerminalSettings,
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
            terminal: TerminalSettings { max_markers: 200 },
        }
    }
}

struct PtySession {
    master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Option<Box<dyn portable_pty::Child + Send + Sync>>,
    reader_handle: Option<JoinHandle<()>>,
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

fn resolve_shell() -> String {
    if let Ok(shell) = std::env::var("AITERM_SHELL") {
        if !shell.trim().is_empty() {
            return shell;
        }
    }

    if cfg!(target_os = "macos") {
        let user = std::env::var("USER")
            .or_else(|_| std::env::var("LOGNAME"))
            .unwrap_or_else(|_| "root".to_string());
        let user_path = format!("/Users/{}", user);
        if let Ok(output) = std::process::Command::new("dscl")
            .args(["/Local/Default", "-read", &user_path, "UserShell"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(shell) = line.strip_prefix("UserShell:") {
                    let shell = shell.trim();
                    if !shell.is_empty() {
                        return shell.to_string();
                    }
                }
            }
        }
    }

    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.trim().is_empty() {
            return shell;
        }
    }

    if !cfg!(target_os = "macos") {
        let user = std::env::var("USER")
            .or_else(|_| std::env::var("LOGNAME"))
            .or_else(|_| {
                std::process::Command::new("/usr/bin/id")
                    .arg("-un")
                    .output()
                    .ok()
                    .and_then(|output| String::from_utf8(output.stdout).ok())
                    .map(|s| s.trim().to_string())
                    .ok_or_else(|| std::env::VarError::NotPresent)
            });

        if let Ok(user) = user {
            if let Ok(passwd) = std::fs::read_to_string("/etc/passwd") {
                let needle = format!("{}:", user);
                for line in passwd.lines() {
                    if line.starts_with(&needle) {
                        let parts: Vec<&str> = line.split(':').collect();
                        if parts.len() >= 7 && !parts[6].trim().is_empty() {
                            return parts[6].trim().to_string();
                        }
                    }
                }
            }
        }
    }

    if cfg!(target_os = "macos") {
        "/bin/zsh".to_string()
    } else {
        "/bin/bash".to_string()
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn ping() -> String {
    // Simple health check; frontend measures round-trip latency of invoke
    "ok".to_string()
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
    let shell = if cfg!(target_os = "windows") {
        std::env::var("SHELL").unwrap_or_else(|_| "powershell.exe".to_string())
    } else {
        resolve_shell()
    };

    let mut cmd = CommandBuilder::new(&shell);
    // Ensure color-capable terminal for downstream commands
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("CLICOLOR", "1");

    // Setup configuration directory (Safe Mode: Create file but don't force load)
    let mut config_dir_opt: Option<PathBuf> = None;
    if let Ok(home) = std::env::var("HOME") {
        let config_dir = std::path::Path::new(&home).join(".config/aiterminal");
        if std::fs::create_dir_all(&config_dir).is_ok() {
            let bash_init_path = config_dir.join("bash_init.sh");
            let zsh_rc_path = config_dir.join(".zshrc");
            let bash_script = r#"
# AI Terminal OSC 133 Shell Integration

# Remove temp helper if used (non-persistent remote bootstrap)
if [ -n "$__AITERM_TEMP_FILE" ] && [ -f "$__AITERM_TEMP_FILE" ]; then
    rm -f "$__AITERM_TEMP_FILE"
    unset __AITERM_TEMP_FILE
fi

# Guard to prevent multiple sourcing (do not export so child shells can still init)
if [ -n "$__AITERM_INTEGRATION_LOADED" ]; then
    return
fi
__AITERM_INTEGRATION_LOADED=1

# Advertise to downstream shells
export TERM_PROGRAM=aiterminal

# Ensure user rc is loaded once (for colors/aliases) before installing hooks
if [ -z "$__AITERM_USER_RC_DONE" ]; then
    __AITERM_USER_RC_DONE=1
    if [ -n "$BASH_VERSION" ] && [ -f ~/.bashrc ]; then source ~/.bashrc 2>/dev/null; fi
    if [ -n "$BASH_VERSION" ] && [ -f ~/.bash_profile ] && [ -z "$__AITERM_BASH_PROFILE_DONE" ]; then
        __AITERM_BASH_PROFILE_DONE=1
        source ~/.bash_profile 2>/dev/null
    fi
    if [ -n "$ZSH_VERSION" ] && [ -f ~/.zshrc ]; then source ~/.zshrc 2>/dev/null; fi
fi

# Restore login profile on remote bootstrap (so MOTD appears)
if [ -n "$AITERM_REMOTE_BOOTSTRAP" ] && [ -z "$__AITERM_LOGIN_SOURCED" ]; then
    __AITERM_LOGIN_SOURCED=1
    if [ -f /etc/profile ]; then source /etc/profile 2>/dev/null; fi
    if [ -r /etc/motd ]; then cat /etc/motd; fi
    if [ -r /run/motd ]; then cat /run/motd; fi
    if [ -r /run/motd.dynamic ]; then cat /run/motd.dynamic; fi
fi

__aiterm_emit() { printf "\033]133;%s\007" "$1"; }
__aiterm_emit_host() {
    if [ -z "$__AITERM_HOSTNAME" ]; then
        __AITERM_HOSTNAME="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo unknown)"
    fi
    printf "\033]633;H;%s\007" "$__AITERM_HOSTNAME"
}
__aiterm_mark_prompt() { __aiterm_emit "A"; }
__aiterm_mark_output_start() { __aiterm_emit "C"; }
__aiterm_mark_done() { local ret=${1:-$?}; __aiterm_emit "D;${ret}"; }

# Prefer aiterm_ssh automatically inside AI Terminal
if [ "$TERM_PROGRAM" = "aiterminal" ]; then
    alias ssh='aiterm_ssh'
fi

if [ -n "$BASH_VERSION" ]; then
    __aiterm_prompt_wrapper() {
        local ret=$?
        __AITERM_IN_PROMPT=1
        __aiterm_mark_done "$ret"
        __aiterm_mark_prompt
        __aiterm_emit_host
        __AITERM_COMMAND_STARTED=
        __AITERM_IN_PROMPT=
    }

    if declare -p PROMPT_COMMAND 2>/dev/null | grep -q 'declare -a'; then
        if [ -n "$AITERM_HOOK_DEBUG" ]; then
            echo "AITERM hook: bash PROMPT_COMMAND is array" 1>&2
        fi
        __AITERM_PC_MANAGED=1
        __aiterm_has_wrapper=0
        for __aiterm_pc in "${PROMPT_COMMAND[@]}"; do
            if [ "$__aiterm_pc" = "__aiterm_prompt_wrapper" ]; then
                __aiterm_has_wrapper=1
                break
            fi
        done
        if [ $__aiterm_has_wrapper -eq 0 ]; then
            PROMPT_COMMAND=(__aiterm_prompt_wrapper "${PROMPT_COMMAND[@]}")
        fi
        unset __aiterm_pc __aiterm_has_wrapper
    else
        if [ -n "$AITERM_HOOK_DEBUG" ]; then
            echo "AITERM hook: bash PROMPT_COMMAND is string" 1>&2
        fi
        __AITERM_PC_MANAGED=1
        if [ -n "$PROMPT_COMMAND" ]; then
            PROMPT_COMMAND=(__aiterm_prompt_wrapper "$PROMPT_COMMAND")
        else
            PROMPT_COMMAND="__aiterm_prompt_wrapper"
        fi
    fi

    __aiterm_preexec() {
        if [ -n "$COMP_LINE" ]; then return; fi  # skip completion
        if [ -n "$__AITERM_IN_PROMPT" ]; then return; fi
        if [ -n "$__AITERM_COMMAND_STARTED" ]; then return; fi
        case "$BASH_COMMAND" in
            __aiterm_prompt_wrapper*|__aiterm_preexec*) return ;;
        esac
        __AITERM_COMMAND_STARTED=1
        __aiterm_mark_output_start
    }
    trap '__aiterm_preexec' DEBUG
elif [ -n "$ZSH_VERSION" ]; then
    if [ -z "$__AITERM_ZSH_HOOKS" ]; then
        if [ -n "$AITERM_HOOK_DEBUG" ]; then
            echo "AITERM hook: zsh add hooks" 1>&2
        fi
        __AITERM_ZSH_HOOKS=1
        autoload -Uz add-zsh-hook
        __aiterm_precmd() { __aiterm_mark_done $?; __aiterm_mark_prompt; __aiterm_emit_host; __AITERM_COMMAND_STARTED=; }
        __aiterm_preexec() {
            if [ -n "$__AITERM_COMMAND_STARTED" ]; then return; fi
            __AITERM_COMMAND_STARTED=1
            __aiterm_mark_output_start
        }
        add-zsh-hook precmd __aiterm_precmd
        add-zsh-hook preexec __aiterm_preexec
    fi
fi


if [ -z "$__AITERM_OSC133_BANNER_SHOWN" ]; then
    export __AITERM_OSC133_BANNER_SHOWN=1
    if [ -n "$AITERM_HOOK_DEBUG" ] || [ -n "$AITERM_SSH_DEBUG" ]; then
        echo "AI Terminal OSC 133 shell integration active ($(basename "$SHELL"))"
    fi
fi

aiterm_ssh() {
    # Explicit helper: only run when user calls aiterm_ssh, leave ssh untouched
    if [ "$TERM_PROGRAM" != "aiterminal" ]; then command ssh "$@"; return $?; fi

    local helper_path="$HOME/.config/aiterminal/bash_init.sh"
    local orig_args=("$@")
    if [ ${#orig_args[@]} -eq 0 ]; then
        printf '%s\n' "usage: aiterm_ssh destination [command [argument ...]]"
        return 2
    fi
    local inline_script=""
    if [ -f "$helper_path" ]; then
        inline_script="$(cat "$helper_path")"
    elif [ -n "$__AITERM_INLINE_CACHE" ]; then
        inline_script="$__AITERM_INLINE_CACHE"
    else
        command ssh "${orig_args[@]}"
        return $?
    fi

    # Detect target and remote command; if a remote command is present, fall back
    local target=""
    local remote_cmd_present=0
    set -- "$@"
    while [ $# -gt 0 ]; do
        case "$1" in
            -o|-J|-F|-i|-b|-c|-D|-E|-e|-I|-L|-l|-m|-O|-p|-P|-Q|-R|-S|-W|-w|-B)
                shift
                [ $# -gt 0 ] && shift
                ;;
            -o*|-J*|-F*|-i*|-b*|-c*|-D*|-E*|-e*|-I*|-L*|-l*|-m*|-O*|-p*|-P*|-Q*|-R*|-S*|-W*|-w*|-B*)
                shift
                ;;
            --)
                shift
                if [ $# -gt 0 ]; then
                    target="$1"
                    shift
                fi
                [ $# -gt 0 ] && remote_cmd_present=1
                break
                ;;
            -*)
                shift
                ;;
            *)
                if [ -z "$target" ]; then
                    target="$1"
                    shift
                else
                    remote_cmd_present=1
                    break
                fi
                ;;
        esac
    done

    [ -z "$target" ] && { command ssh "${orig_args[@]}"; return $?; }
    if [ $remote_cmd_present -eq 1 ]; then
        command ssh "${orig_args[@]}"
        return $?
    fi

    local inline_b64
    inline_b64="$(printf '%s' "$inline_script" | base64 | tr -d '\n')"
    if [ -z "$inline_b64" ]; then
        command ssh "${orig_args[@]}"
        return $?
    fi

    if [ ${#inline_b64} -gt 4096 ]; then
        inline_b64="$(printf '%s' "$inline_b64" | fold -w 1000)"
    fi
    local inline_b64_env
    inline_b64_env="$(printf '%s' "$inline_b64" | tr -d '\n')"

    if [ -n "$AITERM_SSH_HIDE_PAYLOAD" ]; then
        local remote_cmd_str
        remote_cmd_str='remote_shell="${SHELL:-/bin/sh}"; [ -x "$remote_shell" ] || remote_shell=/bin/sh; payload="${AITERM_B64:-}"; [ -n "$payload" ] || exec "$remote_shell" -l; umask 077; tmpfile="$(mktemp -t aiterminal.XXXXXX 2>/dev/null || mktemp /tmp/aiterminal.XXXXXX)" || exit 1; chmod 600 "$tmpfile" 2>/dev/null || true; if command -v base64 >/dev/null 2>&1; then printf "%s" "$payload" | tr -d "\n" | base64 -d > "$tmpfile" || exit 1; elif command -v openssl >/dev/null 2>&1; then printf "%s" "$payload" | tr -d "\n" | openssl base64 -d > "$tmpfile" || exit 1; else exec "$remote_shell" -l; fi; if ! grep -q "AI Terminal OSC 133 Shell Integration" "$tmpfile"; then exec "$remote_shell" -l; fi; export __AITERM_TEMP_FILE="$tmpfile"; export __AITERM_INLINE_CACHE="$(cat "$tmpfile")"; export TERM_PROGRAM=aiterminal SHELL="$remote_shell"; case "$remote_shell" in */bash) exec "$remote_shell" --rcfile "$tmpfile" -i ;; */zsh) exec "$remote_shell" -l -c "source \"$tmpfile\"; exec \"$remote_shell\" -l" ;; *) exec "$remote_shell" -l ;; esac'
        command env AITERM_B64="$inline_b64_env" ssh -tt -o SendEnv=AITERM_B64 "${orig_args[@]}" "$remote_cmd_str"
        return $?
    fi

    local remote_cmd_str
    remote_cmd_str='remote_shell="${SHELL:-/bin/sh}"; [ -x "$remote_shell" ] || remote_shell=/bin/sh; umask 077; tmpfile="$(mktemp -t aiterminal.XXXXXX 2>/dev/null || mktemp /tmp/aiterminal.XXXXXX)" || exit 1; chmod 600 "$tmpfile" 2>/dev/null || true; if command -v base64 >/dev/null 2>&1; then printf "%s" "__AITERM_B64__" | tr -d "\n" | base64 -d > "$tmpfile" || exit 1; elif command -v openssl >/dev/null 2>&1; then printf "%s" "__AITERM_B64__" | tr -d "\n" | openssl base64 -d > "$tmpfile" || exit 1; else exec "$remote_shell" -l; fi; if ! grep -q "AI Terminal OSC 133 Shell Integration" "$tmpfile"; then exec "$remote_shell" -l; fi; export __AITERM_TEMP_FILE="$tmpfile"; export __AITERM_INLINE_CACHE="$(cat "$tmpfile")"; export TERM_PROGRAM=aiterminal SHELL="$remote_shell"; export AITERM_REMOTE_BOOTSTRAP=1; case "$remote_shell" in */bash) exec "$remote_shell" --rcfile "$tmpfile" -i ;; */zsh) exec "$remote_shell" -l -c "source \"$tmpfile\"; exec \"$remote_shell\" -l" ;; *) exec "$remote_shell" -l ;; esac'
    remote_cmd_str="${remote_cmd_str//__AITERM_B64__/$inline_b64}"

    command ssh -tt "${orig_args[@]}" "$remote_cmd_str"
}
"#;
            let _ = std::fs::write(&bash_init_path, bash_script);
            let zsh_rc = r#"
# AI Terminal zsh bootstrap
if [ -f ~/.zshrc ]; then source ~/.zshrc 2>/dev/null; fi
if [ -f ~/.config/aiterminal/bash_init.sh ]; then source ~/.config/aiterminal/bash_init.sh 2>/dev/null; fi
"#;
            let _ = std::fs::write(&zsh_rc_path, zsh_rc);
            config_dir_opt = Some(config_dir);
        }
    }

    // Start shell with integration loaded without injecting a visible command
    if !cfg!(target_os = "windows") {
        if let Some(config_dir) = &config_dir_opt {
            if shell.ends_with("bash") {
                let bash_init_path = config_dir.join("bash_init.sh");
                cmd.args(&[
                    "--rcfile",
                    bash_init_path.to_string_lossy().as_ref(),
                    "-i",
                ]);
            } else if shell.ends_with("zsh") {
                cmd.env("ZDOTDIR", config_dir.to_string_lossy().as_ref());
                cmd.args(&["-i"]);
            } else {
                cmd.args(&["-l"]);
            }
        } else {
            cmd.args(&["-l"]);
        }
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let master = pair.master;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    // Store session in state
    // Spawn thread to read
    let reader_handle = thread::spawn(move || {
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

    {
        let mut ptys = state.ptys.lock().unwrap();
        ptys.insert(
            id,
            PtySession {
                master,
                writer,
                child: Some(child),
                reader_handle: Some(reader_handle),
            },
        );
    }

    Ok(id)
}

fn get_config_path() -> Option<PathBuf> {
    std::env::var("HOME").ok().map(|home| {
        std::path::Path::new(&home).join(".config/aiterminal/settings.json")
    })
}

fn clamp_max_markers(value: u16) -> u16 {
    value.clamp(20, 2000)
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
    let mut settings: AppSettings = serde_json::from_str(&content).unwrap_or_else(|_| {
        AppSettings::default()
    });
    settings.terminal.max_markers = clamp_max_markers(settings.terminal.max_markers);
    Ok(settings)
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
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
    let session = {
        let mut ptys = state.ptys.lock().unwrap();
        ptys.remove(&id)
    };

    if let Some(mut session) = session {
        if let Some(mut child) = session.child.take() {
            let should_kill = match child.try_wait() {
                Ok(Some(_)) => false,
                Ok(None) => true,
                Err(e) => {
                    eprintln!("Failed to poll PTY child {id}: {e}");
                    true
                }
            };

            if should_kill {
                if let Err(e) = child.kill() {
                    eprintln!("Failed to kill PTY child {id}: {e}");
                }
            }

            if let Err(e) = child.wait() {
                eprintln!("Failed to wait for PTY child {id}: {e}");
            }
        }

        if let Some(handle) = session.reader_handle.take() {
            if let Err(e) = handle.join() {
                eprintln!("Failed to join reader thread for {id}: {e:?}");
            }
        }
    }
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
            save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
