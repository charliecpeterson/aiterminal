use std::path::{Path, PathBuf};
use crate::security::path_validator::validate_path;

/// Resolve working_directory to a PathBuf, with tilde expansion and validation.
/// Falls back to the current directory if not provided.
fn resolve_base_dir(working_directory: &Option<String>) -> PathBuf {
    working_directory
        .as_deref()
        .and_then(|wd| shellexpand::tilde(wd).parse::<PathBuf>().ok())
        .and_then(|p| validate_path(&p).ok())
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default())
}

// ============================================================================
// ACTIVE TOOLS - These are called by the TypeScript frontend
// ============================================================================

/// Calculate math expression using pure Rust (no shell execution)
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

/// Web search (returns curl command suggestion)
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

/// Analyze error output - extract file paths, line numbers, and key information
#[tauri::command]
pub async fn analyze_error_tool(
    error_text: String,
    working_directory: Option<String>,
) -> Result<String, String> {
    let mut analysis = Vec::new();
    
    // Extract file paths with line numbers (common formats: file.rs:10, file.js:10:5, etc.)
    use std::sync::LazyLock;
    static FILE_LINE_REGEX: LazyLock<regex::Regex> = LazyLock::new(|| {
        regex::Regex::new(r"([/\w\-_.]+\.\w+):(\d+)(?::(\d+))?").unwrap()
    });
    let file_line_regex = &*FILE_LINE_REGEX;
    
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
