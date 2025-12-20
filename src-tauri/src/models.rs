use portable_pty::{MasterPty, Child};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::sync::Mutex;
use std::thread::JoinHandle;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppearanceSettings {
    pub theme: String,
    pub font_size: u16,
    pub font_family: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiSettings {
    pub provider: String,
    pub model: String,
    pub api_key: String,
    pub embedding_model: Option<String>,
    pub url: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TerminalSettings {
    pub max_markers: u16,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppSettings {
    pub appearance: AppearanceSettings,
    pub ai: AiSettings,
    pub terminal: TerminalSettings,
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
            },
            terminal: TerminalSettings { max_markers: 200 },
        }
    }
}

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Option<Box<dyn Child + Send + Sync>>,
    pub reader_handle: Option<JoinHandle<()>>,
}

pub struct AppState {
    pub ptys: Mutex<HashMap<u32, PtySession>>,
    pub next_id: Mutex<u32>,
    pub api_key_cache: Mutex<HashMap<String, String>>,
    pub keychain_lock: Mutex<()>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            ptys: Mutex::new(HashMap::new()),
            next_id: Mutex::new(0),
            api_key_cache: Mutex::new(HashMap::new()),
            keychain_lock: Mutex::new(()),
        }
    }
}
