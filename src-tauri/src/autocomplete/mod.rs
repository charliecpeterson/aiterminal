// Autocomplete module - Local LLM completions
pub mod engine;

// Re-export commands for easier access
pub use engine::{
    init_llm, 
    stop_llm, 
    get_llm_completions, 
    get_llm_inline_completion, 
    llm_health_check,
    is_command_in_path,
    get_path_commands,
    list_dir_entries,
    LLMEngine,
};
