use portable_pty::CommandBuilder;
use std::path::{Path, PathBuf};

/// Setup shell integration scripts in ~/.config/aiterminal
pub fn setup_integration_scripts() -> Option<PathBuf> {
    let home = std::env::var("HOME").ok()?;
    let config_dir = Path::new(&home).join(".config/aiterminal");
    
    std::fs::create_dir_all(&config_dir).ok()?;
    
    let bash_init_path = config_dir.join("bash_init.sh");
    let ssh_helper_path = config_dir.join("ssh_helper.sh");
    let zsh_rc_path = config_dir.join(".zshrc");
    
    // Use embedded shell scripts from build time
    let bash_script = include_str!("../../shell-integration/bash_init.sh");
    let ssh_helper_script = include_str!("../../shell-integration/ssh_helper.sh");
    let zsh_rc = include_str!("../../shell-integration/zshrc");
    
    std::fs::write(&bash_init_path, bash_script).ok()?;
    std::fs::write(&ssh_helper_path, ssh_helper_script).ok()?;
    std::fs::write(&zsh_rc_path, zsh_rc).ok()?;
    
    Some(config_dir)
}

/// Configure shell command with integration scripts and environment
pub fn configure_shell_command(
    cmd: &mut CommandBuilder,
    shell: &str,
    config_dir: Option<&PathBuf>
) {
    // Set environment for color support
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("CLICOLOR", "1");

    // Configure shell-specific integration
    if !cfg!(target_os = "windows") {
        if let Some(config_dir) = config_dir {
            if shell.ends_with("bash") {
                let bash_init_path = config_dir.join("bash_init.sh");
                cmd.args([
                    "--rcfile",
                    bash_init_path.to_string_lossy().as_ref(),
                    "-i",
                ]);
            } else if shell.ends_with("zsh") {
                cmd.env("ZDOTDIR", config_dir.to_string_lossy().as_ref());
                cmd.args(["-i"]);
            } else {
                cmd.args(["-l"]);
            }
        } else {
            cmd.args(["-l"]);
        }
    }
}
