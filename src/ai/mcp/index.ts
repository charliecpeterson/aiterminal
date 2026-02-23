/**
 * MCP (Model Context Protocol) Integration
 *
 * Provides MCP client functionality for consuming community MCP servers.
 */

export { MCPClientWrapper } from './mcpClient';
export { MCPManager } from './mcpManager';
export { getDefaultMCPServers, mergeMCPServerConfigs } from './mcpConfig';
export type {
  MCPServerConfig,
  MCPTool,
  MCPToolWithServer,
  MCPCallResult,
} from './mcpTypes';
