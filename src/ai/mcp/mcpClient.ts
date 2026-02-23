/**
 * MCP Client Wrapper
 *
 * Wraps the MCP SDK client with lifecycle management and error handling.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MCPServerConfig, MCPTool, MCPCallResult } from './mcpTypes';
import { createLogger } from '../../utils/logger';

const log = createLogger('MCPClient');

export class MCPClientWrapper {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private connected: boolean = false;
  private tools: MCPTool[] = [];

  constructor(
    private config: MCPServerConfig,
    private workingDirectory?: string
  ) {
    this.client = new Client(
      {
        name: 'aiterminal',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
  }

  /**
   * Connect to the MCP server and discover available tools
   */
  async connect(): Promise<void> {
    if (this.connected) {
      log.warn(`MCP server ${this.config.name} already connected`);
      return;
    }

    try {
      log.info(`Connecting to MCP server: ${this.config.name}`);

      // Create transport with working directory
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: {
          ...process.env,
          ...this.config.env,
          // Set working directory for MCP server
          PWD: this.workingDirectory || process.cwd(),
        },
      });

      // Connect to server
      await this.client.connect(this.transport);
      this.connected = true;

      // Discover tools
      await this.discoverTools();

      log.info(`Connected to ${this.config.name}: ${this.tools.length} tools available`);
    } catch (error) {
      log.error(`Failed to connect to MCP server ${this.config.name}:`, error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Discover tools from the MCP server
   */
  private async discoverTools(): Promise<void> {
    try {
      const result = await this.client.listTools();
      this.tools = result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as Record<string, unknown>,
      }));
    } catch (error) {
      log.error(`Failed to discover tools from ${this.config.name}:`, error);
      this.tools = [];
    }
  }

  /**
   * Get all available tools from this server
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Check if this server provides a specific tool
   */
  hasTool(toolName: string): boolean {
    return this.tools.some((t) => t.name === toolName);
  }

  /**
   * Call a tool on this MCP server
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallResult> {
    if (!this.connected) {
      throw new Error(`MCP server ${this.config.name} is not connected`);
    }

    if (!this.hasTool(toolName)) {
      throw new Error(`Tool ${toolName} not found on server ${this.config.name}`);
    }

    try {
      log.debug(`Calling tool ${toolName} on ${this.config.name}`, { args });

      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      return result as MCPCallResult;
    } catch (error) {
      log.error(`Error calling tool ${toolName} on ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.close();
      this.connected = false;
      this.tools = [];
      log.info(`Disconnected from MCP server: ${this.config.name}`);
    } catch (error) {
      log.error(`Error disconnecting from ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get server name
   */
  getName(): string {
    return this.config.name;
  }
}
