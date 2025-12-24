/// Detect user's preferred shell from environment or system configuration
pub fn resolve_shell() -> String {
    if let Ok(shell) = std::env::var("AITERM_SHELL") {
        if !shell.trim().is_empty() {
            return shell;
        }
    }

    if cfg!(target_os = "macos") {
        if let Ok(username) = std::env::var("USER") {
            if let Ok(output) = std::process::Command::new("dscl")
                .args(&[".", "-read", &format!("/Users/{}", username), "UserShell"])
                .output()
            {
                if output.status.success() {
                    if let Ok(text) = String::from_utf8(output.stdout) {
                        for line in text.lines() {
                            if line.starts_with("UserShell:") {
                                let shell = line["UserShell:".len()..].trim();
                                if !shell.is_empty() {
                                    return shell.to_string();
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if cfg!(target_os = "macos") {
        "/bin/zsh".to_string()
    } else {
        "/bin/bash".to_string()
    }
}
