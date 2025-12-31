use serde::{Deserialize, Serialize};
use regex::Regex;
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SecretFinding {
    pub secret_type: String,
    pub line: usize,
    pub preview: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    pub has_secrets: bool,
    pub findings: Vec<SecretFinding>,
    pub redacted_content: String,
}

#[tauri::command]
pub async fn scan_content_for_secrets(content: String, _app: tauri::AppHandle) -> Result<ScanResult, String> {
    Ok(scan_with_patterns(&content))
}

/// Calculate Shannon entropy (bits per character) for a string
fn calculate_entropy(s: &str) -> f64 {
    if s.is_empty() {
        return 0.0;
    }
    
    let mut frequency = HashMap::new();
    let len = s.len() as f64;
    
    for c in s.chars() {
        *frequency.entry(c).or_insert(0.0) += 1.0;
    }
    
    let mut entropy = 0.0;
    for count in frequency.values() {
        let probability = count / len;
        entropy -= probability * probability.log2();
    }
    
    entropy
}

/// Check if a string has high entropy (likely random/secret-like)
fn is_high_entropy(s: &str, min_length: usize, threshold: f64) -> bool {
    s.len() >= min_length && calculate_entropy(s) >= threshold
}

fn scan_with_patterns(content: &str) -> ScanResult {
    // Specific secret patterns (high confidence)
    let specific_patterns = vec![
        // OpenAI keys
        (r"sk-proj-[a-zA-Z0-9_-]{20,}", "openai_project_key"),
        (r"sk-[a-zA-Z0-9_-]{20,}", "openai_key"),
        
        // Anthropic
        (r"sk-ant-[a-zA-Z0-9-]{95}", "anthropic_key"),
        
        // AWS
        (r"AKIA[0-9A-Z]{16}", "aws_access_key"),
        (r#"(?i)aws(.{0,20})?['""][0-9a-zA-Z/+]{40}['""]"#, "aws_secret_key"),
        
        // GitHub
        (r"ghp_[a-zA-Z0-9]{36}", "github_personal_token"),
        (r"gho_[a-zA-Z0-9]{36}", "github_oauth_token"),
        (r"ghs_[a-zA-Z0-9]{36}", "github_app_token"),
        (r"ghr_[a-zA-Z0-9]{36}", "github_refresh_token"),
        
        // Slack
        (r"xox[pboa]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}", "slack_token"),
        
        // Bearer tokens
        (r"Bearer\s+[a-zA-Z0-9_\-\.=]{20,}", "bearer_token"),
        
        // Private keys
        (r"-----BEGIN (RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----", "private_key"),
        
        // JWT tokens
        (r"eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}", "jwt_token"),
        
        // Generic 32+ char hex (API keys, tokens)
        (r"\b[0-9a-f]{32,}\b", "hex_secret"),
        
        // Base64 encoded secrets (at least 20 chars)
        (r"\b[A-Za-z0-9+/]{20,}={0,2}\b", "base64_secret"),
    ];
    
    // Keyword-based patterns (gitleaks-style: identifier + operator + secret)
    let keyword_patterns = vec![
        (
            r#"(?i)(api[_-]?key|apikey|secret[_-]?key|auth[_-]?token|password|passwd|pwd|access[_-]?token|bearer[_-]?token|client[_-]?secret)\s*[=:]\s*['"]?([a-zA-Z0-9_\-\.\/+]{16,})['"]?"#,
            "keyword_secret"
        ),
    ];
    
    let mut findings = Vec::new();
    let mut redacted = content.to_string();
    let mut already_found = std::collections::HashSet::new();
    
    // Scan with specific patterns
    for (pattern_str, secret_type) in specific_patterns {
        let re = match Regex::new(pattern_str) {
            Ok(r) => r,
            Err(_) => continue,
        };
        
        for (line_num, line) in content.lines().enumerate() {
            for mat in re.find_iter(line) {
                let secret_text = mat.as_str();
                
                // Skip if already found
                if already_found.contains(secret_text) {
                    continue;
                }
                
                // Skip if this secret is a substring of an already-found secret
                let is_substring = already_found.iter().any(|existing: &String| existing.contains(secret_text));
                if is_substring {
                    continue;
                }
                
                // For base64/hex patterns, check entropy to reduce false positives
                if secret_type == "base64_secret" || secret_type == "hex_secret" {
                    if !is_high_entropy(secret_text, 20, 3.5) {
                        continue;
                    }
                }
                
                already_found.insert(secret_text.to_string());
                
                let preview = if secret_text.len() > 10 {
                    format!("{}...", &secret_text[..10])
                } else {
                    secret_text.to_string()
                };
                
                findings.push(SecretFinding {
                    secret_type: secret_type.to_string(),
                    line: line_num + 1,
                    preview,
                });
                
                // Redact
                let redaction_label = format!("[REDACTED_{}]", secret_type.to_uppercase());
                redacted = redacted.replace(secret_text, &redaction_label);
            }
        }
    }
    
    // Scan with keyword patterns (captures group 2)
    for (pattern_str, secret_type) in keyword_patterns {
        let re = match Regex::new(pattern_str) {
            Ok(r) => r,
            Err(_) => continue,
        };
        
        for (line_num, line) in content.lines().enumerate() {
            for cap in re.captures_iter(line) {
                if let Some(secret_match) = cap.get(2) {
                    let secret_text = secret_match.as_str();
                    
                    // Skip if already found
                    if already_found.contains(secret_text) {
                        continue;
                    }
                    
                    // Skip if this secret is a substring of an already-found secret
                    let is_substring = already_found.iter().any(|existing: &String| existing.contains(secret_text));
                    if is_substring {
                        continue;
                    }
                    
                    // Must have high entropy to be considered a secret
                    if !is_high_entropy(secret_text, 16, 3.5) {
                        continue;
                    }
                    
                    already_found.insert(secret_text.to_string());
                    
                    let preview = if secret_text.len() > 10 {
                        format!("{}...", &secret_text[..10])
                    } else {
                        secret_text.to_string()
                    };
                    
                    findings.push(SecretFinding {
                        secret_type: secret_type.to_string(),
                        line: line_num + 1,
                        preview,
                    });
                    
                    // Redact
                    let redaction_label = format!("[REDACTED_{}]", secret_type.to_uppercase());
                    redacted = redacted.replace(secret_text, &redaction_label);
                }
            }
        }
    }
    
    // High-entropy scan for any long strings (catches unknown secret types)
    let re = Regex::new(r"[a-zA-Z0-9_\-\.\/+]{20,}").unwrap();
    for (line_num, line) in content.lines().enumerate() {
        for mat in re.find_iter(line) {
            let text = mat.as_str();
            
            // Skip if already found
            if already_found.contains(text) {
                continue;
            }
            
            // Skip if this secret is a substring of an already-found secret
            let is_substring = already_found.iter().any(|existing: &String| existing.contains(text));
            if is_substring {
                continue;
            }
            
            // High entropy threshold for generic detection
            if is_high_entropy(text, 20, 4.0) {
                already_found.insert(text.to_string());
                
                let preview = if text.len() > 10 {
                    format!("{}...", &text[..10])
                } else {
                    text.to_string()
                };
                
                findings.push(SecretFinding {
                    secret_type: "high_entropy_string".to_string(),
                    line: line_num + 1,
                    preview,
                });
                
                let redaction_label = "[REDACTED_HIGH_ENTROPY_STRING]";
                redacted = redacted.replace(text, redaction_label);
            }
        }
    }
    
    ScanResult {
        has_secrets: !findings.is_empty(),
        findings,
        redacted_content: redacted,
    }
}
