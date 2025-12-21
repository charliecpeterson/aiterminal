use crate::models::{AppState, PtySession, SshSessionInfo};
use crate::health_check;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Serialize, Deserialize};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, State};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PtyInfo {
    pub pty_type: String, // "local" or "ssh"
    pub remote_host: Option<String>,
    pub remote_user: Option<String>,
    pub ssh_client: Option<String>,
    pub connection_time: Option<u64>,
}
/// Parse RemoteHost OSC sequence
/// Format: ESC]1337;RemoteHost=user@host:ip BEL
/// Returns Some((user, host, ip)) if SSH, None if local
fn parse_remote_host_osc(data: &str) -> Option<Option<(String, String, Option<String>)>> {
    // Look for OSC 1337 RemoteHost sequence
    let prefix = "\x1b]1337;RemoteHost=";
    if let Some(start) = data.find(prefix) {
        let after_prefix = &data[start + prefix.len()..]; // Skip the prefix
        
        // Find terminator (BEL \x07 or ST \x1b\\)
        let end = after_prefix.find('\x07')
            .or_else(|| after_prefix.find("\x1b\\"))
            .unwrap_or(after_prefix.len());
        
        let value = &after_prefix[..end];
        
        if value.is_empty() || value == "local" {
            // Explicitly local
            return Some(None);
        }
        
        // Parse user@host:ip
        if let Some(at_pos) = value.find('@') {
            let user = value[..at_pos].to_string();
            let rest = &value[at_pos + 1..];
            
            // Check for :ip suffix
            if let Some(colon_pos) = rest.rfind(':') {
                let host = rest[..colon_pos].to_string();
                let ip = rest[colon_pos + 1..].to_string();
                return Some(Some((user, host, Some(ip))));
            } else {
                return Some(Some((user, rest.to_string(), None)));
            }
        } else {
            // Just hostname, use current user
            let user = std::env::var("USER").unwrap_or_else(|_| "unknown".to_string());
            
            // Check for :ip suffix
            if let Some(colon_pos) = value.rfind(':') {
                let host = value[..colon_pos].to_string();
                let ip = value[colon_pos + 1..].to_string();
                return Some(Some((user, host, Some(ip))));
            } else {
                return Some(Some((user, value.to_string(), None)));
            }
        }
    }
    
    None
}
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

    // Clone state reference for the reader thread
    let ssh_sessions_clone = state.ssh_sessions.clone();

    // Spawn thread to read
    let reader_handle = thread::spawn(move || {
        let mut buf = [0u8; crate::models::PTY_BUFFER_SIZE];
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let data = &buf[..n];
                    let data_str = String::from_utf8_lossy(data).to_string();
                    
                    // Parse OSC sequences for SSH detection
                    // Format: \x1b]1337;RemoteHost=user@host:ip\x07
                    if let Some(remote_info) = parse_remote_host_osc(&data_str) {
                        if let Some((user, host, ip_opt)) = remote_info {
                            // SSH session detected
                            let timestamp = SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap()
                                .as_secs();
                            
                            let ssh_info = SshSessionInfo {
                                remote_host: host.clone(),
                                remote_user: Some(user.clone()),
                                remote_port: 22,
                                connection_time: timestamp,
                                last_latency_ms: None,
                                latency_monitor_handle: None,
                            };
                            
                            if let Ok(mut sessions) = ssh_sessions_clone.lock() {
                                sessions.insert(id, ssh_info);
                            }
                            
                            // Start latency monitoring
                            // Use IP if available, otherwise try hostname variants
                            let ssh_sessions_for_thread = ssh_sessions_clone.clone();
                            let target_for_latency = ip_opt.unwrap_or_else(|| host.clone());
                            
                            std::thread::spawn(move || {
                                loop {
                                    std::thread::sleep(std::time::Duration::from_secs(5));
                                    
                                    match health_check::measure_tcp_latency(&target_for_latency, 22, 5000) {
                                        Ok(latency) => {
                                            let latency_ms = latency.as_millis() as u64;
                                            
                                            if let Ok(mut sessions) = ssh_sessions_for_thread.lock() {
                                                if let Some(info) = sessions.get_mut(&id) {
                                                    info.last_latency_ms = Some(latency_ms);
                                                } else {
                                                    break;
                                                }
                                            }
                                        }
                                        Err(_) => {
                                            // Silently continue on latency measurement failure
                                        }
                                    }
                                }
                            });
                        } else {
                            // Back to local (no remote host)
                            if let Ok(mut sessions) = ssh_sessions_clone.lock() {
                                sessions.remove(&id);
                            }
                        }
                    }
                    
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
                ssh_session: None, // Initially no SSH session
            },
        );
    }

    Ok(id)
}

#[tauri::command]
pub fn get_pty_info(id: u32, state: State<AppState>) -> Result<PtyInfo, String> {
    // Check if PTY exists
    let ptys = state.ptys.lock()
        .map_err(|e| format!("Failed to acquire PTY lock: {}", e))?;
    
    if !ptys.contains_key(&id) {
        return Err(format!("PTY {} not found", id));
    }
    drop(ptys);

    // Check if there's an active SSH session
    let ssh_sessions = state.ssh_sessions.lock()
        .map_err(|e| format!("Failed to acquire SSH session lock: {}", e))?;
    
    if let Some(ssh_info) = ssh_sessions.get(&id) {
        // Active SSH session detected
        Ok(PtyInfo {
            pty_type: "ssh".to_string(),
            remote_host: Some(ssh_info.remote_host.clone()),
            remote_user: ssh_info.remote_user.clone(),
            ssh_client: Some(format!("{}:{}", ssh_info.remote_host, ssh_info.remote_port)),
            connection_time: Some(ssh_info.connection_time),
        })
    } else {
        // Local session
        Ok(PtyInfo {
            pty_type: "local".to_string(),
            remote_host: None,
            remote_user: None,
            ssh_client: None,
            connection_time: None,
        })
    }
}

#[tauri::command]
pub fn write_to_pty(id: u32, data: String, state: State<AppState>) -> Result<(), String> {
    let mut ptys = state.ptys.lock()
        .map_err(|e| format!("Failed to acquire PTY lock: {}", e))?;
    
    if let Some(session) = ptys.get_mut(&id) {
        session.writer.write_all(data.as_bytes())
            .map_err(|e| format!("Failed to write to PTY {}: {}", id, e))?;
        session.writer.flush()
            .map_err(|e| format!("Failed to flush PTY {}: {}", id, e))?;
        Ok(())
    } else {
        Err(format!("PTY {} not found", id))
    }
}

#[tauri::command]
pub fn resize_pty(id: u32, rows: u16, cols: u16, state: State<AppState>) {
    use crate::models::MAX_TERMINAL_DIMENSION;
    
    // Validate dimensions
    let rows = rows.min(MAX_TERMINAL_DIMENSION);
    let cols = cols.min(MAX_TERMINAL_DIMENSION);
    
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
    // Remove SSH session tracking if exists
    if let Ok(mut sessions) = state.ssh_sessions.lock() {
        sessions.remove(&id);
    }
    
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

#[tauri::command]
pub fn get_pty_cwd(id: u32, state: State<AppState>) -> Result<String, String> {
    let ptys = state.ptys.lock()
        .map_err(|e| format!("Failed to lock PTY state: {}", e))?;
    
    let session = ptys.get(&id)
        .ok_or_else(|| format!("PTY {} not found", id))?;
    
    // Get the PID of the shell process
    if let Some(child) = &session.child {
        // On Unix systems, we can try to read the cwd from /proc or use lsof
        #[cfg(target_os = "macos")]
        {
            use std::process::Command;
            
            // Use lsof to find the current working directory of the process
            // lsof -p <pid> | grep cwd will show the current working directory
            let output = Command::new("lsof")
                .args(&["-a", "-p", &child.process_id().unwrap_or(0).to_string(), "-d", "cwd", "-Fn"])
                .output()
                .map_err(|e| format!("Failed to run lsof: {}", e))?;
            
            if output.status.success() {
                let output_str = String::from_utf8_lossy(&output.stdout);
                // Parse lsof output: looking for "n<path>" line
                for line in output_str.lines() {
                    if line.starts_with('n') {
                        return Ok(line[1..].to_string());
                    }
                }
            }
        }
        
        #[cfg(target_os = "linux")]
        {
            use std::fs;
            if let Some(pid) = child.process_id() {
                let cwd_link = format!("/proc/{}/cwd", pid);
                if let Ok(cwd) = fs::read_link(&cwd_link) {
                    return Ok(cwd.to_string_lossy().to_string());
                }
            }
        }
    }
    
    // Fallback: return the app's current directory
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to get current directory: {}", e))
}
