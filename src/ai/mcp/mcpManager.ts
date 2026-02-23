/**
 * MCP Manager
 *
 * Manages multiple MCP server connections and provides a unified interface
 * for tool discovery and execution.
 */

import { MCPClientWrapper } from './mcpClient';
import type { MCPServerConfig, MCPToolWithServer } from './mcpTypes';
import { createLogger } from '../../utils/logger';

const log = createLogger('MCPManager');

export class MCPManager {
  private clients: Map<string, MCPClientWrapper> = new Map();
  private toolCache: Map<string, { serverName: string; tool: any }> = new Map();
  private initialized: boolean = false;

  constructor(
    private serverConfigs: MCPServerConfig[],
    private workingDirectory?: string
  ) {}

  /**
   * Initialize all enabled MCP servers
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      log.warn('MCP Manager already initialized');
      return;
    }

    const enabledServers = this.serverConfigs.filter((s) => s.enabled);

    if (enabledServers.length === 0) {
      log.info('No MCP servers enabled');
      this.initialized = true;
      return;
    }

    log.info(`Initializing ${enabledServers.length} MCP servers`);

    // Connect to servers in parallel
    const connectionPromises = enabledServers.map(async (config) => {
      try {
        const client = new MCPClientWrapper(config, this.workingDirectory);
        await client.connect();
        this.clients.set(config.name, client);

        // Cache tools from this server
        const tools = client.getTools();
        for (const tool of tools) {
          // Handle tool name conflicts by prefixing with server name
          const toolKey = this.toolCache.has(tool.name)
            ? `${config.name}_${tool.name}` // Prefix if conflict
            : tool.name;

          this.toolCache.set(toolKey, {
            serverName: config.name,
            tool: tool,
          });
        }

        log.info(`✓ Connected to ${config.name} (${tools.length} tools)`);
      } catch (error) {
        log.error(`✗ Failed to connect to ${config.name}:`, error);
        // Continue with other servers even if one fails
      }
    });

    await Promise.allSettled(connectionPromises);

    this.initialized = true;
    log.info(`MCP Manager initialized: ${this.clients.size} servers, ${this.toolCache.size} tools`);
  }

  /**
   * Get all available MCP tools with server information
   */
  getAllTools(): MCPToolWithServer[] {
    return Array.from(this.toolCache.entries()).map(([toolName, { serverName, tool }]) => ({
      name: toolName,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverName,
    }));
  }

  /**
   * Check if a tool is provided by any MCP server
   */
  hasTool(toolName: string): boolean {
    return this.toolCache.has(toolName);
  }

  /**
   * Get the server that provides a specific tool
   */
  getToolServer(toolName: string): string | null {
    const cached = this.toolCache.get(toolName);
    return cached ? cached.serverName : null;
  }

  /**
   * Execute an MCP tool
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const cached = this.toolCache.get(toolName);
    if (!cached) {
      throw new Error(`MCP tool not found: ${toolName}`);
    }

    const client = this.clients.get(cached.serverName);
    if (!client || !client.isConnected()) {
      throw new Error(`MCP server not connected: ${cached.serverName}`);
    }

    try {
      const result = await client.callTool(cached.tool.name, args);

      // Extract text content from MCP result
      if (result.content && Array.isArray(result.content)) {
        const textContent = result.content
          .filter((c) => c.type === 'text' && c.text)
          .map((c) => c.text)
          .join('\n');

        return textContent || JSON.stringify(result);
      }

      return JSON.stringify(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error calling MCP tool ${toolName}:`, error);
      throw new Error(`MCP tool error: ${errorMsg}`);
    }
  }

  /**
   * Update working directory for all connected servers
   * Note: This requires reconnecting servers as most don't support hot-reload
   */
  async updateWorkingDirectory(newCwd: string): Promise<void> {
    this.workingDirectory = newCwd;
    log.info(`Updated working directory to: ${newCwd}`);
    // Note: Would need to reconnect servers to apply new cwd
    // For now, just update the cached value for future connections
  }

  /**
   * Get current working directory
   */
  getWorkingDirectory(): string | undefined {
    return this.workingDirectory;
  }

  /**
   * Get connection status
   */
  getStatus(): {
    initialized: boolean;
    connectedServers: number;
    totalTools: number;
    servers: Array<{ name: string; connected: boolean; toolCount: number }>;
  } {
    const servers = Array.from(this.clients.entries()).map(([name, client]) => ({
      name,
      connected: client.isConnected(),
      toolCount: client.getTools().length,
    }));

    return {
      initialized: this.initialized,
      connectedServers: servers.filter((s) => s.connected).length,
      totalTools: this.toolCache.size,
      servers,
    };
  }

  /**
   * Cleanup: disconnect all clients
   */
  async dispose(): Promise<void> {
    log.info('Disposing MCP Manager...');

    const disconnectPromises = Array.from(this.clients.entries()).map(
      async ([name, client]) => {
        try {
          await client.disconnect();
          log.info(`Disconnected: ${name}`);
        } catch (error) {
          log.error(`Error disconnecting ${name}:`, error);
        }
      }
    );

    await Promise.allSettled(disconnectPromises);

    this.clients.clear();
    this.toolCache.clear();
    this.initialized = false;

    log.info('MCP Manager disposed');
  }

  /**
   * Check if manager is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
