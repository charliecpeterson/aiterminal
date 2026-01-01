use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const SSH_PROFILES_FILE: &str = ".config/aiterminal/ssh_profiles.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSHProfile {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tab_color: Option<String>,

    pub connection_type: ConnectionType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_config_host: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manual_config: Option<ManualSSHConfig>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub startup_commands: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_vars: Option<HashMap<String, String>>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_connect: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health_check_interval: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alert_on_disconnect: Option<bool>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_connected_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ConnectionType {
    SshConfig,
    Manual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualSSHConfig {
    pub hostname: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_jump: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSHConfigHost {
    pub host: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub identity_file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_jump: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub options: Option<HashMap<String, String>>,
}

/// Parse SSH config file and extract Host entries
pub fn parse_ssh_config() -> Result<Vec<SSHConfigHost>, String> {
    let home =
        std::env::var("HOME").map_err(|_| "Could not determine HOME directory".to_string())?;

    let config_path = PathBuf::from(home).join(".ssh/config");

    if !config_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read SSH config: {}", e))?;

    let mut hosts = Vec::new();
    let mut current_host: Option<SSHConfigHost> = None;
    let mut current_options: HashMap<String, String> = HashMap::new();

    for line in content.lines() {
        let line = line.trim();

        // Skip comments and empty lines
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let key = parts[0].to_lowercase();
        let value = parts.get(1..).map(|v| v.join(" "));

        match key.as_str() {
            "host" => {
                // Save previous host if exists
                if let Some(mut host) = current_host.take() {
                    if !current_options.is_empty() {
                        host.options = Some(current_options.clone());
                        current_options.clear();
                    }
                    hosts.push(host);
                }

                // Start new host
                if let Some(host_name) = value {
                    // Skip wildcard patterns
                    if !host_name.contains('*') && !host_name.contains('?') {
                        current_host = Some(SSHConfigHost {
                            host: host_name,
                            hostname: None,
                            user: None,
                            port: None,
                            identity_file: None,
                            proxy_jump: None,
                            options: None,
                        });
                    }
                }
            }
            "hostname" => {
                if let Some(ref mut host) = current_host {
                    host.hostname = value;
                }
            }
            "user" => {
                if let Some(ref mut host) = current_host {
                    host.user = value;
                }
            }
            "port" => {
                if let Some(ref mut host) = current_host {
                    if let Some(port_str) = value {
                        host.port = port_str.parse().ok();
                    }
                }
            }
            "identityfile" => {
                if let Some(ref mut host) = current_host {
                    if let Some(mut path) = value {
                        // Expand ~ to home directory
                        if path.starts_with("~/") {
                            path =
                                path.replacen("~", &std::env::var("HOME").unwrap_or_default(), 1);
                        }
                        host.identity_file = Some(path);
                    }
                }
            }
            "proxyjump" => {
                if let Some(ref mut host) = current_host {
                    host.proxy_jump = value;
                }
            }
            _ => {
                // Store other options
                if current_host.is_some() {
                    if let Some(val) = value {
                        current_options.insert(key.to_string(), val);
                    }
                }
            }
        }
    }

    // Don't forget the last host
    if let Some(mut host) = current_host {
        if !current_options.is_empty() {
            host.options = Some(current_options);
        }
        hosts.push(host);
    }

    Ok(hosts)
}

/// Get the path to SSH profiles file
fn get_ssh_profiles_path() -> Result<PathBuf, String> {
    let home =
        std::env::var("HOME").map_err(|_| "Could not determine HOME directory".to_string())?;
    Ok(PathBuf::from(home).join(SSH_PROFILES_FILE))
}

/// Tauri command: Get SSH config hosts
#[tauri::command]
pub async fn get_ssh_config_hosts() -> Result<Vec<SSHConfigHost>, String> {
    parse_ssh_config()
}

/// Tauri command: Save SSH profiles
#[tauri::command]
pub async fn save_ssh_profiles(profiles: Vec<SSHProfile>) -> Result<(), String> {
    let path = get_ssh_profiles_path()?;

    println!("[SSH] Saving {} profiles to {:?}", profiles.len(), path);

    // Ensure directory exists
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let json = serde_json::to_string_pretty(&profiles)
        .map_err(|e| format!("Failed to serialize profiles: {}", e))?;

    fs::write(&path, json).map_err(|e| format!("Failed to write profiles: {}", e))?;

    println!("[SSH] Successfully saved profiles");
    Ok(())
}

/// Tauri command: Load SSH profiles
#[tauri::command]
pub async fn load_ssh_profiles() -> Result<Vec<SSHProfile>, String> {
    let path = get_ssh_profiles_path()?;

    println!("[SSH] Loading profiles from {:?}", path);

    if !path.exists() {
        println!("[SSH] Profiles file doesn't exist, returning empty list");
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read profiles: {}", e))?;

    let profiles: Vec<SSHProfile> =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse profiles: {}", e))?;

    println!("[SSH] Loaded {} profiles", profiles.len());
    Ok(profiles)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_empty_config() {
        // Test with non-existent config
        let result = parse_ssh_config();
        assert!(result.is_ok());
    }
}
