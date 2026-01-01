// Autocomplete module - Local LLM completions
pub mod engine;

// Re-export commands for easier access
pub use engine::{
    get_llm_completions, get_llm_inline_completion, get_path_commands, init_llm,
    is_command_in_path, list_dir_entries, llm_health_check, stop_llm, LLMEngine,
};
