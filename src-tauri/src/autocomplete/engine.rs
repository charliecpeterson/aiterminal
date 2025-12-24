use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::State;

// LLM Server Configuration Constants
const LLM_SERVER_PORT: u16 = 8765;
const LLM_SERVER_HOST: &str = "localhost";
const LLM_CONTEXT_SIZE: u32 = 512;
const LLM_N_PREDICT: u32 = 50;
const LLM_DEFAULT_TEMPERATURE: f32 = 0.3;
const LLM_FOCUSED_TEMPERATURE: f32 = 0.1;
const LLM_THREADS: u32 = 4;

#[derive(Debug, Serialize, Deserialize)]
pub struct CompletionRequest {
    prompt: String,
    n_predict: u32,
    temperature: f32,
    stop: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompletionResponse {
    content: String,
    #[serde(default)]
    tokens_predicted: u32,
    #[serde(default)]
    stop_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CompletionContext {
    pub shell: String,
    pub cwd: String,
    pub last_command: String,
    pub partial_input: String,
    pub shell_history: Vec<String>,
}

pub struct LLMEngine {
    server_process: Arc<Mutex<Option<Child>>>,
    server_url: String,
    model_path: String,
    enabled: bool,
}

impl LLMEngine {
    pub fn new() -> Self {
        Self {
            server_process: Arc::new(Mutex::new(None)),
            server_url: format!("http://{}:{}", LLM_SERVER_HOST, LLM_SERVER_PORT),
            model_path: String::new(),
            enabled: false,
        }
    }

    pub async fn start_server(&mut self, model_path: String) -> Result<(), String> {
        // Check if server is already running
        if self.is_server_healthy().await {
            println!("LLM server already running");
            self.enabled = true;
            self.model_path = model_path;
            return Ok(());
        }

        // Expand tilde in model path
        let expanded_path = if model_path.starts_with("~") {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/charlie".to_string());
            model_path.replacen("~", &home, 1)
        } else {
            model_path.clone()
        };

        // Verify model file exists
        if !std::path::Path::new(&expanded_path).exists() {
            return Err(format!("Model file not found: {}", expanded_path));
        }

        // Find llama-server binary in conda env
        let conda_bin = self.find_llama_server_binary()?;
        
        println!("Starting llama-server: {}", conda_bin);
        println!("Model path: {}", expanded_path);

        // Spawn llama-server process
        let child = Command::new(&conda_bin)
            .arg("--model")
            .arg(&expanded_path)
            .arg("--port")
            .arg(LLM_SERVER_PORT.to_string())
            .arg("--ctx-size")
            .arg(LLM_CONTEXT_SIZE.to_string())
            .arg("--n-predict")
            .arg(LLM_N_PREDICT.to_string())
            .arg("--temp")
            .arg(LLM_DEFAULT_TEMPERATURE.to_string())
            .arg("--threads")
            .arg(LLM_THREADS.to_string())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

        let pid = child.id();
        println!("llama-server started with PID: {}", pid);

        *self.server_process.lock().await = Some(child);
        self.model_path = expanded_path;

        // Wait for server to be ready (15 seconds timeout)
        println!("Waiting for server to be ready...");
        for i in 0..75 {
            tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;
            if self.is_server_healthy().await {
                println!("✅ LLM server ready after {}ms", i * 200);
                self.enabled = true;
                return Ok(());
            }
            if i % 5 == 0 {
                println!("Still waiting... ({}s)", i * 200 / 1000);
            }
        }

        Err("LLM server failed to start within 15 seconds. Check model file and llama-server logs.".to_string())
    }

    pub async fn stop_server(&mut self) -> Result<(), String> {
        let mut process = self.server_process.lock().await;
        if let Some(mut child) = process.take() {
            child.kill().map_err(|e| format!("Failed to kill server: {}", e))?;
            println!("LLM server stopped");
        }
        self.enabled = false;
        Ok(())
    }

    async fn is_server_healthy(&self) -> bool {
        let client = reqwest::Client::new();
        match client.get(format!("{}/health", self.server_url)).send().await {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        }
    }

    fn find_llama_server_binary(&self) -> Result<String, String> {
        // Try conda environment first
        let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/charlie".to_string());
        let conda_paths = vec![
            format!("{}/apps/miniforge/24.11.3-2/envs/aiterminal/bin/llama-server", home),
            format!("{}/miniforge3/envs/aiterminal/bin/llama-server", home),
            format!("{}/.conda/envs/aiterminal/bin/llama-server", home),
        ];

        for path in conda_paths {
            if std::path::Path::new(&path).exists() {
                return Ok(path);
            }
        }

        // Fallback to PATH
        if let Ok(output) = Command::new("which").arg("llama-server").output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(path);
                }
            }
        }

        Err("Could not find llama-server binary. Please ensure llama.cpp is installed in conda env 'aiterminal'".to_string())
    }

    pub async fn get_completions(&self, context: CompletionContext) -> Result<Vec<String>, String> {
        if !self.enabled {
            return Err("LLM not enabled".to_string());
        }

        let prompt = self.build_prompt(&context);
        let client = reqwest::Client::new();

        let request = CompletionRequest {
            prompt,
            n_predict: 30,
            temperature: LLM_DEFAULT_TEMPERATURE,
            stop: vec!["\n".to_string(), "###".to_string()],
        };

        let response = client
            .post(format!("{}/completion", self.server_url))
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("LLM request failed: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("LLM server error: {}", response.status()));
        }

        let result: CompletionResponse = response
            .json()
            .await
            .map_err(|e| format!("Failed to parse response: {}", e))?;

        // Parse suggestions from response
        self.parse_suggestions(&result.content, &context.partial_input)
    }

    fn build_prompt(&self, context: &CompletionContext) -> String {
        // Simpler prompt that just asks for completions
        format!(
            "Complete the shell command. Return ONLY the full completed command, one per line.\n\n\
             Input: {}\n\n\
             Completions:\n",
            context.partial_input
        )
    }

    fn parse_suggestions(&self, text: &str, partial_input: &str) -> Result<Vec<String>, String> {
        // Parse LLM output into individual suggestions
        let suggestions: Vec<String> = text
            .lines()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .filter(|s| !s.starts_with('#') && !s.starts_with("User") && !s.starts_with("Shell") && !s.starts_with("Input") && !s.starts_with("Complete"))
            .filter(|s| *s != "```" && !s.starts_with("```") && !s.contains("```")) // Filter markdown code blocks
            .map(|s| {
                // Remove markdown list markers like "- " or "* "
                let s = s.trim_start_matches("- ").trim_start_matches("* ");
                // Remove numbering like "1. ", "2. ", etc
                let s = s.trim_start_matches(|c: char| c.is_numeric() || c == '.' || c == ' ');
                s.trim().to_string()
            })
            .filter(|s| !s.is_empty() && s.len() >= partial_input.len()) // Must be at least as long as input
            .take(5)
            .collect();

        if suggestions.is_empty() {
            // Fallback: use raw text if parsing failed
            Ok(vec![text.trim().to_string()])
        } else {
            Ok(suggestions)
        }
    }
}

// Tauri commands

#[tauri::command]
pub async fn init_llm(
    model_path: String,
    state: State<'_, Arc<Mutex<LLMEngine>>>,
) -> Result<(), String> {
    let mut engine = state.lock().await;
    engine.start_server(model_path).await
}

#[tauri::command]
pub async fn stop_llm(state: State<'_, Arc<Mutex<LLMEngine>>>) -> Result<(), String> {
    let mut engine = state.lock().await;
    engine.stop_server().await
}

#[tauri::command]
pub async fn get_llm_completions(
    context: CompletionContext,
    state: State<'_, Arc<Mutex<LLMEngine>>>,
) -> Result<Vec<String>, String> {
    let engine = state.lock().await;
    engine.get_completions(context).await
}

#[tauri::command]
pub async fn llm_health_check(state: State<'_, Arc<Mutex<LLMEngine>>>) -> Result<bool, String> {
    let engine = state.lock().await;
    Ok(engine.is_server_healthy().await)
}

/// Optimized inline completion - returns single best suggestion quickly
#[tauri::command]
pub async fn get_llm_inline_completion(
    context: CompletionContext,
    state: State<'_, Arc<Mutex<LLMEngine>>>,
) -> Result<String, String> {
    let engine = state.lock().await;
    
    if !engine.enabled {
        return Err("LLM not enabled".to_string());
    }

    // Build prompt with examples showing spaces and context-aware completion
    let prompt = format!(
        "Complete the shell command. Provide ONLY the remaining characters needed.\n\n\
         Examples:\n\
         Input: e\n\
         Output: cho\n\n\
         Input: git\n\
         Output:  status\n\n\
         Input: git s\n\
         Output: tatus\n\n\
         Input: git c\n\
         Output: ommit\n\n\
         Input: cd D\n\
         Output: ownloads\n\n\
         Input: ls -\n\
         Output: la\n\n\
         Input: doc\n\
         Output: ker\n\n\
         Input: {}\n\
         Output:",
        context.partial_input
    );

    let client = reqwest::Client::new();

    let request = CompletionRequest {
        prompt,
        n_predict: 15,      // Reduced from 30
        temperature: LLM_FOCUSED_TEMPERATURE,   // More focused
        stop: vec!["\n".to_string()], // Stop at first newline
    };

    let response = client
        .post(format!("{}/completion", engine.server_url))
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("LLM request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("LLM server error: {}", response.status()));
    }

    let result: CompletionResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(result.content.trim().to_string())
}
