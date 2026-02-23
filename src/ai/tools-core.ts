/**
 * Core Tools - PTY-Based & Custom Logic
 *
 * These are the tools that provide unique value and cannot be replaced by MCP servers:
 * 1. PTY execution (respects SSH, containers, remote sessions)
 * 2. Custom analysis tools (error analysis, log parsing)
 * 3. PTY-aware helpers (shell history, current directory)
 * 4. System tools (processes, ports, environment)
 */

import { tool } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { executeInPty } from '../terminal/core/executeInPty';
import { getTerminalCwd } from './tools-vercel';
import { isCommandSafe } from './commandSafety';
import type { PendingApproval } from '../context/AIContext';
import { createLogger } from '../utils/logger';

const log = createLogger('CoreTools');

const COMMAND_TIMEOUT_QUICK_MS = 10_000;
const COMMAND_TIMEOUT_DEFAULT_MS = 30_000;

// Helper to shell-escape arguments
function shellEscape(str: string): string {
  if (!str) return "''";
  return `'${str.replace(/'/g, "'\\''")}'`;
}

// Helper to truncate large results
function truncateToolResult(result: string, maxChars: number = 8000): string {
  if (result.length <= maxChars) {
    return result;
  }

  const truncateAt = 3000;
  const lastNewline = result.lastIndexOf('\n', truncateAt);
  const cutPoint = lastNewline > 0 && lastNewline > truncateAt - 200 ? lastNewline : truncateAt;

  const truncated = result.substring(0, cutPoint);
  const remaining = result.length - cutPoint;

  return `${truncated}\n\n... [TRUNCATED: ${remaining} more characters. Use file_sections for specific line ranges.]`;
}

// Helper to execute command in PTY
async function executeCommand(command: string, terminalId: number): Promise<string> {
  const timeoutMs = COMMAND_TIMEOUT_DEFAULT_MS;

  try {
    const result = await executeInPty({
      terminalId,
      command,
      timeoutMs,
    });
    return result.output || '(no output)';
  } catch (error) {
    return `Error: ${error}`;
  }
}

// Helper for approval requests
async function requestApproval(params: {
  command: string;
  description?: string;
  terminalId: number;
  cwd?: string;
  reason: string;
  category: string;
  onPendingApproval?: (approval: PendingApproval) => void;
}): Promise<string> {
  const { command, description, terminalId, cwd, reason, category, onPendingApproval } = params;

  if (!onPendingApproval) {
    throw new Error('Approval required but handler is not available');
  }

  const approval: PendingApproval = {
    id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    command,
    description,
    reason,
    category,
    terminalId,
    cwd,
    timestamp: Date.now(),
  };

  return new Promise((_, reject) => {
    // Create approval promise (implementation matches existing pattern)
    onPendingApproval(approval);
    // Note: Actual resolution happens via approval handlers in AIContext
    setTimeout(() => reject(new Error('Approval timeout')), 600000); // 10 min
  });
}

/**
 * Create core PTY-based tools
 */
export function createCoreTools(
  requireApproval: boolean = true,
  onPendingApproval?: (approval: PendingApproval) => void
) {
  /**
   * Helper to get the current active terminal ID from Rust backend.
   */
  const getActiveTerminalId = async (): Promise<number> => {
    try {
      const id = await invoke<number>('get_active_terminal');
      log.debug('Using terminal ID:', id);
      return id;
    } catch (error) {
      throw new Error(`No active terminal found: ${error}`);
    }
  };

  /**
   * Helper to get the current working directory of the active terminal.
   */
  const getCwd = async (): Promise<string> => {
    const terminalId = await getActiveTerminalId();
    return await getTerminalCwd(terminalId);
  };

  return {
    // ==================== PTY EXECUTION (CORE VALUE!) ====================

    execute_command: tool({
      description: `Execute a shell command in the active PTY terminal session.

CRITICAL: This runs commands WHERE THE TERMINAL IS - respects SSH sessions, containers, SLURM jobs, etc.
Commands execute in the user's active terminal environment, not locally.

IMPORTANT:
- Commands run in the user's current directory
- Destructive commands require approval
- Use get_current_directory first if unsure of location

Examples:
- Check Python version: python --version
- List files: ls -la
- Install package: pip install requests
- Run tests: npm test`,
      inputSchema: z.object({
        command: z.string().describe('Shell command to execute (e.g., "ls -la", "python --version")'),
      }),
      execute: async ({ command }) => {
        const terminalId = await getActiveTerminalId();

        // Check if command requires approval
        if (requireApproval && onPendingApproval) {
          const safetyCheck = isCommandSafe(command);
          if (!safetyCheck.isSafe) {
            const cwd = await getCwd();

            try {
              const result = await requestApproval({
                command,
                terminalId,
                cwd,
                reason: safetyCheck.reason || 'Unknown risk',
                category: safetyCheck.category || 'unknown',
                onPendingApproval,
              });
              return result;
            } catch (error) {
              return `Command not executed: ${error instanceof Error ? error.message : 'User cancelled'}`;
            }
          }
        }

        const output = await executeCommand(command, terminalId);
        return truncateToolResult(output);
      },
    }),

    get_current_directory: tool({
      description: `Get the current working directory of the active PTY terminal session.

Returns the directory where commands will execute. Essential for understanding context
before running file operations or other commands.

Use this when:
- User mentions files without full paths
- Before destructive operations
- To understand the working context`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const terminalId = await getActiveTerminalId();
          const result = await executeInPty({
            terminalId,
            command: 'pwd',
            timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
          });
          return result.output.trim();
        } catch (error) {
          return `Error getting current directory: ${error}`;
        }
      },
    }),

    get_shell_history: tool({
      description: `Get recent shell command history from the active terminal.

Returns commands the user has run recently. Useful for:
- Understanding what the user was doing
- Finding commands that failed
- Suggesting similar commands

Note: Filters out sensitive commands (sudo with passwords, API keys, etc.)`,
      inputSchema: z.object({
        limit: z.number().optional().describe('Number of commands to return (default: 20)'),
        filter: z.string().optional().describe('Filter commands containing this string'),
      }),
      execute: async ({ limit, filter }) => {
        const terminalId = await getActiveTerminalId();
        const historyLimit = limit || 20;

        try {
          // Use fc command to get history (works in bash and zsh)
          let cmd = `fc -ln -${historyLimit}`;
          if (filter) {
            cmd += ` | grep ${shellEscape(filter)}`;
          }

          const result = await executeInPty({
            terminalId,
            command: cmd,
            timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
          });

          // Filter out sensitive commands
          const lines = result.output
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .filter((line) => {
              // Filter out commands with potential secrets
              const lower = line.toLowerCase();
              return (
                !lower.includes('password') &&
                !lower.includes('api_key') &&
                !lower.includes('secret') &&
                !lower.includes('token=')
              );
            });

          return lines.join('\n') || 'No recent commands found';
        } catch (error) {
          return `Error getting shell history: ${error}`;
        }
      },
    }),

    // ==================== CUSTOM ANALYSIS TOOLS ====================

    analyze_error: tool({
      description: `Smart error analysis - extracts file paths, line numbers, error types, and suggests fixes.

Parses error messages to identify:
- Files involved in the error
- Line numbers where errors occurred
- Error type/category
- Suggested fixes based on common patterns

Use this when user provides error output from:
- Compilation errors (TypeScript, Rust, Python, etc.)
- Test failures
- Linting errors
- Runtime exceptions

Returns structured analysis of the error.`,
      inputSchema: z.object({
        error_text: z.string().describe('The error output to analyze'),
      }),
      execute: async ({ error_text }) => {
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);

        try {
          const result = await invoke<string>('analyze_error_tool', {
            errorText: error_text,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error analyzing error text: ${error}`;
        }
      },
    }),

    find_errors_in_file: tool({
      description: `Efficiently scan large files (logs, job output, build logs) for error patterns.

Scans files for common error indicators without loading the entire file into memory.
Useful for large log files, build outputs, or job logs that are too big to read entirely.

Returns matching lines with context (lines before/after each error).

Use this for:
- Large log files (>1MB)
- Build/test output files
- SLURM job output files
- Application logs`,
      inputSchema: z.object({
        file_path: z.string().describe('Path to the file to scan'),
        pattern: z.string().optional().describe('Custom error pattern (regex). Default: common error keywords'),
        context_lines: z.number().optional().describe('Number of context lines before/after errors (default: 3)'),
      }),
      execute: async ({ file_path, pattern, context_lines }) => {
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);

        try {
          const result = await invoke<string>('find_errors_in_file_tool', {
            filePath: file_path,
            pattern,
            contextLines: context_lines || 3,
            workingDirectory: cwd,
          });
          return truncateToolResult(result);
        } catch (error) {
          return `Error scanning file: ${error}`;
        }
      },
    }),

    file_sections: tool({
      description: `Read specific line ranges from files without loading the entire file.

Useful for:
- Reading specific sections of large files
- Getting context around error line numbers
- Reading file headers/footers
- Examining specific code sections

Much more efficient than read_file for large files when you know the line numbers.`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file'),
        start_line: z.number().describe('Starting line number (1-indexed)'),
        end_line: z.number().describe('Ending line number (inclusive)'),
      }),
      execute: async ({ path, start_line, end_line }) => {
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);

        try {
          const result = await invoke<string>('read_file_sections_tool', {
            filePath: path,
            startLine: start_line,
            endLine: end_line,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error reading file sections: ${error}`;
        }
      },
    }),

    // ==================== SYSTEM TOOLS ====================

    find_process: tool({
      description: `Find processes by name or pattern.

Returns process information including PID, CPU%, memory, and command.

Examples:
- Find Python processes: name="python"
- Find Node.js: name="node"
- Find by port: name="3000" (shows processes using port 3000)`,
      inputSchema: z.object({
        name: z.string().describe('Process name or pattern to search for'),
      }),
      execute: async ({ name }) => {
        const terminalId = await getActiveTerminalId();

        try {
          const cmd = `ps aux | grep -i ${shellEscape(name)} | grep -v grep`;
          const result = await executeCommand(cmd, terminalId);

          if (!result || result.trim().length === 0) {
            return `No processes found matching: ${name}`;
          }

          return result;
        } catch (error) {
          return `Error finding processes: ${error}`;
        }
      },
    }),

    check_port: tool({
      description: `Check if a port is in use and what process is using it.

Returns information about the process using the specified port.

Examples:
- Check if port 3000 is free: port=3000
- See what's using port 8080: port=8080`,
      inputSchema: z.object({
        port: z.number().describe('Port number to check'),
      }),
      execute: async ({ port }) => {
        const terminalId = await getActiveTerminalId();

        try {
          // Use lsof (works on macOS and Linux)
          const cmd = `lsof -i :${port} || echo "Port ${port} is not in use"`;
          const result = await executeCommand(cmd, terminalId);
          return result;
        } catch (error) {
          return `Error checking port: ${error}`;
        }
      },
    }),

    get_system_info: tool({
      description: `Get system information (OS, CPU, memory, disk usage).

Returns comprehensive system information useful for debugging and understanding
the environment.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const result = await invoke<string>('get_system_info_tool', {});
          return result;
        } catch (error) {
          return `Error getting system info: ${error}`;
        }
      },
    }),

    get_environment_variable: tool({
      description: `Get the value of an environment variable.

Returns the value of a specific environment variable from the terminal session.

Examples:
- Check PATH: name="PATH"
- Check Python virtual env: name="VIRTUAL_ENV"
- Check conda env: name="CONDA_DEFAULT_ENV"`,
      inputSchema: z.object({
        name: z.string().describe('Environment variable name'),
      }),
      execute: async ({ name }) => {
        const terminalId = await getActiveTerminalId();

        try {
          const cmd = `echo $${name}`;
          const result = await executeCommand(cmd, terminalId);
          const value = result.trim();

          if (!value) {
            return `Environment variable ${name} is not set`;
          }

          return `${name}=${value}`;
        } catch (error) {
          return `Error getting environment variable: ${error}`;
        }
      },
    }),
  };
}
