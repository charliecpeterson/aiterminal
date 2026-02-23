use super::client::{MCPClient, MCPToolInfo};
use crate::models::{AppState, MCPServerConfig};
use std::collections::HashMap;

/// Initialize MCP servers based on provided configurations
#[tauri::command]
pub async fn init_mcp_servers(
    state: tauri::State<'_, AppState>,
    configs: Vec<MCPServerConfig>,
    working_directory: Option<String>,
) -> Result<Vec<String>, String> {
    let mut initialized_servers = Vec::new();
    let mut clients_map = HashMap::new();

    // Spawn enabled servers in parallel
    let mut spawn_tasks = Vec::new();
    for config in configs {
        if !config.enabled {
            continue;
        }

        let name = config.name.clone();
        let working_dir = working_directory.clone();
        let task = tokio::spawn(async move {
            MCPClient::spawn(&config, working_dir).await
        });
        spawn_tasks.push((name, task));
    }

    // Collect results
    for (name, task) in spawn_tasks {
        match task.await {
            Ok(Ok(client)) => {
                eprintln!("[MCP] Initialized server: {} ({} tools)", name, client.tools.len());
                clients_map.insert(name.clone(), client);
                initialized_servers.push(name);
            }
            Ok(Err(e)) => {
                eprintln!("[MCP] Failed to initialize server {}: {}", name, e);
            }
            Err(e) => {
                eprintln!("[MCP] Task failed for server {}: {}", name, e);
            }
        }
    }

    // Store in app state
    let mut mcp_clients = state.mcp_clients.lock().await;
    *mcp_clients = clients_map;

    Ok(initialized_servers)
}

/// List all available tools from all active MCP servers
#[tauri::command]
pub async fn list_mcp_tools(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<MCPToolInfo>, String> {
    let mcp_clients = state.mcp_clients.lock().await;

    let mut all_tools = Vec::new();
    for (server_name, client) in mcp_clients.iter() {
        if client.enabled {
            for tool in &client.tools {
                eprintln!("[MCP] Tool available: {} from server {}", tool.name, server_name);
                all_tools.push(tool.clone());
            }
        }
    }

    Ok(all_tools)
}

/// Call a specific MCP tool by name
#[tauri::command]
pub async fn call_mcp_tool(
    state: tauri::State<'_, AppState>,
    tool_name: String,
    params: serde_json::Value,
) -> Result<String, String> {
    let mcp_clients = state.mcp_clients.lock().await;

    // Find which server owns this tool
    for (_server_name, client) in mcp_clients.iter() {
        if client.enabled && client.tools.iter().any(|t| t.name == tool_name) {
            return client.call_tool(&tool_name, params).await
                .map_err(|e| e.to_string());
        }
    }

    Err(format!("MCP tool '{}' not found in any active server", tool_name))
}

/// Shutdown all MCP servers
#[tauri::command]
pub async fn shutdown_mcp_servers(
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let mut mcp_clients = state.mcp_clients.lock().await;

    let clients: Vec<_> = mcp_clients.drain().collect();

    for (name, client) in clients {
        if let Err(e) = client.shutdown().await {
            eprintln!("[MCP] Failed to shutdown server {}: {}", name, e);
        }
    }

    Ok(())
}
