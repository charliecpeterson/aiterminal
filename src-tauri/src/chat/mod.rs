// Chat module - AI provider integrations for chat panel
pub mod helpers;
pub mod commands;
pub mod providers;

// Re-export public command interfaces
pub use commands::{ai_chat, ai_chat_stream, test_ai_connection};
