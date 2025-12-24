// Autocomplete module - Local LLM completions
pub mod engine;

// Re-export commands for easier access
pub use engine::{
    init_llm, 
    stop_llm, 
    get_llm_completions, 
    get_llm_inline_completion, 
    llm_health_check,
    LLMEngine,
};
