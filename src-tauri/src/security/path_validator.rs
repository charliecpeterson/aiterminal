use std::path::{Path, PathBuf};
use std::env;
use std::fs;

/// PathValidator ensures file operations stay within allowed directories
/// and prevents path traversal attacks.
pub struct PathValidator {
    allowed_base: PathBuf,
}

impl PathValidator {
    /// Create a new PathValidator with the specified base directory.
    /// All validated paths must be within this base directory.
    /// The base directory itself is canonicalized to ensure consistent checks.
    pub fn new(allowed_base: PathBuf) -> Self {
        // Canonicalize the allowed base to ensure consistent boundary checks
        let canonical_base = fs::canonicalize(&allowed_base)
            .unwrap_or_else(|_| allowed_base.clone());
        
        PathValidator { 
            allowed_base: canonical_base 
        }
    }

    /// Validate a path and return its canonicalized form if safe.
    /// 
    /// # Security Checks
    /// 1. Expands ~ to home directory
    /// 2. Converts to absolute path
    /// 3. Canonicalizes to resolve symlinks and relative components (including ..)
    /// 4. Verifies the canonical path is within allowed_base
    /// 
    /// # Important Security Note
    /// This function canonicalizes BEFORE checking for path traversal.
    /// This prevents bypasses via symlinks or encoded path separators.
    /// The final canonical path must be within allowed_base.
    /// 
    /// # Errors
    /// Returns an error if:
    /// - Path cannot be canonicalized (including non-existent paths)
    /// - Path escapes the allowed base directory after canonicalization
    pub fn validate(&self, path: &Path) -> Result<PathBuf, String> {
        let path_str = path.to_str()
            .ok_or_else(|| "Invalid UTF-8 in path".to_string())?;

        // Expand ~ to home directory
        let expanded_path = if path_str.starts_with("~/") {
            let home = env::var("HOME")
                .map_err(|_| "Could not determine home directory".to_string())?;
            PathBuf::from(home).join(&path_str[2..])
        } else if path_str == "~" {
            PathBuf::from(env::var("HOME")
                .map_err(|_| "Could not determine home directory".to_string())?)
        } else {
            path.to_path_buf()
        };

        // Convert to absolute path if relative
        let absolute_path = if expanded_path.is_absolute() {
            expanded_path
        } else {
            env::current_dir()
                .map_err(|e| format!("Could not determine current directory: {}", e))?
                .join(expanded_path)
        };

        // For new files that don't exist yet, validate the parent directory
        let path_to_validate = if !absolute_path.exists() {
            // Check if parent exists
            if let Some(parent) = absolute_path.parent() {
                if parent.exists() {
                    // Validate parent directory
                    let canonical_parent = fs::canonicalize(parent)
                        .map_err(|e| format!("Could not canonicalize parent directory: {}", e))?;
                    
                    // Check parent is within allowed base
                    if !canonical_parent.starts_with(&self.allowed_base) {
                        return Err(format!(
                            "Access denied: parent directory outside allowed base\nPath: {}\nAllowed base: {}",
                            canonical_parent.display(),
                            self.allowed_base.display()
                        ));
                    }
                    
                    // Return the intended path (parent + filename)
                    return Ok(canonical_parent.join(absolute_path.file_name()
                        .ok_or_else(|| "Invalid file path".to_string())?));
                } else {
                    return Err(format!("Parent directory does not exist: {}", parent.display()));
                }
            } else {
                return Err("Invalid path: no parent directory".to_string());
            }
        } else {
            absolute_path
        };

        // Canonicalize to resolve symlinks and normalize
        let canonical_path = fs::canonicalize(&path_to_validate)
            .map_err(|e| format!("Could not canonicalize path: {}", e))?;

        // Verify the canonical path is within allowed base
        if !canonical_path.starts_with(&self.allowed_base) {
            return Err(format!(
                "Access denied: path outside allowed base\nPath: {}\nAllowed base: {}",
                canonical_path.display(),
                self.allowed_base.display()
            ));
        }

        Ok(canonical_path)
    }
}

/// Get the default allowed base directory (user's home directory).
/// All file operations should be restricted to this directory by default.
pub fn get_allowed_base() -> PathBuf {
    env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            // Fallback to current directory if HOME not set
            env::current_dir().unwrap_or_else(|_| PathBuf::from("/tmp"))
        })
}

/// Convenience function to validate a path using the default allowed base.
pub fn validate_path(path: &Path) -> Result<PathBuf, String> {
    let validator = PathValidator::new(get_allowed_base());
    validator.validate(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, File};
    use std::io::Write;

    fn setup_test_dir() -> PathBuf {
        let test_dir = env::temp_dir().join("path_validator_tests");
        let _ = fs::remove_dir_all(&test_dir); // Clean up any previous test
        fs::create_dir_all(&test_dir).unwrap();
        test_dir
    }

    #[test]
    fn test_valid_relative_path() {
        let test_dir = setup_test_dir();
        let test_file = test_dir.join("test.txt");
        File::create(&test_file).unwrap();

        let validator = PathValidator::new(test_dir.clone());
        
        // Change to test directory
        let original_dir = env::current_dir().unwrap();
        env::set_current_dir(&test_dir).unwrap();
        
        let result = validator.validate(Path::new("test.txt"));
        
        // Restore original directory
        env::set_current_dir(original_dir).unwrap();
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_file);
    }

    #[test]
    fn test_valid_absolute_path() {
        let test_dir = setup_test_dir();
        let test_file = test_dir.join("test.txt");
        File::create(&test_file).unwrap();

        let validator = PathValidator::new(test_dir.clone());
        let result = validator.validate(&test_file);
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_file);
    }

    #[test]
    fn test_reject_parent_traversal() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        let result = validator.validate(Path::new("../../../etc/passwd"));
        assert!(result.is_err());
        // After canonicalization, this should fail because it's outside allowed base
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("Access denied") || err_msg.contains("Could not canonicalize"));
    }

    #[test]
    fn test_reject_absolute_path_outside_base() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir);
        
        let result = validator.validate(Path::new("/etc/passwd"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Access denied"));
    }

    #[test]
    fn test_reject_hidden_traversal() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        // Create test.txt so the path can be canonicalized
        let test_file = test_dir.join("test.txt");
        File::create(&test_file).unwrap();
        
        // This path contains .. which will be resolved during canonicalization
        // If it resolves outside allowed base, it should be rejected
        let traversal_path = test_dir.join("test/../../../etc/passwd");
        let result = validator.validate(&traversal_path);
        assert!(result.is_err());
        // Should fail during canonicalization or boundary check
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("Access denied") || err_msg.contains("Could not canonicalize"));
    }

    #[test]
    fn test_new_file_with_valid_parent() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        let new_file = test_dir.join("new_file.txt");
        let result = validator.validate(&new_file);
        
        assert!(result.is_ok());
        let validated_path = result.unwrap();
        assert!(validated_path.starts_with(&test_dir));
    }

    #[test]
    fn test_new_file_with_invalid_parent() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir);
        
        let new_file = PathBuf::from("/etc/new_file.txt");
        let result = validator.validate(&new_file);
        
        assert!(result.is_err());
    }

    #[test]
    fn test_tilde_expansion() {
        let home_dir = env::var("HOME").unwrap();
        let validator = PathValidator::new(PathBuf::from(&home_dir));
        
        // Create a test file in home directory
        let test_file = PathBuf::from(&home_dir).join(".path_validator_test");
        File::create(&test_file).unwrap();
        
        let result = validator.validate(Path::new("~/.path_validator_test"));
        
        // Clean up
        let _ = fs::remove_file(&test_file);
        
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_file);
    }

    #[test]
    fn test_symlink_attack() {
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

    #[test]
    fn test_canonicalize_before_validate() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        // Create a test file
        let test_file = test_dir.join("safe.txt");
        File::create(&test_file).unwrap();
        
        // Create a path with .. that stays within bounds after canonicalization
        let subdir = test_dir.join("subdir");
        fs::create_dir(&subdir).unwrap();
        
        let safe_link = subdir.join("safe.txt");
        File::create(&safe_link).unwrap();
        
        // Path: test_dir/subdir/../safe.txt -> should resolve to test_dir/safe.txt
        let path_with_dotdot = subdir.join("../safe.txt");
        let result = validator.validate(&path_with_dotdot);
        
        // Should succeed because after canonicalization, it's still within test_dir
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), test_file);
    }

    #[test]
    fn test_symlink_chain_attack() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            
            // Create a chain: link1 -> link2 -> /etc/passwd
            let link1 = test_dir.join("link1");
            let link2 = test_dir.join("link2");
            let target = PathBuf::from("/etc/passwd");
            
            let _ = symlink(&target, &link2);
            let _ = symlink(&link2, &link1);
            
            let result = validator.validate(&link1);
            
            // Should reject because chain ultimately resolves outside allowed base
            assert!(result.is_err());
            assert!(result.unwrap_err().contains("Access denied"));
        }
    }

    #[test]
    fn test_symlink_within_bounds() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        #[cfg(unix)]
        {
            use std::os::unix::fs::symlink;
            
            // Create a file and a symlink both within test_dir
            let target_file = test_dir.join("target.txt");
            File::create(&target_file).unwrap();
            
            let symlink_path = test_dir.join("link_to_target");
            let _ = symlink(&target_file, &symlink_path);
            
            let result = validator.validate(&symlink_path);
            
            // Should succeed because symlink resolves within allowed base
            assert!(result.is_ok());
            assert_eq!(result.unwrap(), target_file);
        }
    }

    #[test]
    fn test_relative_path_with_dotdot_outside_base() {
        let test_dir = setup_test_dir();
        let validator = PathValidator::new(test_dir.clone());
        
        // Try to escape using relative path
        // From test_dir, go up three levels then to /etc/passwd
        let evil_path = test_dir.join("../../../etc/passwd");
        let result = validator.validate(&evil_path);
        
        // Should reject because canonicalized path is outside allowed base
        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("Access denied") || err_msg.contains("Could not canonicalize"));
    }
}
