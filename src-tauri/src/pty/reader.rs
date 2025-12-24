use crate::health_check;
use crate::models::{SshSessionInfo, PTY_BUFFER_SIZE};
use std::io::Read;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use super::osc_parser::{parse_remote_host_osc, current_timestamp};

/// Spawn thread to read PTY output and handle SSH detection
pub fn spawn_reader_thread(
    mut reader: Box<dyn Read + Send>,
    window: tauri::Window,
    id: u32,
    ssh_sessions: Arc<Mutex<std::collections::HashMap<u32, SshSessionInfo>>>,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut buf = [0u8; PTY_BUFFER_SIZE];
        loop {
            match reader.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let data = &buf[..n];
                    let data_str = String::from_utf8_lossy(data).to_string();
                    
                    // Parse OSC sequences for SSH detection
                    if let Some(remote_info) = parse_remote_host_osc(&data_str) {
                        handle_ssh_detection(id, remote_info, &ssh_sessions);
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
    })
}

/// Handle SSH session detection and start latency monitoring
fn handle_ssh_detection(
    id: u32,
    remote_info: Option<(String, String, Option<String>)>,
    ssh_sessions: &Arc<Mutex<std::collections::HashMap<u32, SshSessionInfo>>>,
) {
    if let Some((user, host, ip_opt)) = remote_info {
        // SSH session detected
        let ssh_info = SshSessionInfo {
            remote_host: host.clone(),
            remote_user: Some(user.clone()),
            remote_port: 22,
            connection_time: current_timestamp(),
            last_latency_ms: None,
            latency_monitor_handle: None,
        };
        
        if let Ok(mut sessions) = ssh_sessions.lock() {
            sessions.insert(id, ssh_info);
        }
        
        // Start latency monitoring
        start_latency_monitor(id, ip_opt.unwrap_or(host), ssh_sessions.clone());
    } else {
        // Back to local (no remote host)
        if let Ok(mut sessions) = ssh_sessions.lock() {
            sessions.remove(&id);
        }
    }
}

/// Start background thread to monitor SSH latency
fn start_latency_monitor(
    id: u32,
    target: String,
    ssh_sessions: Arc<Mutex<std::collections::HashMap<u32, SshSessionInfo>>>,
) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(5));
            
            match health_check::measure_tcp_latency(&target, 22, 5000) {
                Ok(latency) => {
                    let latency_ms = latency.as_millis() as u64;
                    
                    if let Ok(mut sessions) = ssh_sessions.lock() {
                        if let Some(info) = sessions.get_mut(&id) {
                            info.last_latency_ms = Some(latency_ms);
                        } else {
                            break; // Session closed, exit monitor
                        }
                    }
                }
                Err(_) => {
                    // Silently continue on latency measurement failure
                }
            }
        }
    });
}
