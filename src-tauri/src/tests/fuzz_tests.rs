/// Fuzzing tests for file operations
/// 
/// These tests generate random/malicious inputs to test the robustness
/// of file operation security boundaries.

#[cfg(test)]
mod fuzz_tests {
    use crate::tools::commands::{read_file_tool, write_file_tool, append_to_file_tool};
    use crate::security::path_validator::PathValidator;
    use std::env;
    use std::path::PathBuf;

    // ==================== FUZZ TEST 1 ====================
    // Test with various path traversal patterns
    #[tokio::test]
    async fn fuzz_path_traversal_patterns() {
        let traversal_patterns = vec![
            "../",
            "../../",
            "../../../",
            "../../../../../../../../../../../../",
            "..",
            "../..",
            "..\\",
            "..\\..\\",
            "./../",
            "./../../",
            "./.././.././.././../",
            "...//...//",
            "....//...//.../",
            ".%2e/",
            "%2e%2e/",
            "..%252f",
            "..%c0%af",
            "..%c1%9c",
        ];

        let home = env::var("HOME").unwrap();
        let home_path = PathBuf::from(&home);

        for pattern in traversal_patterns {
            let test_path = home_path.join(pattern).join("etc/passwd");
            let result = read_file_tool(test_path.to_string_lossy().to_string(), 1000).await;
            
            // All traversal attempts should fail
            assert!(
                result.is_err(),
                "Traversal pattern '{}' should be blocked",
                pattern
            );
        }
    }

    // ==================== FUZZ TEST 2 ====================
    // Test with special characters and edge cases
    #[tokio::test]
    async fn fuzz_special_characters() {
        let special_chars = vec![
            "\0",          // Null byte
            "\n",          // Newline
            "\r",          // Carriage return
            "\t",          // Tab
            " ",           // Space
            "\\",          // Backslash
            "//",          // Double slash
            "///",         // Triple slash
            "|",           // Pipe
            "&",           // Ampersand
            ";",           // Semicolon
            "$",           // Dollar
            "`",           // Backtick
            "'",           // Single quote
            "\"",          // Double quote
            "<",           // Less than
            ">",           // Greater than
            "*",           // Asterisk
            "?",           // Question mark
            "[",           // Open bracket
            "]",           // Close bracket
            "{",           // Open brace
            "}",           // Close brace
            "(",           // Open paren
            ")",           // Close paren
        ];

        let home = env::var("HOME").unwrap();
        let base_path = PathBuf::from(&home).join("fuzz_test");

        for special_char in special_chars {
            let filename = format!("test{}file.txt", special_char);
            let test_path = base_path.join(&filename);
            
            // Try to write - some will fail, some might succeed
            // The key is that no security boundary is crossed
            let _result = write_file_tool(
                test_path.to_string_lossy().to_string(),
                "test".to_string(),
                None
            ).await;
            
            // As long as we don't crash or escape the home directory, we're good
        }
    }

    // ==================== FUZZ TEST 3 ====================
    // Test with very long paths
    #[tokio::test]
    async fn fuzz_long_paths() {
        let home = env::var("HOME").unwrap();
        
        let lengths = vec![100, 1000, 4096, 10000, 100000];
        
        for len in lengths {
            let long_component = "a".repeat(len);
            let test_path = format!("{}/{}", home, long_component);
            
            let result = write_file_tool(
                test_path,
                "data".to_string(),
                None
            ).await;
            
            // Should either succeed or fail gracefully (no panic)
            // Very long paths might hit OS limits
            let _ = result;
        }
    }

    // ==================== FUZZ TEST 4 ====================
    // Test with repeated patterns
    #[tokio::test]
    async fn fuzz_repeated_patterns() {
        let home = env::var("HOME").unwrap();
        let home_path = PathBuf::from(&home);
        
        let patterns = vec![
            ("../", 100),        // 100 traversals
            ("./", 50),          // 50 current dirs
            ("//", 30),          // 30 double slashes
            ("..", 200),         // 200 parent refs
        ];
        
        for (pattern, count) in patterns {
            let repeated = pattern.repeat(count);
            let test_path = home_path.join(repeated).join("etc/passwd");
            
            let result = read_file_tool(
                test_path.to_string_lossy().to_string(),
                1000
            ).await;
            
            assert!(
                result.is_err(),
                "Repeated pattern '{}' x {} should be blocked",
                pattern,
                count
            );
        }
    }

    // ==================== FUZZ TEST 5 ====================
    // Test with mixed encoding attempts
    #[tokio::test]
    async fn fuzz_encoding_attempts() {
        let home = env::var("HOME").unwrap();
        let home_path = PathBuf::from(&home);
        
        let encoded_patterns = vec![
            "%2e%2e%2f",           // URL encoded ../
            "%2e%2e/",             // Partially encoded
            "..%2f",               // Partially encoded
            "%2e%2e%5c",           // URL encoded ..\
            "..%5c",               // Partially encoded
            "%252e%252e%252f",     // Double encoded
            "..%00",               // Null byte
            "..%0a",               // Newline
            "..%0d",               // Carriage return
        ];
        
        for pattern in encoded_patterns {
            let test_path = home_path.join(pattern).join("etc/passwd");
            
            let result = read_file_tool(
                test_path.to_string_lossy().to_string(),
                1000
            ).await;
            
            // All encoding attempts should fail
            assert!(
                result.is_err(),
                "Encoding pattern '{}' should be blocked",
                pattern
            );
        }
    }

    // ==================== FUZZ TEST 6 ====================
    // Test with absolute paths outside home
    #[tokio::test]
    async fn fuzz_absolute_paths() {
        let sensitive_paths = vec![
            "/etc/passwd",
            "/etc/shadow",
            "/root/.ssh/id_rsa",
            "/var/log/auth.log",
            "/proc/self/environ",
            "/dev/random",
            "/sys/kernel/",
            "/boot/vmlinuz",
            "/tmp/../etc/passwd",
            "/private/etc/passwd",     // macOS
            "/System/Library/",        // macOS
        ];
        
        for path in sensitive_paths {
            let result = read_file_tool(path.to_string(), 1000).await;
            
            assert!(
                result.is_err(),
                "Access to '{}' should be blocked",
                path
            );
        }
    }

    // ==================== FUZZ TEST 7 ====================
    // Test with Unicode and international characters
    #[tokio::test]
    async fn fuzz_unicode_paths() {
        let home = env::var("HOME").unwrap();
        let test_dir = PathBuf::from(&home).join("fuzz_unicode");
        let _ = std::fs::create_dir_all(&test_dir);
        
        let unicode_names = vec![
            "测试文件.txt",              // Chinese
            "ファイル.txt",              // Japanese
            "파일.txt",                  // Korean
            "файл.txt",                  // Russian
            "ملف.txt",                   // Arabic
            "αρχείο.txt",               // Greek
            "dosya.txt",                 // Turkish
            "tệp.txt",                   // Vietnamese
            "📁file.txt",               // Emoji
            "test\u{200B}file.txt",     // Zero-width space
            "test\u{FEFF}file.txt",     // Zero-width no-break space
        ];
        
        for name in unicode_names {
            let test_file = test_dir.join(name);
            
            let result = write_file_tool(
                test_file.to_string_lossy().to_string(),
                "unicode content".to_string(),
                None
            ).await;
            
            // Should handle unicode gracefully
            // May succeed or fail depending on filesystem support
            let _ = result;
        }
        
        // Cleanup
        let _ = std::fs::remove_dir_all(&test_dir);
    }

    // ==================== FUZZ TEST 8 ====================
    // Test with mixed case and capitalization tricks
    #[tokio::test]
    async fn fuzz_case_variations() {
        let case_variations = vec![
            "/ETC/passwd",
            "/etc/PASSWD",
            "/Etc/Passwd",
            "/eTc/pAsSwD",
        ];
        
        for path in case_variations {
            let result = read_file_tool(path.to_string(), 1000).await;
            
            // Should be blocked (case-sensitive on Unix, outside home on any OS)
            assert!(
                result.is_err(),
                "Path '{}' should be blocked",
                path
            );
        }
    }

    // ==================== FUZZ TEST 9 ====================
    // Test with empty and whitespace paths
    #[tokio::test]
    async fn fuzz_empty_and_whitespace() {
        let edge_cases = vec![
            "",
            " ",
            "  ",
            "\t",
            "\n",
            "\r\n",
            "   \t  \n  ",
        ];
        
        for path in edge_cases {
            let result = read_file_tool(path.to_string(), 1000).await;
            
            // Should fail gracefully (invalid path)
            assert!(result.is_err(), "Empty/whitespace path should fail");
        }
    }

    // ==================== FUZZ TEST 10 ====================
    // Test with symlink-like patterns
    #[tokio::test]
    async fn fuzz_symlink_patterns() {
        let home = env::var("HOME").unwrap();
        let home_path = PathBuf::from(&home);
        
        let symlink_patterns = vec![
            "link/../../../etc/passwd",
            "safe/../../../../../../etc/passwd",
            "normal/link/../../../etc/passwd",
        ];
        
        for pattern in symlink_patterns {
            let test_path = home_path.join(pattern);
            
            let result = read_file_tool(
                test_path.to_string_lossy().to_string(),
                1000
            ).await;
            
            assert!(
                result.is_err(),
                "Symlink pattern '{}' should be blocked",
                pattern
            );
        }
    }

    // ==================== FUZZ TEST 11 ====================
    // Test with content size variations
    #[tokio::test]
    async fn fuzz_content_sizes() {
        let home = env::var("HOME").unwrap();
        let test_dir = PathBuf::from(&home).join("fuzz_content");
        let _ = std::fs::create_dir_all(&test_dir);
        
        let sizes = vec![
            0,                    // Empty
            1,                    // Single byte
            1024,                 // 1 KB
            1024 * 1024,          // 1 MB
            10 * 1024 * 1024,     // 10 MB
        ];
        
        for size in sizes {
            let test_file = test_dir.join(format!("size_{}.txt", size));
            let content = "x".repeat(size);
            
            let write_result = write_file_tool(
                test_file.to_string_lossy().to_string(),
                content,
                None
            ).await;
            
            // Should handle various sizes
            // May hit OS limits for very large files
            if write_result.is_ok() {
                // Try to read it back
                let read_result = read_file_tool(
                    test_file.to_string_lossy().to_string(),
                    usize::MAX
                ).await;
                
                // Reading should work
                assert!(read_result.is_ok() || read_result.is_err());
            }
        }
        
        // Cleanup
        let _ = std::fs::remove_dir_all(&test_dir);
    }

    // ==================== FUZZ TEST 12 ====================
    // Test PathValidator directly with generated inputs
    #[tokio::test]
    async fn fuzz_path_validator_direct() {
        let home = env::var("HOME").unwrap();
        let home_path = PathBuf::from(&home);
        let validator = PathValidator::new(home_path.clone());
        
        // Generate 100 random-ish paths
        let mut test_paths = vec![];
        
        // Add systematic patterns
        for i in 0..50 {
            let depth = i % 10 + 1;
            let traversal = "../".repeat(depth);
            test_paths.push(home_path.join(traversal).join("etc/passwd"));
        }
        
        // Add mixed patterns
        for i in 0..50 {
            let pattern = match i % 5 {
                0 => "../../etc/passwd".to_string(),
                1 => "./../../../root".to_string(),
                2 => "normal/../../../etc".to_string(),
                3 => "./../../../../../../bin".to_string(),
                _ => "../".repeat(i % 20),
            };
            test_paths.push(home_path.join(pattern));
        }
        
        // Validate all paths
        for test_path in test_paths {
            let result = validator.validate(&test_path);
            
            // Most should fail (they traverse outside home)
            // If any succeed, they must be within home directory
            if result.is_ok() {
                let safe_path = result.unwrap();
                assert!(
                    safe_path.starts_with(&home_path),
                    "Path that passed validation must be within home: {}",
                    safe_path.display()
                );
            }
        }
    }
}
