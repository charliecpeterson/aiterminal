/// Shared test utilities used across security, integration, and fuzz test modules.

use crate::models::AppState;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

pub fn new_state() -> AppState {
    AppState::new()
}

pub fn is_traversal_error(message: &str) -> bool {
    message.contains("Access denied")
        || message.contains("Path traversal")
        || message.contains("Parent directory")
        || message.contains("Could not canonicalize")
}

pub fn setup_test_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let test_dir = env::temp_dir().join(format!("aiterminal_test_{}", nanos));
    fs::create_dir_all(&test_dir).unwrap();
    test_dir
}

pub struct TestHomeGuard {
    _lock: std::sync::MutexGuard<'static, ()>,
    original: Option<String>,
}

impl Drop for TestHomeGuard {
    fn drop(&mut self) {
        if let Some(original) = self.original.take() {
            env::set_var("HOME", original);
        }
    }
}

pub fn with_test_home() -> (TestHomeGuard, PathBuf) {
    static HOME_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    let lock = HOME_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let original = env::var("HOME").ok();
    let test_home = env::temp_dir().join("aiterminal_test_home");
    let _ = fs::create_dir_all(&test_home);
    env::set_var("HOME", &test_home);
    (TestHomeGuard { _lock: lock, original }, test_home)
}
