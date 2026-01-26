use crate::models::AppState;
use crate::security::path_validator::validate_path;
use crate::tools::safe_commands::SafeCommand;
// Removed unused imports: Deserialize, Serialize
// (We use #[derive(serde::Serialize)] directly instead)
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
pub struct FileInfo {
    pub path: String,
    pub size_bytes: u64,
    pub size_human: String,
    pub line_count: Option<usize>,
    pub is_text: bool,
    pub is_binary: bool,
    pub extension: Option<String>,
    pub file_type: String,
    pub last_modified: Option<String>,
}

#[tauri::command]
pub async fn get_file_info_tool(
    path: String,
    working_directory: Option<String>,
) -> Result<FileInfo, String> {
    // Resolve working directory
    let base_dir = working_directory
        .as_deref()
        .and_then(|wd| shellexpand::tilde(wd).parse::<std::path::PathBuf>().ok())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    // Resolve path relative to working directory
    let file_path = if Path::new(&path).is_absolute() {
        Path::new(&path).to_path_buf()
    } else {
        base_dir.join(&path)
    };

    // SECURITY: Validate path
    let safe_path = validate_path(&file_path)?;

    if !safe_path.exists() {
        return Err(format!("File does not exist: {}", safe_path.display()));
    }

    if !safe_path.is_file() {
        return Err(format!("Path is not a file: {}", safe_path.display()));
    }

    // Get file metadata
    let metadata =
        fs::metadata(&safe_path).map_err(|e| format!("Failed to read file metadata: {}", e))?;

    let size_bytes = metadata.len();
    
    // Human-readable size
    let size_human = if size_bytes < 1024 {
        format!("{} bytes", size_bytes)
    } else if size_bytes < 1024 * 1024 {
        format!("{:.1} KB", size_bytes as f64 / 1024.0)
    } else if size_bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", size_bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.1} GB", size_bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    };

    // Get extension
    let extension = safe_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_string());

    // Detect file type by extension
    let file_type = match extension.as_deref() {
        Some("rs") => "Rust",
        Some("ts") | Some("tsx") => "TypeScript",
        Some("js") | Some("jsx") => "JavaScript",
        Some("py") => "Python",
        Some("go") => "Go",
        Some("java") => "Java",
        Some("c") | Some("h") => "C",
        Some("cpp") | Some("cc") | Some("cxx") | Some("hpp") => "C++",
        Some("json") => "JSON",
        Some("yaml") | Some("yml") => "YAML",
        Some("toml") => "TOML",
        Some("xml") => "XML",
        Some("html") | Some("htm") => "HTML",
        Some("css") => "CSS",
        Some("md") | Some("markdown") => "Markdown",
        Some("txt") => "Text",
        Some("sh") | Some("bash") => "Shell",
        Some("sql") => "SQL",
        _ => "Unknown",
    }
    .to_string();

    // Get last modified time
    let last_modified = metadata
        .modified()
        .ok()
        .and_then(|time| {
            time.duration_since(std::time::UNIX_EPOCH)
                .ok()
                .map(|d| d.as_secs())
        })
        .map(|secs| {
            // Format as ISO 8601
            use std::time::UNIX_EPOCH;
            let datetime = UNIX_EPOCH + std::time::Duration::from_secs(secs);
            format!("{:?}", datetime)
        });

    // Try to detect if file is text or binary by reading first 8KB
    let sample_size = 8192.min(size_bytes as usize);
    let mut file = fs::File::open(&safe_path).map_err(|e| format!("Failed to open file: {}", e))?;
    
    use std::io::Read;
    let mut buffer = vec![0u8; sample_size];
    let bytes_read = file.read(&mut buffer).unwrap_or(0);
    buffer.truncate(bytes_read);

    let is_text = String::from_utf8(buffer.clone()).is_ok();
    let is_binary = !is_text;

    // Count lines if it's a text file and not too large
    let line_count = if is_text && size_bytes < 10 * 1024 * 1024 {
        // Only count lines for files under 10MB
        match fs::read_to_string(&safe_path) {
            Ok(content) => Some(content.lines().count()),
            Err(_) => None,
        }
    } else {
        None
    };

    Ok(FileInfo {
        path: safe_path.display().to_string(),
        size_bytes,
        size_human,
        line_count,
        is_text,
        is_binary,
        extension,
        file_type,
        last_modified,
    })
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

// Replace text in a file (search and replace)
#[tauri::command]
pub async fn replace_in_file_tool(
    path: String,
    search: String,
    replace: String,
    all: Option<bool>,
    working_directory: Option<String>,
) -> Result<String, String> {
    use std::fs;

    let full_path = if let Some(cwd) = working_directory {
        Path::new(&cwd).join(&path)
    } else {
        Path::new(&path).to_path_buf()
    };

    // SECURITY: Validate path to prevent traversal attacks
    let safe_path = validate_path(&full_path)?;

    if !safe_path.exists() {
        return Err(format!("File does not exist: {}", safe_path.display()));
    }

    if !safe_path.is_file() {
        return Err(format!("Path is not a file: {}", safe_path.display()));
    }

    // Read the file content
    let content = fs::read_to_string(&safe_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Perform replacement
    let replace_all = all.unwrap_or(false);
    let (new_content, count) = if replace_all {
        let count = content.matches(&search).count();
        (content.replace(&search, &replace), count)
    } else {
        // Replace only the first occurrence
        if let Some(pos) = content.find(&search) {
            let mut new_content = String::with_capacity(content.len());
            new_content.push_str(&content[..pos]);
            new_content.push_str(&replace);
            new_content.push_str(&content[pos + search.len()..]);
            (new_content, 1)
        } else {
            (content.clone(), 0)
        }
    };

    if count == 0 {
        return Err(format!("Search text not found: '{}'", search));
    }

    // Write back to file
    fs::write(&safe_path, new_content)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let occurrence_text = if count == 1 { "occurrence" } else { "occurrences" };
    Ok(format!(
        "Successfully replaced {} {} in {}",
        count,
        occurrence_text,
        safe_path.display()
    ))
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

// Read multiple files at once (with size limits per file)
#[tauri::command]
pub async fn read_multiple_files_tool(
    paths: Vec<String>,
    max_bytes_per_file: Option<usize>,
    working_directory: Option<String>,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("No paths provided".to_string());
    }

    if paths.len() > 20 {
        return Err("Too many files requested (max 20)".to_string());
    }

    let max_bytes = max_bytes_per_file.unwrap_or(50000);
    let base_dir = working_directory
        .as_deref()
        .and_then(|wd| shellexpand::tilde(wd).parse::<std::path::PathBuf>().ok())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let mut results = Vec::new();

    for path in paths {
        let file_path = if Path::new(&path).is_absolute() {
            Path::new(&path).to_path_buf()
        } else {
            base_dir.join(&path)
        };

        let safe_path = match validate_path(&file_path) {
            Ok(p) => p,
            Err(e) => {
                results.push(format!("=== {} ===\nError: {}\n", path, e));
                continue;
            }
        };

        if !safe_path.exists() {
            results.push(format!("=== {} ===\nError: File does not exist\n", path));
            continue;
        }

        if !safe_path.is_file() {
            results.push(format!("=== {} ===\nError: Not a file\n", path));
            continue;
        }

        // Read file with size limit
        match fs::metadata(&safe_path) {
            Ok(metadata) => {
                let file_size = metadata.len() as usize;
                let bytes_to_read = file_size.min(max_bytes);

                match fs::File::open(&safe_path) {
                    Ok(mut file) => {
                        use std::io::Read;
                        let mut buffer = vec![0u8; bytes_to_read];
                        
                        match file.read(&mut buffer) {
                            Ok(_) => {
                                match String::from_utf8(buffer) {
                                    Ok(content) => {
                                        let truncated = if file_size > max_bytes {
                                            format!(" (truncated from {} bytes)", file_size)
                                        } else {
                                            String::new()
                                        };
                                        results.push(format!("=== {}{} ===\n{}\n", path, truncated, content));
                                    }
                                    Err(_) => {
                                        results.push(format!("=== {} ===\nError: Binary file\n", path));
                                    }
                                }
                            }
                            Err(e) => {
                                results.push(format!("=== {} ===\nError reading: {}\n", path, e));
                            }
                        }
                    }
                    Err(e) => {
                        results.push(format!("=== {} ===\nError opening: {}\n", path, e));
                    }
                }
            }
            Err(e) => {
                results.push(format!("=== {} ===\nError getting metadata: {}\n", path, e));
            }
        }
    }

    Ok(results.join("\n"))
}

// Grep/search within files
#[tauri::command]
pub async fn grep_in_files_tool(
    pattern: String,
    paths: Vec<String>,
    case_sensitive: Option<bool>,
    working_directory: Option<String>,
) -> Result<String, String> {
    if paths.is_empty() {
        return Err("No paths provided".to_string());
    }

    if paths.len() > 50 {
        return Err("Too many files to search (max 50)".to_string());
    }

    let case_sensitive = case_sensitive.unwrap_or(false);
    let search_pattern = if case_sensitive {
        pattern.clone()
    } else {
        pattern.to_lowercase()
    };

    let base_dir = working_directory
        .as_deref()
        .and_then(|wd| shellexpand::tilde(wd).parse::<std::path::PathBuf>().ok())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());

    let mut results = Vec::new();
    let mut match_count = 0;

    for path in paths {
        let file_path = if Path::new(&path).is_absolute() {
            Path::new(&path).to_path_buf()
        } else {
            base_dir.join(&path)
        };

        let safe_path = match validate_path(&file_path) {
            Ok(p) => p,
            Err(_) => continue,
        };

        if !safe_path.is_file() {
            continue;
        }

        match fs::read_to_string(&safe_path) {
            Ok(content) => {
                let lines: Vec<&str> = content.lines().collect();
                let mut file_matches = Vec::new();

                for (line_num, line) in lines.iter().enumerate() {
                    let search_line = if case_sensitive {
                        line.to_string()
                    } else {
                        line.to_lowercase()
                    };

                    if search_line.contains(&search_pattern) {
                        file_matches.push(format!("  {}:{}: {}", path, line_num + 1, line));
                        match_count += 1;

                        if match_count >= 100 {
                            break;
                        }
                    }
                }

                if !file_matches.is_empty() {
                    results.push(format!("{}:\n{}", path, file_matches.join("\n")));
                }

                if match_count >= 100 {
                    results.push(format!("\n(Showing first 100 matches)"));
                    break;
                }
            }
            Err(_) => continue,
        }
    }

    if results.is_empty() {
        Ok(format!("No matches found for '{}'", pattern))
    } else {
        Ok(format!("{}\n\nTotal: {} matches", results.join("\n\n"), match_count))
    }
}

// Analyze error output - extract file paths, line numbers, and key information
#[tauri::command]
pub async fn analyze_error_tool(
    error_text: String,
    working_directory: Option<String>,
) -> Result<String, String> {
    let mut analysis = Vec::new();
    
    // Extract file paths with line numbers (common formats: file.rs:10, file.js:10:5, etc.)
    let file_line_regex = regex::Regex::new(r"([/\w\-_.]+\.\w+):(\d+)(?::(\d+))?")
        .map_err(|e| format!("Regex error: {}", e))?;
    
    let mut mentioned_files = std::collections::HashSet::new();
    let mut line_references = Vec::new();

    for cap in file_line_regex.captures_iter(&error_text) {
        if let Some(file) = cap.get(1) {
            let file_str = file.as_str();
            mentioned_files.insert(file_str.to_string());
            
            if let Some(line) = cap.get(2) {
                let col = cap.get(3).map(|c| c.as_str()).unwrap_or("");
                let col_str = if !col.is_empty() {
                    format!(":{}", col)
                } else {
                    String::new()
                };
                line_references.push(format!("{}:{}{}", file_str, line.as_str(), col_str));
            }
        }
    }

    // Extract error types (common patterns)
    let error_patterns = [
        (r"(?i)(error|panic|exception|fatal):\s*(.+)", "Error Type"),
        (r"(?i)(warning):\s*(.+)", "Warning"),
        (r"(?i)expected\s+(.+?)\s+found\s+(.+)", "Type Mismatch"),
        (r"(?i)(cannot\s+find|undefined|not\s+found):\s*(.+)", "Not Found"),
        (r"(?i)(permission\s+denied|access\s+denied)", "Permission Issue"),
    ];

    let mut error_types = Vec::new();
    for (pattern, label) in error_patterns.iter() {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(cap) = re.captures(&error_text) {
                if let Some(msg) = cap.get(0) {
                    error_types.push(format!("{}: {}", label, msg.as_str()));
                }
            }
        }
    }

    // Build analysis output
    analysis.push("=== ERROR ANALYSIS ===\n".to_string());

    if !error_types.is_empty() {
        analysis.push("ERROR TYPES DETECTED:".to_string());
        for et in error_types.iter().take(5) {
            analysis.push(format!("  • {}", et));
        }
        analysis.push(String::new());
    }

    if !line_references.is_empty() {
        analysis.push("FILE LOCATIONS:".to_string());
        for loc in line_references.iter().take(10) {
            analysis.push(format!("  • {}", loc));
        }
        analysis.push(String::new());
    }

    if !mentioned_files.is_empty() {
        analysis.push("FILES MENTIONED:".to_string());
        for file in mentioned_files.iter().take(10) {
            // Check if file exists
            let base_dir = working_directory
                .as_deref()
                .and_then(|wd| shellexpand::tilde(wd).parse::<std::path::PathBuf>().ok())
                .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
            
            let file_path = if Path::new(file).is_absolute() {
                Path::new(file).to_path_buf()
            } else {
                base_dir.join(file)
            };

            let exists = file_path.exists();
            let status = if exists { "✓" } else { "✗" };
            analysis.push(format!("  {} {}", status, file));
        }
        analysis.push(String::new());
    }

    // Extract stack trace lines
    let stack_trace_regex = regex::Regex::new(r"(?m)^\s*(?:at|in)\s+(.+)")
        .map_err(|e| format!("Regex error: {}", e))?;
    
    let mut stack_lines = Vec::new();
    for cap in stack_trace_regex.captures_iter(&error_text) {
        if let Some(line) = cap.get(1) {
            stack_lines.push(line.as_str().to_string());
        }
    }

    if !stack_lines.is_empty() {
        analysis.push("STACK TRACE:".to_string());
        for line in stack_lines.iter().take(10) {
            analysis.push(format!("  • {}", line));
        }
        analysis.push(String::new());
    }

    // Suggest search queries
    if !error_types.is_empty() {
        analysis.push("SUGGESTED SEARCHES:".to_string());
        for et in error_types.iter().take(3) {
            analysis.push(format!("  • \"{}\"", et));
        }
    }

    if analysis.len() == 1 {
        Ok("No structured error information found in the text.".to_string())
    } else {
        Ok(analysis.join("\n"))
    }
}
