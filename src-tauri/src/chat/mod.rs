// Chat module - AI provider integrations for settings panel
pub mod commands;
pub mod helpers;
pub mod providers;

// Re-export public command interfaces
pub use commands::{test_ai_connection};
