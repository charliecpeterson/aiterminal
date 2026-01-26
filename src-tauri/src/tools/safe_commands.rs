use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Safe commands that can be executed without shell interpretation
#[derive(Debug, Clone)]
pub enum SafeCommand {
    // File operations
    Ls { path: String, flags: Vec<String> },
    Pwd,
    Cat { file: String },
    Echo { text: String },
    
    // Text processing
    Grep { pattern: String, file: Option<String>, flags: Vec<String> },
    Head { file: String, lines: Option<usize> },
    Tail { file: String, lines: Option<usize> },
    Wc { file: String, flags: Vec<String> },
    
    // Git operations (read-only)
    Git { subcommand: GitSubcommand },
    
    // System info
    Uname { flags: Vec<String> },
    Whoami,
    Hostname,
    Date,
    
    // Process info
    Ps { flags: Vec<String> },
    
    // Node/npm/cargo (common development commands)
    Node { args: Vec<String> },
    Npm { subcommand: String, args: Vec<String> },
    Cargo { subcommand: String, args: Vec<String> },
    Python { args: Vec<String> },
}

#[derive(Debug, Clone)]
pub enum GitSubcommand {
    Status,
    Diff { files: Vec<String> },
    Log { max_count: Option<usize>, files: Vec<String> },
    Branch { list: bool },
    Show { commit: Option<String> },
}

impl SafeCommand {
    /// Parse a command string into a SafeCommand
    /// Returns Err if command is not in the whitelist or contains suspicious patterns
    pub fn from_string(cmd: &str) -> Result<Self, String> {
        let cmd = cmd.trim();
        
        // Check for shell metacharacters that indicate injection attempts
        if Self::contains_shell_metacharacters(cmd) {
            return Err("Command contains shell metacharacters (;|&$`()<>)".to_string());
        }
        
        // Split into parts (simple whitespace splitting)
        let parts: Vec<&str> = cmd.split_whitespace().collect();
        
        if parts.is_empty() {
            return Err("Empty command".to_string());
        }
        
        let command = parts[0];
        let args = &parts[1..];
        
        match command {
            "ls" => Self::parse_ls(args),
            "pwd" => Ok(SafeCommand::Pwd),
            "cat" => Self::parse_cat(args),
            "echo" => Self::parse_echo(args),
            "grep" => Self::parse_grep(args),
            "head" => Self::parse_head(args),
            "tail" => Self::parse_tail(args),
            "wc" => Self::parse_wc(args),
            "git" => Self::parse_git(args),
            "uname" => Self::parse_uname(args),
            "whoami" => Ok(SafeCommand::Whoami),
            "hostname" => Ok(SafeCommand::Hostname),
            "date" => Ok(SafeCommand::Date),
            "ps" => Self::parse_ps(args),
            "node" => Self::parse_node(args),
            "npm" => Self::parse_npm(args),
            "cargo" => Self::parse_cargo(args),
            "python" | "python3" => Self::parse_python(args),
            _ => Err(format!(
                "Command '{}' is not in the whitelist. For security, only specific commands are allowed.",
                command
            )),
        }
    }
    
    /// Check if string contains shell metacharacters
    fn contains_shell_metacharacters(s: &str) -> bool {
        // These characters are used for command chaining, substitution, redirection, etc.
        let dangerous_chars = [';', '|', '&', '$', '`', '<', '>', '(', ')', '\n', '\r'];
        s.chars().any(|c| dangerous_chars.contains(&c))
    }
    
    /// Execute the safe command without using a shell
    pub fn execute(&self, cwd: Option<&Path>) -> Result<CommandResult, String> {
        let mut cmd = match self {
            SafeCommand::Ls { path, flags } => {
                let mut c = Command::new("ls");
                for flag in flags {
                    c.arg(flag);
                }
                if !path.is_empty() {
                    c.arg(path);
                }
                c
            }
            SafeCommand::Pwd => Command::new("pwd"),
            SafeCommand::Cat { file } => {
                let mut c = Command::new("cat");
                c.arg(file);
                c
            }
            SafeCommand::Echo { text } => {
                let mut c = Command::new("echo");
                c.arg(text);
                c
            }
            SafeCommand::Grep { pattern, file, flags } => {
                let mut c = Command::new("grep");
                for flag in flags {
                    c.arg(flag);
                }
                c.arg(pattern);
                if let Some(f) = file {
                    c.arg(f);
                }
                c
            }
            SafeCommand::Head { file, lines } => {
                let mut c = Command::new("head");
                if let Some(n) = lines {
                    c.arg("-n").arg(n.to_string());
                }
                c.arg(file);
                c
            }
            SafeCommand::Tail { file, lines } => {
                let mut c = Command::new("tail");
                if let Some(n) = lines {
                    c.arg("-n").arg(n.to_string());
                }
                c.arg(file);
                c
            }
            SafeCommand::Wc { file, flags } => {
                let mut c = Command::new("wc");
                for flag in flags {
                    c.arg(flag);
                }
                c.arg(file);
                c
            }
            SafeCommand::Git { subcommand } => Self::build_git_command(subcommand),
            SafeCommand::Uname { flags } => {
                let mut c = Command::new("uname");
                for flag in flags {
                    c.arg(flag);
                }
                c
            }
            SafeCommand::Whoami => Command::new("whoami"),
            SafeCommand::Hostname => Command::new("hostname"),
            SafeCommand::Date => Command::new("date"),
            SafeCommand::Ps { flags } => {
                let mut c = Command::new("ps");
                for flag in flags {
                    c.arg(flag);
                }
                c
            }
            SafeCommand::Node { args } => {
                let mut c = Command::new("node");
                for arg in args {
                    c.arg(arg);
                }
                c
            }
            SafeCommand::Npm { subcommand, args } => {
                let mut c = Command::new("npm");
                c.arg(subcommand);
                for arg in args {
                    c.arg(arg);
                }
                c
            }
            SafeCommand::Cargo { subcommand, args } => {
                let mut c = Command::new("cargo");
                c.arg(subcommand);
                for arg in args {
                    c.arg(arg);
                }
                c
            }
            SafeCommand::Python { args } => {
                let mut c = Command::new("python3");
                for arg in args {
                    c.arg(arg);
                }
                c
            }
        };
        
        // Set working directory if provided
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }
        
        // Execute the command
        let output = cmd
            .output()
            .map_err(|e| format!("Failed to execute command: {}", e))?;
        
        Ok(CommandResult {
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            exit_code: output.status.code().unwrap_or(-1),
        })
    }
    
    // Parser implementations
    fn parse_ls(args: &[&str]) -> Result<Self, String> {
        let mut flags = Vec::new();
        let mut path = String::new();
        
        for arg in args {
            if arg.starts_with('-') {
                flags.push(arg.to_string());
            } else {
                path = arg.to_string();
            }
        }
        
        Ok(SafeCommand::Ls { path, flags })
    }
    
    fn parse_cat(args: &[&str]) -> Result<Self, String> {
        if args.is_empty() {
            return Err("cat requires a file argument".to_string());
        }
        Ok(SafeCommand::Cat {
            file: args[0].to_string(),
        })
    }
    
    fn parse_echo(args: &[&str]) -> Result<Self, String> {
        Ok(SafeCommand::Echo {
            text: args.join(" "),
        })
    }
    
    fn parse_grep(args: &[&str]) -> Result<Self, String> {
        if args.is_empty() {
            return Err("grep requires a pattern".to_string());
        }
        
        let mut flags = Vec::new();
        let mut pattern = String::new();
        let mut file = None;
        let mut pattern_found = false;
        
        for arg in args {
            if arg.starts_with('-') {
                flags.push(arg.to_string());
            } else if !pattern_found {
                pattern = arg.to_string();
                pattern_found = true;
            } else {
                file = Some(arg.to_string());
            }
        }
        
        Ok(SafeCommand::Grep { pattern, file, flags })
    }
    
    fn parse_head(args: &[&str]) -> Result<Self, String> {
        let mut lines = None;
        let mut file = String::new();
        let mut i = 0;
        
        while i < args.len() {
            if args[i] == "-n" && i + 1 < args.len() {
                lines = args[i + 1].parse().ok();
                i += 2;
            } else {
                file = args[i].to_string();
                i += 1;
            }
        }
        
        if file.is_empty() {
            return Err("head requires a file argument".to_string());
        }
        
        Ok(SafeCommand::Head { file, lines })
    }
    
    fn parse_tail(args: &[&str]) -> Result<Self, String> {
        let mut lines = None;
        let mut file = String::new();
        let mut i = 0;
        
        while i < args.len() {
            if args[i] == "-n" && i + 1 < args.len() {
                lines = args[i + 1].parse().ok();
                i += 2;
            } else {
                file = args[i].to_string();
                i += 1;
            }
        }
        
        if file.is_empty() {
            return Err("tail requires a file argument".to_string());
        }
        
        Ok(SafeCommand::Tail { file, lines })
    }
    
    fn parse_wc(args: &[&str]) -> Result<Self, String> {
        let mut flags = Vec::new();
        let mut file = String::new();
        
        for arg in args {
            if arg.starts_with('-') {
                flags.push(arg.to_string());
            } else {
                file = arg.to_string();
            }
        }
        
        if file.is_empty() {
            return Err("wc requires a file argument".to_string());
        }
        
        Ok(SafeCommand::Wc { file, flags })
    }
    
    fn parse_git(args: &[&str]) -> Result<Self, String> {
        if args.is_empty() {
            return Err("git requires a subcommand".to_string());
        }
        
        let subcommand = match args[0] {
            "status" => GitSubcommand::Status,
            "diff" => {
                let files = args[1..].iter().map(|s| s.to_string()).collect();
                GitSubcommand::Diff { files }
            }
            "log" => {
                let mut max_count = None;
                let mut files = Vec::new();
                let mut i = 1;
                
                while i < args.len() {
                    if args[i] == "-n" && i + 1 < args.len() {
                        max_count = args[i + 1].parse().ok();
                        i += 2;
                    } else {
                        files.push(args[i].to_string());
                        i += 1;
                    }
                }
                
                GitSubcommand::Log { max_count, files }
            }
            "branch" => GitSubcommand::Branch { list: true },
            "show" => {
                let commit = args.get(1).map(|s| s.to_string());
                GitSubcommand::Show { commit }
            }
            cmd => return Err(format!("git subcommand '{}' is not allowed", cmd)),
        };
        
        Ok(SafeCommand::Git { subcommand })
    }
    
    fn parse_uname(args: &[&str]) -> Result<Self, String> {
        let flags = args.iter().map(|s| s.to_string()).collect();
        Ok(SafeCommand::Uname { flags })
    }
    
    fn parse_ps(args: &[&str]) -> Result<Self, String> {
        let flags = args.iter().map(|s| s.to_string()).collect();
        Ok(SafeCommand::Ps { flags })
    }
    
    fn parse_node(args: &[&str]) -> Result<Self, String> {
        // Block dangerous flags that allow arbitrary code execution
        let dangerous_flags = ["-e", "--eval", "-p", "--print", "-c", "--check"];
        
        for arg in args {
            for flag in &dangerous_flags {
                if arg == flag || arg.starts_with(&format!("{}=", flag)) {
                    return Err(format!(
                        "node flag '{}' is not allowed: can execute arbitrary code. \
                        Use node with script files only.",
                        arg
                    ));
                }
            }
        }
        
        let args = args.iter().map(|s| s.to_string()).collect();
        Ok(SafeCommand::Node { args })
    }
    
    fn parse_npm(args: &[&str]) -> Result<Self, String> {
        if args.is_empty() {
            return Err("npm requires a subcommand".to_string());
        }
        
        // Block dangerous npm subcommands that can execute arbitrary code
        let dangerous_subcommands = ["exec", "x", "run-script"];
        let subcommand = args[0];
        
        for dangerous in &dangerous_subcommands {
            if subcommand == *dangerous {
                return Err(format!(
                    "npm subcommand '{}' is not allowed: can execute arbitrary code. \
                    Use npm with read-only commands like 'list', 'view', 'outdated'.",
                    subcommand
                ));
            }
        }
        
        // Also block -c/--call flags that can execute code
        for arg in &args[1..] {
            if arg == &"-c" || arg == &"--call" || arg.starts_with("--call=") {
                return Err(format!(
                    "npm flag '{}' is not allowed: can execute arbitrary code.",
                    arg
                ));
            }
        }
        
        let subcommand = args[0].to_string();
        let args = args[1..].iter().map(|s| s.to_string()).collect();
        Ok(SafeCommand::Npm { subcommand, args })
    }
    
    fn parse_cargo(args: &[&str]) -> Result<Self, String> {
        if args.is_empty() {
            return Err("cargo requires a subcommand".to_string());
        }
        
        // Block cargo subcommands that can execute arbitrary code via build scripts
        let dangerous_subcommands = ["build", "run", "test", "bench", "install"];
        let subcommand = args[0];
        
        for dangerous in &dangerous_subcommands {
            if subcommand == *dangerous {
                return Err(format!(
                    "cargo subcommand '{}' is not allowed: can execute build.rs scripts with arbitrary code. \
                    Use cargo with read-only commands like 'check', 'search', 'tree'.",
                    subcommand
                ));
            }
        }
        
        let subcommand = args[0].to_string();
        let args = args[1..].iter().map(|s| s.to_string()).collect();
        Ok(SafeCommand::Cargo { subcommand, args })
    }
    
    fn parse_python(args: &[&str]) -> Result<Self, String> {
        // Block dangerous flags that allow arbitrary code execution
        let dangerous_flags = ["-c", "-m"];
        
        for arg in args {
            for flag in &dangerous_flags {
                if arg == flag || arg.starts_with(&format!("{}=", flag)) {
                    return Err(format!(
                        "python flag '{}' is not allowed: can execute arbitrary code. \
                        Use python with script files only.",
                        arg
                    ));
                }
            }
        }
        
        let args = args.iter().map(|s| s.to_string()).collect();
        Ok(SafeCommand::Python { args })
    }
    
    fn build_git_command(subcommand: &GitSubcommand) -> Command {
        let mut cmd = Command::new("git");
        
        match subcommand {
            GitSubcommand::Status => {
                cmd.arg("status");
            }
            GitSubcommand::Diff { files } => {
                cmd.arg("diff");
                for file in files {
                    cmd.arg(file);
                }
            }
            GitSubcommand::Log { max_count, files } => {
                cmd.arg("log");
                if let Some(n) = max_count {
                    cmd.arg("-n").arg(n.to_string());
                }
                for file in files {
                    cmd.arg(file);
                }
            }
            GitSubcommand::Branch { .. } => {
                cmd.arg("branch");
            }
            GitSubcommand::Show { commit } => {
                cmd.arg("show");
                if let Some(c) = commit {
                    cmd.arg(c);
                }
            }
        }
        
        cmd
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_detects_shell_metacharacters() {
        assert!(SafeCommand::from_string("ls; rm -rf /").is_err());
        assert!(SafeCommand::from_string("ls | grep test").is_err());
        assert!(SafeCommand::from_string("ls && echo hi").is_err());
        assert!(SafeCommand::from_string("echo `whoami`").is_err());
        assert!(SafeCommand::from_string("ls $(whoami)").is_err());
        assert!(SafeCommand::from_string("ls > file.txt").is_err());
        assert!(SafeCommand::from_string("cat < file.txt").is_err());
    }
    
    #[test]
    fn test_allows_safe_commands() {
        assert!(SafeCommand::from_string("ls -la").is_ok());
        assert!(SafeCommand::from_string("pwd").is_ok());
        assert!(SafeCommand::from_string("cat file.txt").is_ok());
        assert!(SafeCommand::from_string("git status").is_ok());
        assert!(SafeCommand::from_string("npm install").is_ok());
    }
    
    #[test]
    fn test_rejects_unlisted_commands() {
        assert!(SafeCommand::from_string("rm -rf /").is_err());
        assert!(SafeCommand::from_string("sudo rm file").is_err());
        assert!(SafeCommand::from_string("curl evil.com").is_err());
        assert!(SafeCommand::from_string("wget http://evil.com").is_err());
    }
    
    #[test]
    fn test_parses_ls_correctly() {
        let cmd = SafeCommand::from_string("ls -la /tmp").unwrap();
        match cmd {
            SafeCommand::Ls { path, flags } => {
                assert_eq!(path, "/tmp");
                assert_eq!(flags, vec!["-la"]);
            }
            _ => panic!("Wrong variant"),
        }
    }
    
    #[test]
    fn test_parses_git_correctly() {
        let cmd = SafeCommand::from_string("git status").unwrap();
        match cmd {
            SafeCommand::Git { subcommand } => match subcommand {
                GitSubcommand::Status => {}
                _ => panic!("Wrong git subcommand"),
            },
            _ => panic!("Wrong variant"),
        }
    }
    
    // Security tests for command injection prevention
    
    #[test]
    fn test_blocks_node_code_execution_flags() {
        // Block -e flag
        assert!(SafeCommand::from_string("node -e 'console.log(1)'").is_err());
        assert!(SafeCommand::from_string("node --eval 'console.log(1)'").is_err());
        
        // Block -p flag
        assert!(SafeCommand::from_string("node -p '1+1'").is_err());
        assert!(SafeCommand::from_string("node --print '1+1'").is_err());
        
        // Block -c flag
        assert!(SafeCommand::from_string("node -c script.js").is_err());
        assert!(SafeCommand::from_string("node --check script.js").is_err());
        
        // Allow safe node usage
        assert!(SafeCommand::from_string("node script.js").is_ok());
        assert!(SafeCommand::from_string("node --version").is_ok());
    }
    
    #[test]
    fn test_blocks_npm_code_execution() {
        // Block exec subcommand
        assert!(SafeCommand::from_string("npm exec malicious").is_err());
        assert!(SafeCommand::from_string("npm x malicious").is_err());
        assert!(SafeCommand::from_string("npm run-script build").is_err());
        
        // Block -c/--call flags
        assert!(SafeCommand::from_string("npm install -c 'evil code'").is_err());
        assert!(SafeCommand::from_string("npm install --call 'evil code'").is_err());
        
        // Allow safe npm usage
        assert!(SafeCommand::from_string("npm list").is_ok());
        assert!(SafeCommand::from_string("npm view package").is_ok());
        assert!(SafeCommand::from_string("npm outdated").is_ok());
    }
    
    #[test]
    fn test_blocks_cargo_build_scripts() {
        // Block build/run/test (can execute build.rs)
        assert!(SafeCommand::from_string("cargo build").is_err());
        assert!(SafeCommand::from_string("cargo run").is_err());
        assert!(SafeCommand::from_string("cargo test").is_err());
        assert!(SafeCommand::from_string("cargo bench").is_err());
        assert!(SafeCommand::from_string("cargo install package").is_err());
        
        // Allow safe cargo usage
        assert!(SafeCommand::from_string("cargo check").is_ok());
        assert!(SafeCommand::from_string("cargo search query").is_ok());
        assert!(SafeCommand::from_string("cargo tree").is_ok());
    }
    
    #[test]
    fn test_blocks_python_code_execution_flags() {
        // Block -c flag
        assert!(SafeCommand::from_string("python -c 'print(1)'").is_err());
        assert!(SafeCommand::from_string("python3 -c 'import os; os.system(\"ls\")'").is_err());
        
        // Block -m flag
        assert!(SafeCommand::from_string("python -m http.server").is_err());
        assert!(SafeCommand::from_string("python3 -m pip install malicious").is_err());
        
        // Allow safe python usage
        assert!(SafeCommand::from_string("python script.py").is_ok());
        assert!(SafeCommand::from_string("python --version").is_ok());
        assert!(SafeCommand::from_string("python3 test.py").is_ok());
    }
    
    #[test]
    fn test_command_injection_attack_scenarios() {
        // These are real-world attack patterns that should be blocked
        
        // Node attacks
        assert!(SafeCommand::from_string("node -e \"require('child_process').exec('rm -rf /')\"").is_err());
        assert!(SafeCommand::from_string("node -p \"process.exit(0)\"").is_err());
        
        // Python attacks
        assert!(SafeCommand::from_string("python -c \"import os; os.system('whoami')\"").is_err());
        assert!(SafeCommand::from_string("python3 -c \"__import__('os').system('ls')\"").is_err());
        
        // NPM attacks
        assert!(SafeCommand::from_string("npm exec -- rm -rf /").is_err());
        assert!(SafeCommand::from_string("npm x cowsay hello").is_err());
        
        // Cargo attacks  
        assert!(SafeCommand::from_string("cargo build").is_err()); // build.rs can run anything
    }
}

