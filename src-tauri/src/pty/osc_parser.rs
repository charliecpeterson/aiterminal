use std::time::{SystemTime, UNIX_EPOCH};

/// Parse RemoteHost OSC sequence
/// Format: ESC]1337;RemoteHost=user@host:ip;Depth=N BEL
/// Returns Some((user, host, ip)) if SSH, None if local
pub fn parse_remote_host_osc(data: &str) -> Option<Option<(String, String, Option<String>)>> {
    // Look for OSC 1337 RemoteHost sequence
    let prefix = "\x1b]1337;RemoteHost=";
    if let Some(start) = data.find(prefix) {
        let after_prefix = &data[start + prefix.len()..]; // Skip the prefix

        // Find terminator (BEL \x07 or ST \x1b\\)
        let end = after_prefix
            .find('\x07')
            .or_else(|| after_prefix.find("\x1b\\"))
            .unwrap_or(after_prefix.len());

        let value = &after_prefix[..end];

        // Split off optional parameters like ;Depth=N
        let remote_info = value.split(';').next().unwrap_or(value);

        if remote_info.is_empty() || remote_info == "local" {
            // Explicitly local
            return Some(None);
        }

        // Parse user@host:ip
        if let Some(at_pos) = remote_info.find('@') {
            let user = remote_info[..at_pos].to_string();
            let rest = &remote_info[at_pos + 1..];

            // Check for :ip suffix
            if let Some(colon_pos) = rest.rfind(':') {
                let host = rest[..colon_pos].to_string();
                let ip = rest[colon_pos + 1..].to_string();
                return Some(Some((user, host, Some(ip))));
            } else {
                return Some(Some((user, rest.to_string(), None)));
            }
        } else {
            // Just hostname, use current user
            let user = std::env::var("USER").unwrap_or_else(|_| "unknown".to_string());

            // Check for :ip suffix
            if let Some(colon_pos) = remote_info.rfind(':') {
                let host = remote_info[..colon_pos].to_string();
                let ip = remote_info[colon_pos + 1..].to_string();
                return Some(Some((user, host, Some(ip))));
            } else {
                return Some(Some((user, remote_info.to_string(), None)));
            }
        }
    }

    None
}

pub fn current_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
}
