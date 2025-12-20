use crate::models::{AppState, PtySession};
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::thread;
use tauri::{Emitter, State};

fn resolve_shell() -> String {
    if let Ok(shell) = std::env::var("AITERM_SHELL") {
        if !shell.trim().is_empty() {
            return shell;
        }
    }

    if cfg!(target_os = "macos") {
        if let Ok(username) = std::env::var("USER") {
            if let Ok(output) = std::process::Command::new("dscl")
                .args(&[".", "-read", &format!("/Users/{}", username), "UserShell"])
                .output()
            {
            if output.status.success() {
                if let Ok(text) = String::from_utf8(output.stdout) {
                    for line in text.lines() {
                        if line.starts_with("UserShell:") {
                            let shell = line["UserShell:".len()..].trim();
                            if !shell.is_empty() {
                                return shell.to_string();
                            }
                        }
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

#[tauri::command]
pub fn spawn_pty(window: tauri::Window, state: State<AppState>) -> Result<u32, String> {
    let id = {
        let mut next_id = state.next_id.lock()
            .map_err(|e| format!("Failed to acquire ID lock: {}", e))?;
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

    // Setup configuration directory
    let mut config_dir_opt: Option<PathBuf> = None;
    if let Ok(home) = std::env::var("HOME") {
        let config_dir = std::path::Path::new(&home).join(".config/aiterminal");
        if std::fs::create_dir_all(&config_dir).is_ok() {
            let bash_init_path = config_dir.join("bash_init.sh");
            let ssh_helper_path = config_dir.join("ssh_helper.sh");
            let zsh_rc_path = config_dir.join(".zshrc");
            
            // Use embedded shell scripts from build time
            let bash_script = include_str!("../shell-integration/bash_init.sh");
            let ssh_helper_script = include_str!("../shell-integration/ssh_helper.sh");
            let zsh_rc = include_str!("../shell-integration/zshrc");
            
            let _ = std::fs::write(&bash_init_path, bash_script);
            let _ = std::fs::write(&ssh_helper_path, ssh_helper_script);
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
        let mut ptys = state.ptys.lock()
            .map_err(|e| format!("Failed to acquire PTY lock: {}", e))?;
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

#[tauri::command]
pub fn write_to_pty(id: u32, data: String, state: State<AppState>) {
    let mut ptys = match state.ptys.lock() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to acquire PTY lock: {}", e);
            return;
        }
    };
    if let Some(session) = ptys.get_mut(&id) {
        if let Err(e) = write!(session.writer, "{}", data) {
            eprintln!("Failed to write to PTY {}: {}", id, e);
        }
    }
}

#[tauri::command]
pub fn resize_pty(id: u32, rows: u16, cols: u16, state: State<AppState>) {
    let mut ptys = match state.ptys.lock() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to acquire PTY lock: {}", e);
            return;
        }
    };
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
pub fn close_pty(id: u32, state: State<AppState>) {
    let session = {
        let mut ptys = match state.ptys.lock() {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[PTY {id}] Failed to acquire PTY lock: {}", e);
                return;
            }
        };
        ptys.remove(&id)
    };

    if let Some(mut session) = session {
        // Drop writer to signal EOF to the shell
        drop(session.writer);
        
        if let Some(mut child) = session.child.take() {
            let should_kill = match child.try_wait() {
                Ok(Some(_)) => {
                    eprintln!("[PTY {id}] Process already exited");
                    false
                },
                Ok(None) => {
                    eprintln!("[PTY {id}] Process still running, killing...");
                    true
                },
                Err(e) => {
                    eprintln!("[PTY {id}] Failed to poll child: {e}");
                    true
                }
            };

            if should_kill {
                // Kill the child process
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
