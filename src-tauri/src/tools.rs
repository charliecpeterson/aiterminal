use serde::{Deserialize, Serialize};
use std::process::Command;
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[tauri::command]
pub async fn execute_tool_command(command: String, working_directory: Option<String>) -> Result<CommandResult, String> {
    // Parse command and execute via shell with optional working directory
    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = Command::new("cmd");
        c.args(["/C", &command]);
        c
    } else {
        let mut c = Command::new("sh");
        c.arg("-c");
        c.arg(&command);
        c
    };

    // Set working directory if provided
    if let Some(cwd) = working_directory {
        println!("🔧 Setting working directory to: {}", cwd);
        cmd.current_dir(&cwd);
    }

    let output = cmd.output();

    match output {
        Ok(output) => {
            Ok(CommandResult {
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                exit_code: output.status.code().unwrap_or(-1),
            })
        }
        Err(e) => Err(format!("Failed to execute command: {}", e)),
    }
}

#[tauri::command]
pub async fn read_file_tool(path: String, max_bytes: usize) -> Result<String, String> {
    let path = Path::new(&path);
    
    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()));
    }
    
    if !path.is_file() {
        return Err(format!("Path is not a file: {}", path.display()));
    }
    
    // Read file with size limit
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    
    let file_size = metadata.len() as usize;
    let bytes_to_read = file_size.min(max_bytes);
    
    let mut file = fs::File::open(path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    use std::io::Read;
    let mut buffer = vec![0u8; bytes_to_read];
    file.read_exact(&mut buffer)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Try to convert to UTF-8
    match String::from_utf8(buffer) {
        Ok(content) => Ok(content),
        Err(_) => Err("File contains invalid UTF-8 (binary file?)".to_string()),
    }
}

#[tauri::command]
pub async fn list_directory_tool(
    path: Option<String>,
    show_hidden: bool,
) -> Result<Vec<String>, String> {
    let dir_path = path.as_deref().unwrap_or(".");
    let path = Path::new(dir_path);
    
    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }
    
    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }
    
    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    let mut result = Vec::new();
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();
        
        // Skip hidden files unless requested
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        
        let metadata = entry.metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;
        
        let prefix = if metadata.is_dir() { "📁 " } else { "📄 " };
        result.push(format!("{}{}", prefix, name));
    }
    
    result.sort();
    Ok(result)
}

#[tauri::command]
pub async fn search_files_tool(
    pattern: String,
    max_results: usize,
) -> Result<Vec<String>, String> {
    let current_dir = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    
    // Use glob pattern matching
    let _glob_pattern = if pattern.contains('*') || pattern.contains('?') {
        pattern.clone()
    } else {
        format!("**/{}", pattern)
    };
    
    let mut results = Vec::new();
    let walker = WalkDir::new(&current_dir)
        .max_depth(10) // Limit depth to avoid huge scans
        .into_iter()
        .filter_entry(|e| {
            // Skip hidden directories and common ignore patterns
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.')
                && name != "node_modules"
                && name != "target"
                && name != ".git"
        });
    
    for entry in walker {
        if results.len() >= max_results {
            break;
        }
        
        let entry = entry.ok();
        if entry.is_none() {
            continue;
        }
        let entry = entry.unwrap();
        
        if !entry.file_type().is_file() {
            continue;
        }
        
        let path = entry.path();
        let file_name = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("");
        
        // Simple pattern matching
        if matches_pattern(file_name, &pattern) {
            if let Ok(relative) = path.strip_prefix(&current_dir) {
                results.push(relative.to_string_lossy().to_string());
            } else {
                results.push(path.to_string_lossy().to_string());
            }
        }
    }
    
    Ok(results)
}

#[tauri::command]
pub async fn get_current_directory_tool(
    _terminal_id: Option<u32>,
) -> Result<String, String> {
    // TODO: If terminal_id is provided, get the actual terminal's PWD
    // For now, this returns the backend process's cwd, which is usually the project root
    // The AI should be instructed to provide explicit paths instead of relying on "."
    let cwd = std::env::current_dir()
        .map_err(|e| format!("Failed to get current directory: {}", e))?;
    
    Ok(cwd.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_env_var_tool(variable: String) -> Result<Option<String>, String> {
    Ok(std::env::var(&variable).ok())
}

// Simple pattern matching helper
fn matches_pattern(text: &str, pattern: &str) -> bool {
    if pattern.contains('*') {
        // Simple glob matching
        let parts: Vec<&str> = pattern.split('*').collect();
        if parts.is_empty() {
            return true;
        }
        
        let mut pos = 0;
        for (i, part) in parts.iter().enumerate() {
            if part.is_empty() {
                continue;
            }
            
            if i == 0 && !text.starts_with(part) {
                return false;
            }
            
            if i == parts.len() - 1 && !text.ends_with(part) {
                return false;
            }
            
            if let Some(found_pos) = text[pos..].find(part) {
                pos += found_pos + part.len();
            } else {
                return false;
            }
        }
        true
    } else {
        text.contains(pattern)
    }
}
