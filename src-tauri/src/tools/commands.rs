use crate::models::AppState;
use crate::security::path_validator::validate_path;
use crate::tools::safe_commands::SafeCommand;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use walkdir::WalkDir;

// Re-export CommandResult from safe_commands to avoid duplication
pub use crate::tools::safe_commands::CommandResult;

#[tauri::command]
pub async fn execute_tool_command(
    command: String,
    working_directory: Option<String>,
) -> Result<CommandResult, String> {
    // NEW: Parse command into safe command structure (no shell execution)
    let safe_cmd = SafeCommand::from_string(&command)?;
    
    // Execute without shell
    let cwd = working_directory.as_ref().map(|s| Path::new(s));
    safe_cmd.execute(cwd)
}

#[tauri::command]
pub async fn read_file_tool(path: String, max_bytes: usize) -> Result<String, String> {
    // SECURITY: Validate path to prevent traversal attacks
    let safe_path = validate_path(Path::new(&path))?;

    if !safe_path.exists() {
        return Err(format!("File does not exist: {}", safe_path.display()));
    }

    if !safe_path.is_file() {
        return Err(format!("Path is not a file: {}", safe_path.display()));
    }

    // Read file with size limit
    let metadata =
        fs::metadata(&safe_path).map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let file_size = metadata.len() as usize;
    let bytes_to_read = file_size.min(max_bytes);

    let mut file = fs::File::open(&safe_path).map_err(|e| format!("Failed to open file: {}", e))?;

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

#[derive(serde::Serialize)]
pub struct DirectoryListing {
    pub files: Vec<String>,
    pub directories: Vec<String>,
    pub total_count: usize,
}

#[tauri::command]
pub async fn list_directory_tool(
    path: Option<String>,
    show_hidden: Option<bool>,
) -> Result<DirectoryListing, String> {
    let dir_path = path.as_deref().unwrap_or(".");
    let path = Path::new(dir_path);
    let show_hidden = show_hidden.unwrap_or(false);

    if !path.exists() {
        return Err(format!("Directory does not exist: {}", path.display()));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", path.display()));
    }

    let entries = fs::read_dir(path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();
    let mut directories = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        // Skip hidden files unless requested
        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        if metadata.is_dir() {
            directories.push(name.to_string());
        } else {
            files.push(name.to_string());
        }
    }

    files.sort();
    directories.sort();
    let total_count = files.len() + directories.len();

    Ok(DirectoryListing {
        files,
        directories,
        total_count,
    })
}

#[tauri::command]
pub async fn search_files_tool(pattern: String, max_results: usize) -> Result<Vec<String>, String> {
    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

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
            !name.starts_with('.') && name != "node_modules" && name != "target" && name != ".git"
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
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

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
    terminal_id: Option<u32>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    if let Some(id) = terminal_id {
        return crate::pty::get_pty_cwd(id, state);
    }

    let cwd =
        std::env::current_dir().map_err(|e| format!("Failed to get current directory: {}", e))?;

    Ok(cwd.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_env_var_tool(variable: String) -> Result<Option<String>, String> {
    Ok(std::env::var(&variable).ok())
}

// Write content to a file (create or overwrite)
#[tauri::command]
pub async fn write_file_tool(
    path: String,
    content: String,
    working_directory: Option<String>,
) -> Result<String, String> {
    use std::fs;
    use std::io::Write;

    let full_path = if let Some(cwd) = working_directory {
        Path::new(&cwd).join(&path)
    } else {
        Path::new(&path).to_path_buf()
    };

    // SECURITY: Validate path to prevent traversal attacks
    let safe_path = validate_path(&full_path)?;

    if let Some(parent) = safe_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    let mut file =
        fs::File::create(&safe_path).map_err(|e| format!("Failed to open file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(format!("Successfully wrote to {}", safe_path.display()))
}

// Append content to a file
#[tauri::command]
pub async fn append_to_file_tool(
    path: String,
    content: String,
    working_directory: Option<String>,
) -> Result<String, String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let full_path = if let Some(cwd) = working_directory {
        Path::new(&cwd).join(&path)
    } else {
        Path::new(&path).to_path_buf()
    };

    // SECURITY: Validate path to prevent traversal attacks
    let safe_path = validate_path(&full_path)?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&safe_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to file: {}", e))?;

    Ok(format!("Successfully appended to {}", safe_path.display()))
}

// Get git status
#[tauri::command]
pub async fn git_status_tool(working_directory: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["status", "--porcelain", "--branch"]);

    if let Some(cwd) = working_directory {
        cmd.current_dir(&cwd);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if !output.status.success() {
        return Err("Not a git repository or git not installed".to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

// Find running processes
#[tauri::command]
pub async fn find_process_tool(pattern: String) -> Result<String, String> {
    let cmd = if cfg!(target_os = "windows") {
        Command::new("tasklist").output()
    } else {
        Command::new("ps").args(["aux"]).output()
    };

    let output = cmd.map_err(|e| format!("Failed to execute ps: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    let matches: Vec<&str> = stdout
        .lines()
        .filter(|line| line.to_lowercase().contains(&pattern.to_lowercase()))
        .collect();

    if matches.is_empty() {
        Ok(format!("No processes found matching '{}'", pattern))
    } else {
        Ok(matches.join("\n"))
    }
}

// Check if a port is in use
#[tauri::command]
pub async fn check_port_tool(port: u16) -> Result<String, String> {
    let cmd = if cfg!(target_os = "windows") {
        Command::new("netstat").args(["-ano"]).output()
    } else {
        Command::new("lsof")
            .args(["-i", &format!(":{}", port)])
            .output()
    };

    let output = cmd.map_err(|e| format!("Failed to check port: {}", e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);

    if stdout.trim().is_empty() {
        Ok(format!("Port {} is available", port))
    } else {
        Ok(format!("Port {} is in use:\n{}", port, stdout))
    }
}

// Get system information
#[tauri::command]
pub async fn get_system_info_tool() -> Result<String, String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let family = std::env::consts::FAMILY;

    // Get available disk space
    let disk_info = if cfg!(target_os = "windows") {
        Command::new("wmic")
            .args(["logicaldisk", "get", "size,freespace,caption"])
            .output()
            .ok()
    } else {
        Command::new("df").args(["-h", "/"]).output().ok()
    };

    let mut info = format!("OS: {}\nArchitecture: {}\nFamily: {}\n", os, arch, family);

    if let Some(output) = disk_info {
        info.push_str("\nDisk Space:\n");
        info.push_str(&String::from_utf8_lossy(&output.stdout));
    }

    Ok(info)
}

// Read last N lines of a file (tail)
#[tauri::command]
pub async fn tail_file_tool(
    path: String,
    lines: usize,
    working_directory: Option<String>,
) -> Result<String, String> {
    let full_path = if let Some(cwd) = working_directory {
        Path::new(&cwd).join(&path)
    } else {
        Path::new(&path).to_path_buf()
    };

    // SECURITY: Validate path to prevent traversal attacks
    let safe_path = validate_path(&full_path)?;

    let content =
        fs::read_to_string(&safe_path).map_err(|e| format!("Failed to read file: {}", e))?;

    let all_lines: Vec<&str> = content.lines().collect();
    let start = all_lines.len().saturating_sub(lines);
    let tail_lines = &all_lines[start..];

    Ok(tail_lines.join("\n"))
}

// Create a directory
// Uses filesystem directly for safety (no shell execution)
#[tauri::command]
pub async fn make_directory_tool(
    path: String,
    working_directory: Option<String>,
) -> Result<String, String> {
    // Determine base directory
    let base_dir = if let Some(cwd) = working_directory.as_ref() {
        Path::new(cwd)
    } else {
        Path::new(".")
    };
    
    // Construct full path
    let full_path = if Path::new(&path).is_absolute() {
        Path::new(&path).to_path_buf()
    } else {
        base_dir.join(&path)
    };
    
    // Create directory with parents (equivalent to mkdir -p)
    fs::create_dir_all(&full_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;
    
    Ok(format!("Successfully created directory: {}", path))
}

// Get git diff
#[tauri::command]
pub async fn get_git_diff_tool(working_directory: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["diff"]);

    if let Some(cwd) = working_directory {
        cmd.current_dir(&cwd);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if !output.status.success() {
        return Err("Not a git repository or git not installed".to_string());
    }

    let diff = String::from_utf8_lossy(&output.stdout).to_string();

    if diff.trim().is_empty() {
        Ok("No uncommitted changes".to_string())
    } else {
        Ok(diff)
    }
}

// Calculate math expression
#[tauri::command]
pub async fn calculate_tool(expression: String) -> Result<String, String> {
    // Validate that expression only contains safe characters
    // Allowed: digits, operators, parentheses, decimal points, spaces, and basic math functions
    let safe_chars_regex = regex::Regex::new(r"^[0-9+\-*/().\s]+$")
        .map_err(|e| format!("Regex error: {}", e))?;
    
    if !safe_chars_regex.is_match(&expression) {
        return Err(
            "Invalid expression: only numbers and basic operators (+, -, *, /, parentheses) are allowed".to_string()
        );
    }
    
    // Additional check for dangerous patterns
    if expression.contains("..") || expression.is_empty() {
        return Err("Invalid expression format".to_string());
    }
    
    // Execute using bc/PowerShell with validated input
    let output = if cfg!(target_os = "windows") {
        Command::new("powershell")
            .args(["-Command", &expression])
            .output()
    } else {
        // Use echo with the expression piped to bc
        // Note: expression is already validated to contain only safe chars
        Command::new("sh")
            .arg("-c")
            .arg(format!("echo '{}' | bc -l", expression))
            .output()
    };

    let result = output.map_err(|e| format!("Failed to calculate: {}", e))?;

    if result.status.success() {
        let output = String::from_utf8_lossy(&result.stdout).trim().to_string();
        if output.is_empty() {
            Err("Calculation produced no output (invalid expression?)".to_string())
        } else {
            Ok(output)
        }
    } else {
        Err(format!(
            "Invalid expression: {}",
            String::from_utf8_lossy(&result.stderr)
        ))
    }
}

// Web search (returns curl command suggestion)
#[tauri::command]
pub async fn web_search_tool(query: String) -> Result<String, String> {
    // Rather than actually web scraping, return a suggestion
    let encoded_query = query.replace(' ', "+");
    Ok(format!(
        "To search the web, you can:\n\
        1. Open browser: https://www.google.com/search?q={}\n\
        2. Use curl: curl -s 'https://www.google.com/search?q={}'\n\
        3. Ask the user to check documentation\n\n\
        Note: This terminal cannot directly browse the web. Consider asking the user to search for: '{}'",
        encoded_query, encoded_query, query
    ))
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
