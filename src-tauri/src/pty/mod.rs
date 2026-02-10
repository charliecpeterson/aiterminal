// PTY module - Terminal pseudo-terminal management
mod commands;
mod integration;
mod osc_parser;
mod reader;
mod shell;
mod spawn;

// Re-export public interfaces
pub use commands::{check_pty_health, close_pty, focus_terminal, get_active_terminal, get_pty_cwd, get_pty_info, resize_pty, write_to_pty};
pub use spawn::spawn_pty;

// Re-export PtyInfo for backward compatibility
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PtyInfo {
    pub pty_type: String, // "local" or "ssh"
    pub remote_host: Option<String>,
    pub remote_user: Option<String>,
    pub ssh_client: Option<String>,
    pub connection_time: Option<u64>,
}
