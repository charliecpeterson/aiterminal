// PTY module - Terminal pseudo-terminal management
mod osc_parser;
mod shell;
mod integration;
mod reader;
mod commands;
mod spawn;

// Re-export public interfaces
pub use spawn::spawn_pty;
pub use commands::{get_pty_info, write_to_pty, resize_pty, close_pty, get_pty_cwd};

// Re-export PtyInfo for backward compatibility
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PtyInfo {
    pub pty_type: String, // "local" or "ssh"
    pub remote_host: Option<String>,
    pub remote_user: Option<String>,
    pub ssh_client: Option<String>,
    pub connection_time: Option<u64>,
}
