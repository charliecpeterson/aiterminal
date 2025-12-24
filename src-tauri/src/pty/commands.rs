use crate::models::AppState;
use super::PtyInfo;
use portable_pty::PtySize;
use std::io::Write;
use tauri::State;

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
            let output = Command::new("lsof")
                .args(["-a", "-p", &child.process_id().unwrap_or(0).to_string(), "-d", "cwd", "-Fn"])
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
