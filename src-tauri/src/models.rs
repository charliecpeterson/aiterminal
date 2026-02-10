use portable_pty::{Child, MasterPty};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::AtomicU32;
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

// PTY and buffering constants
pub const PTY_BUFFER_SIZE: usize = 8192; // 8KB for PTY read buffer
pub const MAX_STREAM_BUFFER_SIZE: usize = 1024 * 1024; // 1MB limit for SSE stream buffer

// Network and timeout constants
pub const HTTP_TIMEOUT_SECS: u64 = 120;
pub const DEFAULT_MAX_TOKENS: u32 = 4096;
pub const MIN_MAX_TOKENS: u32 = 256;
pub const MAX_MAX_TOKENS: u32 = 128000;
pub const DEFAULT_MAX_MARKERS: u16 = 500;
pub const MAX_TERMINAL_DIMENSION: u16 = 10000;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppearanceSettings {
    pub theme: String,
    pub font_size: u16,
    pub font_family: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "lowercase")]
pub enum AiMode {
    Chat,
    Agent,
}

fn default_ai_mode() -> AiMode {
    AiMode::Agent
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiSettings {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub embedding_model: Option<String>,
    pub url: Option<String>,
    #[serde(default = "default_ai_mode")]
    pub mode: AiMode,
    #[serde(default)]
    pub require_command_approval: Option<bool>,
    #[serde(default)]
    pub api_key_in_keychain: Option<bool>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TerminalSettings {
    pub max_markers: u16,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AutocompleteSettings {
    pub enable_inline: bool,
    pub enable_menu: bool,
    #[serde(default = "default_inline_source")]
    pub inline_source: String, // 'history', 'llm', or 'hybrid'
    #[serde(default = "default_llm_temperature")]
    pub llm_temperature: f32, // 0.0-1.0
    #[serde(default = "default_llm_max_tokens")]
    pub llm_max_tokens: u32, // 5-50
    #[serde(default = "default_llm_debounce_ms")]
    pub llm_debounce_ms: u32, // 0-1000ms
}

fn default_inline_source() -> String { "history".to_string() }
fn default_llm_temperature() -> f32 { 0.1 }
fn default_llm_max_tokens() -> u32 { 15 }
fn default_llm_debounce_ms() -> u32 { 300 }

impl Default for AutocompleteSettings {
    fn default() -> Self {
        Self {
            enable_inline: true,
            enable_menu: true,
            inline_source: default_inline_source(),
            llm_temperature: default_llm_temperature(),
            llm_max_tokens: default_llm_max_tokens(),
            llm_debounce_ms: default_llm_debounce_ms(),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StreamingSettings {
    pub max_tokens: u32,
    pub timeout_secs: u64,
    pub buffer_size_limit: usize,
}

impl Default for StreamingSettings {
    fn default() -> Self {
        Self {
            max_tokens: DEFAULT_MAX_TOKENS,
            timeout_secs: HTTP_TIMEOUT_SECS,
            buffer_size_limit: MAX_STREAM_BUFFER_SIZE,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppSettings {
    pub appearance: AppearanceSettings,
    pub ai: AiSettings,
    pub terminal: TerminalSettings,
    #[serde(default)]
    pub autocomplete: AutocompleteSettings,
    #[serde(default)]
    pub streaming: StreamingSettings,
}

#[derive(Serialize, Debug, Clone)]
pub struct AiModelList {
    pub models: Vec<String>,
    pub embedding_models: Vec<String>,
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
                mode: AiMode::Agent,
                require_command_approval: Some(true),
                api_key_in_keychain: Some(false),
            },
            terminal: TerminalSettings {
                max_markers: DEFAULT_MAX_MARKERS,
            },
            autocomplete: AutocompleteSettings::default(),
            streaming: StreamingSettings::default(),
        }
    }
}

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Option<Box<dyn Child + Send + Sync>>,
    pub reader_handle: Option<JoinHandle<()>>,
    pub ssh_session: Option<SshSessionInfo>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SshSessionInfo {
    pub remote_host: String,
    pub remote_user: Option<String>,
    pub remote_port: u16,
    pub connection_time: u64, // Unix timestamp
    pub last_latency_ms: Option<u64>,
    pub latency_monitor_handle: Option<()>, // Placeholder for thread handle (can't serialize JoinHandle)
}

#[derive(Debug, Clone, Serialize)]
pub enum ContextConfidence {
    High,   // Single SSH, clear prompt
    Medium, // SSH detected but uncertain
    Low,    // Complex nesting or unclear
}

#[derive(Debug, Clone, Serialize)]
pub struct TerminalContext {
    pub terminal_id: u32,
    pub is_ssh: bool,
    pub remote_host: Option<String>,
    pub remote_cwd: Option<String>,
    pub confidence: ContextConfidence,
    pub connection_depth: u32, // 0=local, 1=ssh, 2=nested, etc.
    pub last_updated: u64,     // Unix timestamp
}

impl TerminalContext {
    pub fn new_local(terminal_id: u32) -> Self {
        Self {
            terminal_id,
            is_ssh: false,
            remote_host: None,
            remote_cwd: None,
            confidence: ContextConfidence::High,
            connection_depth: 0,
            last_updated: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs(),
        }
    }
}

/// Stores a backup of file content before modification
#[derive(Debug, Clone)]
pub struct FileBackup {
    pub path: String,
    pub content: String,
    pub timestamp: u64,
}

/// Maximum number of file backups to keep per file path
pub const MAX_BACKUPS_PER_FILE: usize = 5;
/// Maximum total backups across all files
pub const MAX_TOTAL_BACKUPS: usize = 50;

pub struct AppState {
    pub ptys: Mutex<HashMap<u32, PtySession>>,
    pub next_id: Mutex<u32>,
    pub api_key_cache: Mutex<HashMap<String, String>>,
    pub keychain_lock: Mutex<()>,
    pub ssh_sessions: Arc<Mutex<HashMap<u32, SshSessionInfo>>>, // PTY ID -> SSH info, wrapped in Arc for thread sharing
    pub terminal_contexts: Arc<Mutex<HashMap<u32, TerminalContext>>>, // PTY ID -> Context
    pub context_index: Mutex<crate::context_index::ContextIndex>,
    pub file_backups: Mutex<Vec<FileBackup>>, // Stack of file backups for undo functionality
    pub pty_last_output: Arc<Mutex<HashMap<u32, u64>>>, // PTY ID -> last output timestamp (ms since epoch)
    pub active_terminal: AtomicU32, // Currently focused terminal ID (0 = none)
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ptys: Mutex::new(HashMap::new()),
            next_id: Mutex::new(0),
            api_key_cache: Mutex::new(HashMap::new()),
            keychain_lock: Mutex::new(()),
            ssh_sessions: Arc::new(Mutex::new(HashMap::new())),
            terminal_contexts: Arc::new(Mutex::new(HashMap::new())),
            context_index: Mutex::new(crate::context_index::ContextIndex::default()),
            file_backups: Mutex::new(Vec::new()),
            pty_last_output: Arc::new(Mutex::new(HashMap::new())),
            active_terminal: AtomicU32::new(0),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
