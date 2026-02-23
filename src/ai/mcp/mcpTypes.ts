/**
 * MCP (Model Context Protocol) Type Definitions
 */

export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
  api_key_env_var?: string; // Environment variable name for API key (e.g., "BRAVE_API_KEY")
  api_key?: string; // The API key value (stored securely)
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolWithServer extends MCPTool {
  serverName: string;
}

export interface MCPCallResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
