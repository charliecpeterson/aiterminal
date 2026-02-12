use crate::models::AppState;
use crate::security::path_validator::{validate_path, validate_path_for_write};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use walkdir::WalkDir;

const GIT_NOT_FOUND_ERR: &str = "Not a git repository or git not installed";

/// Resolve working_directory to a PathBuf, with tilde expansion.
/// Falls back to the current directory if not provided.
fn resolve_base_dir(working_directory: &Option<String>) -> PathBuf {
    working_directory
        .as_deref()
        .and_then(|wd| shellexpand::tilde(wd).parse::<PathBuf>().ok())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

/// Resolve a path relative to an optional working directory.
/// If the path is absolute, returns it as-is; otherwise joins with cwd.
fn resolve_path(path: &str, working_directory: &Option<String>) -> PathBuf {
    if Path::new(path).is_absolute() {
        PathBuf::from(path)
    } else if let Some(ref cwd) = working_directory {
        Path::new(cwd).join(path)
    } else {
        PathBuf::from(path)
    }
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
    let base_dir = resolve_base_dir(&working_directory);

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
    
    let size_human = format_file_size(size_bytes);

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
        .map(|time| {
            let datetime: chrono::DateTime<chrono::Local> = time.into();
            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
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
    working_directory: Option<String>,
) -> Result<DirectoryListing, String> {
    let dir_path = path.as_deref().unwrap_or(".");
    let base_dir = resolve_base_dir(&working_directory);

    let full_path = if Path::new(dir_path).is_absolute() {
        Path::new(dir_path).to_path_buf()
    } else {
        base_dir.join(dir_path)
    };

    // SECURITY: Validate path to prevent directory traversal
    let safe_path = validate_path(&full_path)?;
    let show_hidden = show_hidden.unwrap_or(false);

    if !safe_path.exists() {
        return Err(format!("Directory does not exist: {}", safe_path.display()));
    }

    if !safe_path.is_dir() {
        return Err(format!("Path is not a directory: {}", safe_path.display()));
    }

    let entries = fs::read_dir(&safe_path).map_err(|e| format!("Failed to read directory: {}", e))?;

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
pub async fn search_files_tool(
    pattern: String,
    max_results: usize,
    working_directory: Option<String>,
) -> Result<Vec<String>, String> {
    let base_dir = resolve_base_dir(&working_directory);

    // SECURITY: Validate the search root directory
    let safe_dir = validate_path(&base_dir)?;

    let max_results = max_results.min(500);

    let mut results = Vec::new();
    let walker = WalkDir::new(&safe_dir)
        .max_depth(10)
        .into_iter()
        .filter_entry(|e| {
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.') && name != "node_modules" && name != "target"
        });

    for entry in walker {
        if results.len() >= max_results {
            break;
        }

        let Some(entry) = entry.ok() else {
            continue;
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

        if matches_pattern(file_name, &pattern) {
            if let Ok(relative) = path.strip_prefix(&safe_dir) {
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

/// Environment variable names that should not be exposed to the AI.
/// These commonly contain secrets, API keys, or credentials.
const SENSITIVE_ENV_VARS: &[&str] = &[
    // API keys and tokens
    "API_KEY",
    "SECRET_KEY",
    "ACCESS_TOKEN",
    "REFRESH_TOKEN",
    "AUTH_TOKEN",
    "BEARER_TOKEN",
    "JWT_SECRET",
    // AWS
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    // Cloud providers
    "AZURE_CLIENT_SECRET",
    "GCP_SERVICE_ACCOUNT_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    // Database
    "DATABASE_URL",
    "DATABASE_PASSWORD",
    "DB_PASSWORD",
    "MONGO_URI",
    "REDIS_URL",
    "REDIS_PASSWORD",
    // General secrets
    "PASSWORD",
    "PASSWD",
    "SECRET",
    "PRIVATE_KEY",
    "ENCRYPTION_KEY",
    // CI/CD
    "GITHUB_TOKEN",
    "GITLAB_TOKEN",
    "NPM_TOKEN",
    "DOCKER_PASSWORD",
    // Misc
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "SENDGRID_API_KEY",
    "STRIPE_SECRET_KEY",
    "TWILIO_AUTH_TOKEN",
];

/// Check if an environment variable name matches any sensitive pattern.
fn is_sensitive_env_var(name: &str) -> bool {
    let upper = name.to_uppercase();

    // Check exact matches
    for sensitive in SENSITIVE_ENV_VARS {
        if upper == *sensitive {
            return true;
        }
    }

    // Check suffix patterns (catches variants like MY_API_KEY, APP_SECRET_KEY, etc.)
    let sensitive_suffixes = [
        "_API_KEY", "_SECRET_KEY", "_SECRET", "_PASSWORD", "_TOKEN",
        "_PRIVATE_KEY", "_ACCESS_KEY", "_AUTH_TOKEN",
    ];
    for suffix in &sensitive_suffixes {
        if upper.ends_with(suffix) {
            return true;
        }
    }

    false
}

#[tauri::command]
pub async fn get_env_var_tool(variable: String) -> Result<Option<String>, String> {
    if is_sensitive_env_var(&variable) {
        return Err(format!(
            "Access denied: '{}' may contain sensitive credentials and cannot be read",
            variable
        ));
    }
    Ok(std::env::var(&variable).ok())
}

// Write content to a file (create or overwrite)
pub(crate) async fn write_file_impl(
    path: String,
    content: String,
    working_directory: Option<String>,
    state: &AppState,
) -> Result<String, String> {
    use std::fs;
    use std::io::Write;

    let full_path = resolve_path(&path, &working_directory);

    // SECURITY: Validate path for write (prevents traversal + blocks sensitive files)
    let safe_path = validate_path_for_write(&full_path)?;

    // Create backup before modifying (if file exists)
    if safe_path.exists() {
        if let Err(e) = create_file_backup(state, &safe_path) {
            eprintln!("[Backup] Failed to backup {}: {}", safe_path.display(), e);
        }
    }

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

#[tauri::command]
pub async fn write_file_tool(
    path: String,
    content: String,
    working_directory: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    write_file_impl(path, content, working_directory, &state).await
}

// Append content to a file
pub(crate) async fn append_to_file_impl(
    path: String,
    content: String,
    working_directory: Option<String>,
    state: &AppState,
) -> Result<String, String> {
    use std::fs::OpenOptions;
    use std::io::Write;

    let full_path = resolve_path(&path, &working_directory);

    // SECURITY: Validate path for write (prevents traversal + blocks sensitive files)
    let safe_path = validate_path_for_write(&full_path)?;

    // Create backup before modifying (if file exists)
    if safe_path.exists() {
        if let Err(e) = create_file_backup(state, &safe_path) {
            eprintln!("[Backup] Failed to backup {}: {}", safe_path.display(), e);
        }
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&safe_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;

    file.write_all(content.as_bytes())
        .map_err(|e| format!("Failed to append to file: {}", e))?;

    Ok(format!("Successfully appended to {}", safe_path.display()))
}

#[tauri::command]
pub async fn append_to_file_tool(
    path: String,
    content: String,
    working_directory: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    append_to_file_impl(path, content, working_directory, &state).await
}

// Replace text in a file (search and replace)
#[tauri::command]
pub async fn replace_in_file_tool(
    path: String,
    search: String,
    replace: String,
    all: Option<bool>,
    working_directory: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    use std::fs;

    let full_path = resolve_path(&path, &working_directory);

    // SECURITY: Validate path for write (prevents traversal + blocks sensitive files)
    let safe_path = validate_path_for_write(&full_path)?;

    if !safe_path.exists() {
        return Err(format!("File does not exist: {}", safe_path.display()));
    }

    if !safe_path.is_file() {
        return Err(format!("Path is not a file: {}", safe_path.display()));
    }

    // Create backup before modifying
    if let Err(e) = create_file_backup(&state, &safe_path) {
        eprintln!("[Backup] Failed to backup {}: {}", safe_path.display(), e);
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
        let cwd_path = Path::new(&cwd);
        if !cwd_path.is_dir() {
            return Err(format!("Working directory does not exist: {}", cwd));
        }
        let safe_cwd = validate_path(cwd_path)?;
        cmd.current_dir(&safe_cwd);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if !output.status.success() {
        return Err(GIT_NOT_FOUND_ERR.to_string());
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
    let full_path = resolve_path(&path, &working_directory);

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

    // Validate path to prevent directory traversal
    let safe_path = validate_path(&full_path)?;

    // Create directory with parents (equivalent to mkdir -p)
    fs::create_dir_all(&safe_path)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    Ok(format!("Successfully created directory: {}", safe_path.display()))
}

// Get git diff
#[tauri::command]
pub async fn get_git_diff_tool(working_directory: Option<String>) -> Result<String, String> {
    let mut cmd = Command::new("git");
    cmd.args(["diff"]);

    if let Some(cwd) = working_directory {
        let cwd_path = Path::new(&cwd);
        if !cwd_path.is_dir() {
            return Err(format!("Working directory does not exist: {}", cwd));
        }
        let safe_cwd = validate_path(cwd_path)?;
        cmd.current_dir(&safe_cwd);
    }

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;

    if !output.status.success() {
        return Err(GIT_NOT_FOUND_ERR.to_string());
    }

    let diff = String::from_utf8_lossy(&output.stdout);

    if diff.trim().is_empty() {
        return Ok("No uncommitted changes".to_string());
    }

    const MAX_DIFF_BYTES: usize = 100 * 1024; // 100KB
    if diff.len() > MAX_DIFF_BYTES {
        Ok(format!(
            "{}\n\n... [diff truncated: {} total bytes, showing first 100KB]",
            &diff[..MAX_DIFF_BYTES],
            diff.len()
        ))
    } else {
        Ok(diff.into_owned())
    }
}

/// Git branch info for status bar
#[derive(serde::Serialize)]
pub struct GitBranchInfo {
    pub branch: Option<String>,
    pub is_git_repo: bool,
    pub has_changes: bool,
    pub ahead: u32,
    pub behind: u32,
}

// Get git branch info (lightweight, for status bar)
#[tauri::command]
pub async fn get_git_branch_tool(working_directory: Option<String>) -> Result<GitBranchInfo, String> {
    let mut cmd = Command::new("git");
    cmd.args(["status", "--porcelain=v1", "--branch"]);

    if let Some(cwd) = &working_directory {
        let cwd_path = Path::new(cwd);
        if !cwd_path.is_dir() {
            return Err(format!("Working directory does not exist: {}", cwd));
        }
        let safe_cwd = validate_path(cwd_path)?;
        cmd.current_dir(&safe_cwd);
    }
    
    let output = cmd.output();
    
    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<&str> = stdout.lines().collect();
            
            // First line is branch info: ## branch...origin/branch [ahead N, behind M]
            let branch_line = lines.first().unwrap_or(&"");
            
            let mut branch = None;
            let mut ahead = 0u32;
            let mut behind = 0u32;
            
            if branch_line.starts_with("## ") {
                let info = &branch_line[3..]; // Remove "## "
                
                // Parse branch name (before "..." or end of string)
                let branch_name = if let Some(dot_pos) = info.find("...") {
                    &info[..dot_pos]
                } else if let Some(space_pos) = info.find(' ') {
                    &info[..space_pos]
                } else {
                    info
                };
                
                if !branch_name.is_empty() && branch_name != "HEAD (no branch)" {
                    branch = Some(branch_name.to_string());
                }
                
                // Parse ahead/behind
                if let Some(bracket_start) = info.find('[') {
                    if let Some(bracket_end) = info.find(']') {
                        let tracking = &info[bracket_start+1..bracket_end];
                        for part in tracking.split(", ") {
                            if part.starts_with("ahead ") {
                                ahead = part[6..].parse().unwrap_or(0);
                            } else if part.starts_with("behind ") {
                                behind = part[7..].parse().unwrap_or(0);
                            }
                        }
                    }
                }
            }
            
            // Check if there are any changes (lines after the branch line)
            let has_changes = lines.len() > 1 && lines.iter().skip(1).any(|l| !l.is_empty());
            
            Ok(GitBranchInfo {
                branch,
                is_git_repo: true,
                has_changes,
                ahead,
                behind,
            })
        }
        _ => {
            // Not a git repo or git not available
            Ok(GitBranchInfo {
                branch: None,
                is_git_repo: false,
                has_changes: false,
                ahead: 0,
                behind: 0,
            })
        }
    }
}

// Calculate math expression using pure Rust (no shell execution)
#[tauri::command]
pub async fn calculate_tool(expression: String) -> Result<String, String> {
    if expression.trim().is_empty() {
        return Err("Empty expression".to_string());
    }

    let result: f64 = meval::eval_str(&expression)
        .map_err(|e| format!("Invalid expression: {}", e))?;

    // Format nicely: avoid trailing .0 for integers
    if result.fract() == 0.0 && result.abs() < 1e15 {
        Ok(format!("{}", result as i64))
    } else {
        Ok(format!("{}", result))
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
    let base_dir = resolve_base_dir(&working_directory);

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
                            Ok(bytes_read) => {
                                buffer.truncate(bytes_read);
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

    let base_dir = resolve_base_dir(&working_directory);

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
                    let matched = if case_sensitive {
                        line.contains(search_pattern.as_str())
                    } else {
                        line.to_lowercase().contains(&search_pattern)
                    };

                    if matched {
                        file_matches.push(format!("  {}:{}: {}", safe_path.display(), line_num + 1, line));
                        match_count += 1;

                        if match_count >= 100 {
                            break;
                        }
                    }
                }

                if !file_matches.is_empty() {
                    results.push(format!("{}:\n{}", safe_path.display(), file_matches.join("\n")));
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
            let base_dir = resolve_base_dir(&working_directory);
            
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

/// Get shell command history from the user's shell history file
/// Supports bash, zsh, and fish shells
#[tauri::command]
pub async fn get_shell_history_tool(
    count: Option<usize>,
    shell: Option<String>,
    filter: Option<String>,
) -> Result<String, String> {
    use std::io::{BufRead, BufReader};
    
    let max_count = count.unwrap_or(50).min(500); // Cap at 500 entries
    
    // Determine shell type and history file
    let home = std::env::var("HOME").map_err(|_| "Could not determine home directory")?;
    
    // Auto-detect shell if not specified
    let detected_shell = shell.unwrap_or_else(|| {
        std::env::var("SHELL")
            .unwrap_or_default()
            .rsplit('/')
            .next()
            .unwrap_or("bash")
            .to_string()
    });
    
    let history_path = match detected_shell.as_str() {
        "zsh" => format!("{}/.zsh_history", home),
        "fish" => format!("{}/.local/share/fish/fish_history", home),
        "bash" | _ => format!("{}/.bash_history", home),
    };
    
    let path = Path::new(&history_path);
    if !path.exists() {
        return Err(format!(
            "History file not found: {}. Shell detected: {}",
            history_path, detected_shell
        ));
    }
    
    let file = fs::File::open(path)
        .map_err(|e| format!("Failed to open history file: {}", e))?;
    let reader = BufReader::new(file);
    
    let mut commands: Vec<String> = Vec::new();
    let filter_lower = filter.as_ref().map(|f| f.to_lowercase());
    
    // Parse history based on shell type
    match detected_shell.as_str() {
        "zsh" => {
            // zsh history format: ": timestamp:0;command" or just "command"
            for line in reader.lines().flatten() {
                let cmd = if line.starts_with(':') {
                    // Extended history format
                    line.split(';').skip(1).collect::<Vec<_>>().join(";")
                } else {
                    line.clone()
                };
                
                if !cmd.is_empty() {
                    if let Some(ref f) = filter_lower {
                        if cmd.to_lowercase().contains(f) {
                            commands.push(cmd);
                        }
                    } else {
                        commands.push(cmd);
                    }
                }
            }
        }
        "fish" => {
            // fish history format is YAML-like: "- cmd: command"
            for line in reader.lines().flatten() {
                if line.starts_with("- cmd:") {
                    let cmd = line.trim_start_matches("- cmd:").trim().to_string();
                    if !cmd.is_empty() {
                        if let Some(ref f) = filter_lower {
                            if cmd.to_lowercase().contains(f) {
                                commands.push(cmd);
                            }
                        } else {
                            commands.push(cmd);
                        }
                    }
                }
            }
        }
        _ => {
            // bash: simple line-by-line format
            for line in reader.lines().flatten() {
                if !line.is_empty() && !line.starts_with('#') {
                    if let Some(ref f) = filter_lower {
                        if line.to_lowercase().contains(f) {
                            commands.push(line);
                        }
                    } else {
                        commands.push(line);
                    }
                }
            }
        }
    }
    
    // Get the most recent entries (history is usually oldest first)
    let recent: Vec<_> = commands.into_iter().rev().take(max_count).collect();
    
    if recent.is_empty() {
        return Ok(format!(
            "No commands found in history{}",
            filter.map(|f| format!(" matching '{}'", f)).unwrap_or_default()
        ));
    }
    
    // Format output with line numbers (most recent first)
    let mut output = vec![format!(
        "Shell: {} | Showing {} most recent commands{}:\n",
        detected_shell,
        recent.len(),
        filter.as_ref().map(|f| format!(" matching '{}'", f)).unwrap_or_default()
    )];
    
    for (i, cmd) in recent.iter().enumerate() {
        output.push(format!("{:4}. {}", i + 1, cmd));
    }
    
    Ok(output.join("\n"))
}

/// Scan large files for error patterns without loading entire file into memory.
/// Uses efficient line-by-line streaming for GB+ files.
/// Returns matching lines with context for debugging.
#[tauri::command]
pub async fn find_errors_in_file_tool(
    path: String,
    working_directory: Option<String>,
    context_lines: Option<usize>,
    max_matches: Option<usize>,
    custom_patterns: Option<Vec<String>>,
) -> Result<String, String> {
    use std::collections::VecDeque;
    use std::io::{BufRead, BufReader};

    // Resolve path
    let base_dir = resolve_base_dir(&working_directory);

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

    // Get file metadata for summary
    let metadata = fs::metadata(&safe_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let file_size = metadata.len();
    let size_human = format_file_size(file_size);

    // Configuration
    let context = context_lines.unwrap_or(2);
    let max = max_matches.unwrap_or(50).min(200); // Hard cap at 200 to prevent huge outputs

    // Default error patterns - general purpose for any system
    let default_patterns = vec![
        // Critical errors
        "error", "fatal", "panic", "crash", "abort", "segfault", "sigsegv", "sigkill",
        // Memory issues
        "oom", "out of memory", "memory allocation failed", "cannot allocate",
        // Process issues
        "killed", "terminated", "timed out", "timeout", "deadline exceeded",
        // Permission/access issues
        "permission denied", "access denied", "unauthorized", "forbidden",
        // Connection issues
        "connection refused", "connection reset", "connection timed out", "no route to host",
        "network unreachable", "host unreachable",
        // File issues
        "no such file", "file not found", "does not exist", "cannot open",
        // General failures
        "failed", "failure", "exception", "traceback", "stack trace",
        // Exit codes
        "exit code", "exit status", "returned 1", "non-zero",
    ];

    let patterns: Vec<String> = custom_patterns
        .unwrap_or_else(|| default_patterns.iter().map(|s| s.to_string()).collect());

    // Open file for streaming read
    let file = fs::File::open(&safe_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::with_capacity(64 * 1024, file); // 64KB buffer for efficiency

    // Circular buffer for context lines before match
    let mut context_before: VecDeque<(usize, String)> = VecDeque::with_capacity(context + 1);
    
    // Store matches with context
    struct ErrorMatch {
        line_number: usize,
        line_content: String,
        pattern_matched: String,
        context_before: Vec<(usize, String)>,
        context_after: Vec<(usize, String)>,
    }
    
    let mut matches: Vec<ErrorMatch> = Vec::new();
    let mut pending_context_after: Option<(usize, usize)> = None; // (match_idx, lines_remaining)
    let mut total_lines: usize = 0;
    
    for (line_idx, line_result) in reader.lines().enumerate() {
        let line_num = line_idx + 1; // 1-indexed
        total_lines = line_num;
        
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue, // Skip non-UTF8 lines
        };
        
        let line_lower = line.to_lowercase();
        
        // Add context_after lines to previous match if needed
        if let Some((match_idx, remaining)) = pending_context_after {
            if remaining > 0 {
                if let Some(m) = matches.get_mut(match_idx) {
                    m.context_after.push((line_num, line.clone()));
                }
                pending_context_after = Some((match_idx, remaining - 1));
            } else {
                pending_context_after = None;
            }
        }
        
        // Check for pattern matches
        let mut matched_pattern: Option<String> = None;
        for pattern in &patterns {
            if line_lower.contains(&pattern.to_lowercase()) {
                matched_pattern = Some(pattern.clone());
                break;
            }
        }
        
        if let Some(pattern) = matched_pattern {
            if matches.len() < max {
                let error_match = ErrorMatch {
                    line_number: line_num,
                    line_content: line.clone(),
                    pattern_matched: pattern,
                    context_before: context_before.iter().cloned().collect(),
                    context_after: Vec::new(),
                };
                matches.push(error_match);
                pending_context_after = Some((matches.len() - 1, context));
            }
        }
        
        // Update context_before buffer
        context_before.push_back((line_num, line));
        if context_before.len() > context {
            context_before.pop_front();
        }
    }

    // Build output
    let mut output = Vec::new();
    
    if matches.is_empty() {
        output.push(format!(
            "No errors found in {} ({}, {} lines scanned)",
            safe_path.display(),
            size_human,
            total_lines
        ));
        output.push(String::new());
        output.push(format!("Patterns searched: {}", patterns.join(", ")));
    } else {
        output.push(format!(
            "Found {} error(s) in {} ({}, {} lines):",
            matches.len(),
            safe_path.display(),
            size_human,
            total_lines
        ));
        output.push(String::new());
        
        for (idx, m) in matches.iter().enumerate() {
            output.push(format!("─── Match {} [Line {}] Pattern: \"{}\" ───", 
                idx + 1, m.line_number, m.pattern_matched));
            
            // Context before
            for (ln, content) in &m.context_before {
                output.push(format!("  {:>6} │ {}", ln, truncate_line(content, 200)));
            }
            
            // The matching line (highlighted)
            output.push(format!("▶ {:>6} │ {}", m.line_number, truncate_line(&m.line_content, 200)));
            
            // Context after
            for (ln, content) in &m.context_after {
                output.push(format!("  {:>6} │ {}", ln, truncate_line(content, 200)));
            }
            
            output.push(String::new());
        }
        
        if matches.len() >= max {
            output.push(format!("(Showing first {} matches, more may exist)", max));
        }
        
        // Summary of matched patterns
        let mut pattern_counts: std::collections::HashMap<&str, usize> = std::collections::HashMap::new();
        for m in &matches {
            *pattern_counts.entry(&m.pattern_matched).or_insert(0) += 1;
        }
        output.push(String::new());
        output.push("Pattern summary:".to_string());
        let mut counts: Vec<_> = pattern_counts.iter().collect();
        counts.sort_by(|a, b| b.1.cmp(a.1));
        for (pattern, count) in counts.iter().take(10) {
            output.push(format!("  • \"{}\": {} occurrence(s)", pattern, count));
        }
    }

    Ok(output.join("\n"))
}

/// Read specific line ranges from large files efficiently.
/// Uses streaming to handle GB+ files without memory issues.
#[tauri::command]
pub async fn file_sections_tool(
    path: String,
    working_directory: Option<String>,
    start_line: usize,
    end_line: Option<usize>,
    max_lines: Option<usize>,
) -> Result<String, String> {
    use std::io::{BufRead, BufReader};

    // Resolve path
    let base_dir = resolve_base_dir(&working_directory);

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

    // Validate start_line (1-indexed)
    if start_line == 0 {
        return Err("start_line must be >= 1 (line numbers are 1-indexed)".to_string());
    }

    // Get file metadata
    let metadata = fs::metadata(&safe_path)
        .map_err(|e| format!("Failed to read file metadata: {}", e))?;
    let file_size = metadata.len();
    let size_human = format_file_size(file_size);

    // Configuration
    let max = max_lines.unwrap_or(200).min(500); // Hard cap at 500 lines per request

    // Calculate effective end_line
    let effective_end = end_line.unwrap_or(start_line + max - 1);
    let requested_lines = effective_end.saturating_sub(start_line) + 1;
    let lines_to_read = requested_lines.min(max);
    let actual_end = start_line + lines_to_read - 1;

    // Open file for streaming read
    let file = fs::File::open(&safe_path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::with_capacity(64 * 1024, file); // 64KB buffer

    let mut output_lines: Vec<String> = Vec::new();
    let mut total_lines: usize = 0;
    let mut collected = 0;

    for (line_idx, line_result) in reader.lines().enumerate() {
        let line_num = line_idx + 1; // 1-indexed
        total_lines = line_num;

        // Skip until we reach start_line
        if line_num < start_line {
            continue;
        }

        // Stop if we've passed actual_end
        if line_num > actual_end {
            // Keep counting total lines for the summary
            continue;
        }

        let line = match line_result {
            Ok(l) => l,
            Err(_) => "(binary/non-UTF8 content)".to_string(),
        };

        output_lines.push(format!("{:>6} │ {}", line_num, truncate_line(&line, 300)));
        collected += 1;

        if collected >= lines_to_read {
            // Continue iterating to get total line count, but don't collect more
            // For very large files, we might want to estimate instead
            if file_size > 100 * 1024 * 1024 {
                // For files > 100MB, estimate total lines
                break;
            }
        }
    }

    // Build header
    let mut output = Vec::new();
    
    if output_lines.is_empty() {
        output.push(format!(
            "No lines found in range {}-{} (file has {} lines)",
            start_line, actual_end, total_lines
        ));
    } else {
        let showing_end = start_line + output_lines.len() - 1;
        let total_info = if file_size > 100 * 1024 * 1024 && collected >= lines_to_read {
            format!("{} (estimated, large file)", size_human)
        } else {
            format!("{} total lines", total_lines)
        };
        
        output.push(format!(
            "Lines {}-{} of {} ({}):",
            start_line,
            showing_end,
            safe_path.display(),
            total_info
        ));
        output.push(String::new());
        output.extend(output_lines);
        
        if requested_lines > lines_to_read {
            output.push(String::new());
            output.push(format!(
                "(Requested {} lines, showing {} due to limit. Use start_line={} to continue.)",
                requested_lines, lines_to_read, showing_end + 1
            ));
        }
    }

    Ok(output.join("\n"))
}

/// Helper: Format file size in human-readable form
fn format_file_size(size: u64) -> String {
    if size < 1024 {
        format!("{} bytes", size)
    } else if size < 1024 * 1024 {
        format!("{:.1} KB", size as f64 / 1024.0)
    } else if size < 1024 * 1024 * 1024 {
        format!("{:.1} MB", size as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", size as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

/// Helper: Truncate long lines for output readability
fn truncate_line(line: &str, max_len: usize) -> String {
    if line.len() <= max_len {
        line.to_string()
    } else {
        format!("{}...[truncated +{} chars]", &line[..max_len], line.len() - max_len)
    }
}

/// Helper: Create a backup of a file before modifying it
pub fn create_file_backup(
    state: &AppState,
    path: &Path,
) -> Result<(), String> {
    use crate::models::{FileBackup, MAX_BACKUPS_PER_FILE, MAX_TOTAL_BACKUPS};
    
    // Only backup if file exists
    if !path.exists() || !path.is_file() {
        return Ok(());
    }
    
    // Read current content
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file for backup: {}", e))?;
    
    let path_str = path.to_string_lossy().to_string();
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    
    let backup = FileBackup {
        path: path_str.clone(),
        content,
        timestamp,
    };
    
    let mut backups = state.file_backups.lock()
        .map_err(|e| format!("Failed to lock backups: {}", e))?;
    
    // Count existing backups for this file
    let file_backup_count = backups.iter().filter(|b| b.path == path_str).count();
    
    // If too many backups for this file, remove oldest
    if file_backup_count >= MAX_BACKUPS_PER_FILE {
        if let Some(idx) = backups.iter().position(|b| b.path == path_str) {
            backups.remove(idx);
        }
    }
    
    // If too many total backups, remove oldest
    while backups.len() >= MAX_TOTAL_BACKUPS {
        backups.remove(0);
    }
    
    backups.push(backup);
    Ok(())
}

/// Undo the last file change by restoring from backup
#[tauri::command]
pub async fn undo_file_change_tool(
    path: Option<String>,
    working_directory: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let mut backups = state.file_backups.lock()
        .map_err(|e| format!("Failed to lock backups: {}", e))?;
    
    if backups.is_empty() {
        return Err("No file backups available to restore".to_string());
    }
    
    // If path specified, find backup for that specific file
    let backup = if let Some(ref p) = path {
        let full_path = resolve_path(p, &working_directory);
        
        let safe_path = validate_path(&full_path)?;
        let path_str = safe_path.to_string_lossy().to_string();
        
        // Find most recent backup for this file
        let idx = backups.iter().rposition(|b| b.path == path_str)
            .ok_or_else(|| format!("No backup found for: {}", path_str))?;
        
        backups.remove(idx)
    } else {
        // No path specified, restore most recent backup
        backups.pop().ok_or_else(|| "No backups remaining".to_string())?
    };
    
    // SECURITY: Re-validate the restore path before writing
    let restore_path = validate_path_for_write(Path::new(&backup.path))?;

    // Create parent directories if needed
    if let Some(parent) = restore_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create parent directory: {}", e))?;
    }

    fs::write(&restore_path, &backup.content)
        .map_err(|e| format!("Failed to restore file: {}", e))?;
    
    // Format timestamp
    let datetime = chrono::DateTime::from_timestamp(backup.timestamp as i64, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| "unknown time".to_string());
    
    Ok(format!(
        "Restored {} to version from {} ({} bytes)",
        backup.path,
        datetime,
        backup.content.len()
    ))
}

/// List available file backups
#[tauri::command]
pub async fn list_file_backups_tool(
    path: Option<String>,
    working_directory: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let backups = state.file_backups.lock()
        .map_err(|e| format!("Failed to lock backups: {}", e))?;
    
    if backups.is_empty() {
        return Ok("No file backups available".to_string());
    }
    
    // Filter by path if specified
    let filtered: Vec<_> = if let Some(ref p) = path {
        let full_path = resolve_path(p, &working_directory);
        
        let safe_path = validate_path(&full_path)?;
        let path_str = safe_path.to_string_lossy().to_string();
        
        backups.iter().filter(|b| b.path == path_str).collect()
    } else {
        backups.iter().collect()
    };
    
    if filtered.is_empty() {
        return Ok(format!("No backups found for: {}", path.unwrap_or_default()));
    }
    
    let mut output = vec![format!("Available backups ({}):", filtered.len())];
    
    for (i, backup) in filtered.iter().enumerate().rev() {
        let datetime = chrono::DateTime::from_timestamp(backup.timestamp as i64, 0)
            .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_else(|| "unknown".to_string());
        
        let size = if backup.content.len() < 1024 {
            format!("{} bytes", backup.content.len())
        } else {
            format!("{:.1} KB", backup.content.len() as f64 / 1024.0)
        };
        
        output.push(format!("  {}. {} ({}) - {}", i + 1, backup.path, size, datetime));
    }
    
    Ok(output.join("\n"))
}

/// Compare two files or show changes made to a file
#[tauri::command]
pub async fn diff_files_tool(
    file1: String,
    file2: Option<String>,
    working_directory: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let base_dir = resolve_base_dir(&working_directory);
    
    // Resolve file1 path
    let path1 = if Path::new(&file1).is_absolute() {
        Path::new(&file1).to_path_buf()
    } else {
        base_dir.join(&file1)
    };
    let safe_path1 = validate_path(&path1)?;
    
    // Get content1 - either from file or backup
    let (content1, label1) = if file2.is_none() {
        // Compare current file with its most recent backup
        let backups = state.file_backups.lock()
            .map_err(|e| format!("Failed to lock backups: {}", e))?;
        
        let path_str = safe_path1.to_string_lossy().to_string();
        let backup = backups.iter().rev().find(|b| b.path == path_str)
            .ok_or_else(|| format!("No backup found for {}. Cannot show diff without a previous version.", path_str))?;
        
        (backup.content.clone(), format!("{} (backup)", file1))
    } else {
        // Read file1
        if !safe_path1.exists() {
            return Err(format!("File does not exist: {}", safe_path1.display()));
        }
        let content = fs::read_to_string(&safe_path1)
            .map_err(|e| format!("Failed to read {}: {}", file1, e))?;
        (content, file1.clone())
    };
    
    // Get content2
    let (content2, label2) = if let Some(ref f2) = file2 {
        let path2 = if Path::new(f2).is_absolute() {
            Path::new(f2).to_path_buf()
        } else {
            base_dir.join(f2)
        };
        let safe_path2 = validate_path(&path2)?;
        
        if !safe_path2.exists() {
            return Err(format!("File does not exist: {}", safe_path2.display()));
        }
        
        let content = fs::read_to_string(&safe_path2)
            .map_err(|e| format!("Failed to read {}: {}", f2, e))?;
        (content, f2.clone())
    } else {
        // Compare with current file content
        if !safe_path1.exists() {
            return Err(format!("File does not exist: {}", safe_path1.display()));
        }
        let content = fs::read_to_string(&safe_path1)
            .map_err(|e| format!("Failed to read {}: {}", file1, e))?;
        (content, format!("{} (current)", file1))
    };
    
    // If contents are identical
    if content1 == content2 {
        return Ok(format!("No differences between {} and {}", label1, label2));
    }
    
    // Generate unified diff
    let lines1: Vec<&str> = content1.lines().collect();
    let lines2: Vec<&str> = content2.lines().collect();
    
    let mut output = vec![
        format!("--- {}", label1),
        format!("+++ {}", label2),
        String::new(),
    ];
    
    // Simple line-by-line diff (not a true unified diff, but useful)
    let max_lines = lines1.len().max(lines2.len());
    let mut changes = 0;
    let mut in_change_block = false;
    
    for i in 0..max_lines {
        let line1 = lines1.get(i);
        let line2 = lines2.get(i);
        
        match (line1, line2) {
            (Some(l1), Some(l2)) if l1 == l2 => {
                if in_change_block && changes < 100 {
                    // Show context line after changes
                    output.push(format!(" {:>4} │ {}", i + 1, truncate_line(l1, 200)));
                }
                in_change_block = false;
            }
            (Some(l1), Some(l2)) => {
                if !in_change_block {
                    in_change_block = true;
                    output.push(format!("@@ Line {} @@", i + 1));
                }
                if changes < 100 {
                    output.push(format!("-{:>4} │ {}", i + 1, truncate_line(l1, 200)));
                    output.push(format!("+{:>4} │ {}", i + 1, truncate_line(l2, 200)));
                }
                changes += 1;
            }
            (Some(l1), None) => {
                if !in_change_block {
                    in_change_block = true;
                    output.push(format!("@@ Line {} @@", i + 1));
                }
                if changes < 100 {
                    output.push(format!("-{:>4} │ {}", i + 1, truncate_line(l1, 200)));
                }
                changes += 1;
            }
            (None, Some(l2)) => {
                if !in_change_block {
                    in_change_block = true;
                    output.push(format!("@@ Line {} @@", i + 1));
                }
                if changes < 100 {
                    output.push(format!("+{:>4} │ {}", i + 1, truncate_line(l2, 200)));
                }
                changes += 1;
            }
            (None, None) => break,
        }
    }
    
    if changes >= 100 {
        output.push(format!("\n(Showing first 100 changes, {} total)", changes));
    }
    
    output.push(String::new());
    output.push(format!("Summary: {} line(s) changed", changes));
    
    Ok(output.join("\n"))
}
