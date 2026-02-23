use super::errors::MCPError;
use crate::models::MCPServerConfig;
use rmcp::model::{CallToolRequestParams, ClientInfo};
use rmcp::service::{RoleClient, RunningService};
use rmcp::transport::TokioChildProcess;
use rmcp::{ClientHandler, ServiceExt};
use serde_json::Value;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

/// Simple client handler for MCP connections
#[derive(Clone, Debug, Default)]
struct SimpleClientHandler {
    info: ClientInfo,
}

impl SimpleClientHandler {
    fn new(_server_name: &str) -> Self {
        Self {
            info: Default::default(),
        }
    }
}

impl ClientHandler for SimpleClientHandler {
    fn get_info(&self) -> ClientInfo {
        self.info.clone()
    }
}

pub struct MCPClient {
    pub server_name: String,
    pub service: RunningService<RoleClient, SimpleClientHandler>,
    pub tools: Vec<MCPToolInfo>,
    pub enabled: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MCPToolInfo {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Value,
}

impl MCPClient {
    /// Spawn a new MCP server process and initialize the client
    pub async fn spawn(
        config: &MCPServerConfig,
        working_dir: Option<String>,
    ) -> Result<Self, MCPError> {
        let server_name = config.name.clone();

        // Build the command with args
        let mut cmd = Command::new(&config.command);

        // Add command arguments
        for arg in &config.args {
            cmd.arg(arg);
        }

        // Set stdio pipes for MCP communication
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit());

        // Set working directory if provided
        if let Some(ref dir) = working_dir {
            cmd.current_dir(dir);
            cmd.env("WORKING_DIRECTORY", dir);
        }

        // Add custom environment variables
        for (key, value) in &config.env {
            cmd.env(key, value);
        }

        // Create MCP client via stdio transport
        let transport = TokioChildProcess::new(cmd)
            .map_err(|e| MCPError::SpawnFailed(format!("Failed to create transport: {}", e)))?;

        // Create handler and connect
        let handler = SimpleClientHandler::new(&server_name);
        let service = handler
            .serve(transport)
            .await
            .map_err(|e| MCPError::SpawnFailed(format!("Failed to start MCP service: {}", e)))?;

        // List available tools
        let tools = Self::list_tools(&service).await?;

        eprintln!(
            "[MCP] Successfully initialized server '{}' with {} tools",
            server_name,
            tools.len()
        );

        Ok(Self {
            server_name,
            service,
            tools,
            enabled: config.enabled,
        })
    }

    /// List available tools from the MCP server
    async fn list_tools(
        service: &RunningService<RoleClient, SimpleClientHandler>,
    ) -> Result<Vec<MCPToolInfo>, MCPError> {
        let result = service
            .list_tools(Default::default())
            .await
            .map_err(|e| MCPError::CommunicationError(format!("Failed to list tools: {}", e)))?;

        let mut tools: Vec<MCPToolInfo> = Vec::new();
        for tool in result.tools {
            tools.push(MCPToolInfo {
                name: tool.name.into_owned(),
                description: tool.description.map(|s| s.into_owned()),
                input_schema: Value::Object(tool.input_schema.as_ref().clone()),
            });
        }

        Ok(tools)
    }

    /// Call a tool on the MCP server
    pub async fn call_tool(&self, tool_name: &str, params: Value) -> Result<String, MCPError> {
        // Verify tool exists
        if !self.tools.iter().any(|t| t.name == tool_name) {
            return Err(MCPError::ToolNotFound(format!(
                "Tool '{}' not found in server '{}'",
                tool_name, self.server_name
            )));
        }

        // Build request params
        let arguments = if let Value::Object(map) = params {
            Some(map)
        } else {
            None
        };

        let request = CallToolRequestParams {
            name: tool_name.to_string().into(),
            arguments,
            task: None,
            meta: None,
        };

        // Call with 30s timeout
        let result = tokio::time::timeout(Duration::from_secs(30), self.service.call_tool(request))
            .await
            .map_err(|_| MCPError::Timeout(format!("Tool '{}' timed out after 30s", tool_name)))?
            .map_err(|e| MCPError::CommunicationError(format!("Tool call failed: {}", e)))?;

        // Extract text content from result
        let mut text_parts: Vec<String> = Vec::new();
        for annotated_content in result.content {
            match &annotated_content.raw {
                rmcp::model::RawContent::Text(text_content) => {
                    text_parts.push(text_content.text.to_string());
                }
                _ => {
                    // Ignore non-text content
                }
            }
        }

        if text_parts.is_empty() {
            return Err(MCPError::InvalidResponse(
                "No text content in response".to_string(),
            ));
        }

        Ok(text_parts.join("\n"))
    }

    /// Shutdown the MCP server
    pub async fn shutdown(self) -> Result<(), MCPError> {
        // Cancel the service, which will close the transport and shut down the server
        self.service.cancel();
        Ok(())
    }
}
