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
    pub fn new(allowed_base: PathBuf) -> Self {
        PathValidator { allowed_base }
    }

    /// Validate a path and return its canonicalized form if safe.
    /// 
    /// # Security Checks
    /// 1. Rejects paths containing suspicious patterns (.. in raw form)
    /// 2. Expands ~ to home directory
    /// 3. Canonicalizes to resolve symlinks and relative components
    /// 4. Verifies the final path is within allowed_base
    /// 
    /// # Errors
    /// Returns an error if:
    /// - Path contains suspicious patterns
    /// - Path cannot be canonicalized
    /// - Path escapes the allowed base directory
    pub fn validate(&self, path: &Path) -> Result<PathBuf, String> {
        let path_str = path.to_str()
            .ok_or_else(|| "Invalid UTF-8 in path".to_string())?;

        // Reject obvious traversal attempts in raw path
        if path_str.contains("..") {
            return Err(format!("Path traversal detected: path contains '..' ({})", path_str));
        }

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
        let validator = PathValidator::new(test_dir);
        
        let result = validator.validate(Path::new("../../../etc/passwd"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Path traversal detected"));
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
        let validator = PathValidator::new(test_dir);
        
        let result = validator.validate(Path::new("test/../../../etc/passwd"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Path traversal detected"));
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
}
