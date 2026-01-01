use std::fs;
use std::path::PathBuf;
use tauri::command;

#[command]
pub fn get_shell_history() -> Result<Vec<String>, String> {
    let home =
        std::env::var("HOME").map_err(|_| "Could not determine home directory".to_string())?;

    // Detect current shell
    let shell = std::env::var("SHELL").unwrap_or_default();

    // Order history files based on detected shell
    let history_files = if shell.contains("zsh") {
        vec![
            format!("{}/.zsh_history", home),
            format!("{}/.bash_history", home),
            format!("{}/.history", home),
        ]
    } else if shell.contains("bash") {
        vec![
            format!("{}/.bash_history", home),
            format!("{}/.zsh_history", home),
            format!("{}/.history", home),
        ]
    } else {
        vec![
            format!("{}/.bash_history", home),
            format!("{}/.zsh_history", home),
            format!("{}/.history", home),
        ]
    };

    for history_path in history_files {
        let path = PathBuf::from(&history_path);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                let commands: Vec<String> = content
                    .lines()
                    .filter_map(|line| {
                        let line = line.trim();

                        // Skip empty lines and comments
                        if line.is_empty() || line.starts_with('#') {
                            return None;
                        }

                        // Zsh history format: ": timestamp:0;command"
                        if line.starts_with(':') {
                            if let Some(cmd_start) = line.find(';') {
                                let cmd = &line[cmd_start + 1..];
                                return Some(cmd.to_string());
                            }
                        }

                        // Bash history is just commands
                        Some(line.to_string())
                    })
                    .collect();

                return Ok(commands);
            }
        }
    }

    // No history file found
    Ok(Vec::new())
}
