use std::fmt;

#[derive(Debug)]
pub enum MCPError {
    SpawnFailed(String),
    CommunicationError(String),
    ToolNotFound(String),
    Timeout(String),
    InvalidResponse(String),
    ServerShutdown(String),
}

impl fmt::Display for MCPError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MCPError::SpawnFailed(msg) => write!(f, "Failed to spawn MCP server: {}", msg),
            MCPError::CommunicationError(msg) => write!(f, "MCP communication error: {}", msg),
            MCPError::ToolNotFound(msg) => write!(f, "MCP tool not found: {}", msg),
            MCPError::Timeout(msg) => write!(f, "MCP timeout: {}", msg),
            MCPError::InvalidResponse(msg) => write!(f, "Invalid MCP response: {}", msg),
            MCPError::ServerShutdown(msg) => write!(f, "MCP server shutdown: {}", msg),
        }
    }
}

impl std::error::Error for MCPError {}

impl From<MCPError> for String {
    fn from(error: MCPError) -> String {
        error.to_string()
    }
}
