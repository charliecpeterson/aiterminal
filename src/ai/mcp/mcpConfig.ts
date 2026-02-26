/**
 * Default MCP Server Configurations
 *
 * Provides sensible defaults for common MCP servers.
 */

import type { MCPServerConfig } from './mcpTypes';

/**
 * Get default MCP server configurations
 */
export function getDefaultMCPServers(): MCPServerConfig[] {
  return [
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
      enabled: false,  // DISABLED: Duplicate of PTY-based file tools which work in SSH/remote sessions
      description: 'File operations (read, write, list, search) - DISABLED: Use PTY tools instead',
    },
    // Git server not yet published to npm
    // {
    //   name: 'git',
    //   command: 'npx',
    //   args: ['-y', '@modelcontextprotocol/server-git'],
    //   enabled: false,
    //   description: 'Git operations (status, diff, log)',
    // },
    // Future servers (disabled by default)
    // {
    //   name: 'web-search',
    //   command: 'npx',
    //   args: ['-y', '@modelcontextprotocol/server-brave-search'],
    //   env: {
    //     BRAVE_API_KEY: process.env.BRAVE_API_KEY || '',
    //   },
    //   enabled: false,
    //   description: 'Web search using Brave Search API (requires API key)',
    // },
  ];
}

/**
 * Merge user-configured servers with defaults
 */
export function mergeMCPServerConfigs(
  userServers?: MCPServerConfig[]
): MCPServerConfig[] {
  if (!userServers || userServers.length === 0) {
    return getDefaultMCPServers();
  }

  const defaults = getDefaultMCPServers();
  const merged = new Map<string, MCPServerConfig>();

  // Add defaults
  for (const server of defaults) {
    merged.set(server.name, server);
  }

  // Override with user configs
  for (const server of userServers) {
    merged.set(server.name, server);
  }

  return Array.from(merged.values());
}
