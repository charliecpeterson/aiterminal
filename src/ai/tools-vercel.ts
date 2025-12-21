/**
 * Vercel AI SDK Tool Definitions
 * 
 * Tools the AI can use to interact with the terminal environment.
 * Uses Vercel AI SDK's tool() function with Zod schemas and automatic execution.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { invoke } from '@tauri-apps/api/core';
import { isCommandSafe } from './commandSafety';
import type { PendingApproval } from '../context/AIContext';

// Store pending approval promises
const pendingApprovalPromises = new Map<string, {
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}>();

/**
 * Resolve a pending approval with execution result
 */
export function resolveApproval(id: string, result: string) {
  const promise = pendingApprovalPromises.get(id);
  if (promise) {
    promise.resolve(result);
    pendingApprovalPromises.delete(id);
  }
}

/**
 * Reject a pending approval
 */
export function rejectApproval(id: string, reason: string) {
  const promise = pendingApprovalPromises.get(id);
  if (promise) {
    promise.reject(new Error(reason));
    pendingApprovalPromises.delete(id);
  }
}

/**
 * Get the terminal's current working directory
 */
async function getTerminalCwd(terminalId: number): Promise<string> {
  try {
    const cwd = await invoke<string>('get_pty_cwd', { id: terminalId });
    console.log(`📂 Got terminal ${terminalId} CWD:`, cwd);
    return cwd;
  } catch (error) {
    console.error('Failed to get terminal CWD:', error);
    // Fallback to home directory
    return '~';
  }
}

/**
 * Execute a shell command
 */
async function executeCommand(command: string, workingDirectory?: string): Promise<string> {
  try {
    console.log(`🔧 Executing: ${command}`);
    console.log(`📂 Working directory: ${workingDirectory || 'default'}`);
    
    const result = await invoke<{
      stdout: string;
      stderr: string;
      exit_code: number;
    }>('execute_tool_command', {
      command,
      workingDirectory: workingDirectory || null,
    });

    console.log(`✅ Command completed with exit code ${result.exit_code}`);
    
    if (result.exit_code !== 0) {
      return `Command failed with exit code ${result.exit_code}\nstderr: ${result.stderr}\nstdout: ${result.stdout}`;
    }
    
    // Combine stdout and stderr, but prioritize stdout
    return result.stdout || result.stderr || '(no output)';
  } catch (error) {
    console.error('Command execution error:', error);
    return `Error: ${error}`;
  }
}

/**
 * Create tools with terminal context
 */
export function createTools(
  terminalId: number = 0, 
  requireApproval: boolean = true,
  onPendingApproval?: (approval: PendingApproval) => void
) {
  return {
    execute_command: tool({
      description: `Execute a shell command in the terminal. Use this to run commands, check system state, install packages, etc.

IMPORTANT:
- Commands run in the user's terminal directory
- For destructive commands (rm, dd, etc.), be cautious
- If unsure about current directory, use pwd first

Examples:
- Check Python version: python --version
- List files: ls -la
- Get current directory: pwd`,
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute (e.g., "ls -la", "pwd")'),
      }),
      execute: async ({ command }) => {
        console.log(`🤖 AI called execute_command: ${command}`);
        
        // Check if command requires approval
        if (requireApproval && onPendingApproval) {
          const safetyCheck = isCommandSafe(command);
          if (!safetyCheck.isSafe) {
            console.log(`⚠️ Dangerous command detected: ${command}`);
            console.log(`   Reason: ${safetyCheck.reason}`);
            
            // Get current directory for context
            const cwd = await getTerminalCwd(terminalId);
            
            // Create approval request
            const approval: PendingApproval = {
              id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              command,
              reason: safetyCheck.reason || 'Unknown risk',
              category: safetyCheck.category || 'unknown',
              terminalId,
              cwd,
              timestamp: Date.now(),
            };
            
            // Create a promise that waits for user approval/denial
            const approvalPromise = new Promise<string>((resolve, reject) => {
              pendingApprovalPromises.set(approval.id, { resolve, reject });
            });
            
            // Add to pending approvals immediately (shows UI)
            console.log(`⏸️ Adding pending approval: ${command}`);
            onPendingApproval(approval);
            
            // Wait for user decision
            try {
              const result = await approvalPromise;
              return result;
            } catch (error) {
              return `⛔ Command denied by user: ${error instanceof Error ? error.message : 'User cancelled'}`;
            }
          }
        }
        
        const cwd = await getTerminalCwd(terminalId);
        const output = await executeCommand(command, cwd);
        return output;
      },
    }),

    read_file: tool({
      description: `Read the contents of a file. Only works with text files. Large files will be truncated.

Examples:
- Check package.json: path="package.json"
- Read log file: path="/var/log/app.log"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative to terminal directory)'),
        max_bytes: z.number().optional().describe('Maximum bytes to read (default: 50000)'),
      }),
      execute: async ({ path, max_bytes }) => {
        console.log(`🤖 AI called read_file: ${path}`);
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('read_file_tool', {
            path,
            maxBytes: max_bytes || 50000,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error reading file: ${error}`;
        }
      },
    }),

    list_directory: tool({
      description: `List contents of a directory. Shows files and subdirectories.

IMPORTANT: When user says "my current directory" or "here":
1. Use execute_command("pwd") to get the actual path
2. Then use that path with list_directory

Examples:
- List home directory: path="/Users/john"
- List project: path="/Users/john/projects/myapp"`,
      inputSchema: z.object({
        path: z.string().describe('Absolute path to the directory to list'),
      }),
      execute: async ({ path }) => {
        console.log(`🤖 AI called list_directory: ${path}`);
        
        try {
          const result = await invoke<{
            files: string[];
            directories: string[];
            total_count: number;
          }>('list_directory_tool', { path });
          
          const output = [
            `Contents of ${path}:`,
            '',
            'Directories:',
            ...result.directories.map(d => `  📁 ${d}`),
            '',
            'Files:',
            ...result.files.map(f => `  📄 ${f}`),
            '',
            `Total: ${result.directories.length} directories, ${result.files.length} files`,
          ].join('\n');
          
          return output;
        } catch (error) {
          return `Error listing directory: ${error}`;
        }
      },
    }),

    search_files: tool({
      description: `Search for files by name pattern (glob) or content (grep). Use for finding files or text.

Examples:
- Find all Python files: pattern="*.py"
- Find TypeScript files: pattern="**/*.ts"
- Search for text: pattern="TODO" (searches file contents)`,
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern (glob for filenames, text for content search)'),
        path: z.string().optional().describe('Directory to search in (defaults to current)'),
      }),
      execute: async ({ pattern, path }) => {
        console.log(`🤖 AI called search_files: ${pattern} in ${path || 'current directory'}`);
        const searchPath = path || await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<{ matches: string[]; count: number }>('search_files_tool', {
            pattern,
            path: searchPath,
          });
          
          if (result.count === 0) {
            return `No files found matching "${pattern}" in ${searchPath}`;
          }
          
          const output = [
            `Found ${result.count} matches for "${pattern}":`,
            '',
            ...result.matches.map(m => `  ${m}`),
          ].join('\n');
          
          return output;
        } catch (error) {
          return `Error searching files: ${error}`;
        }
      },
    }),

    get_environment_variable: tool({
      description: `Get the value of an environment variable.

Examples:
- Check PATH: name="PATH"
- Check HOME: name="HOME"
- Check Python version env: name="PYTHON_VERSION"`,
      inputSchema: z.object({
        name: z.string().describe('Name of the environment variable'),
      }),
      execute: async ({ name }) => {
        console.log(`🤖 AI called get_environment_variable: ${name}`);
        
        try {
          const result = await invoke<string | null>('get_env_var_tool', { name });
          return result || `Environment variable ${name} is not set`;
        } catch (error) {
          return `Error getting environment variable: ${error}`;
        }
      },
    }),

    write_file: tool({
      description: `Write content to a file (creates new file or overwrites existing).

IMPORTANT: This will overwrite existing files! Use with caution.

Examples:
- Create config: path="config.json", content="{\\"key\\": \\"value\\"}"
- Write script: path="script.sh", content="#!/bin/bash\\necho hello"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative)'),
        content: z.string().describe('Content to write to the file'),
      }),
      execute: async ({ path, content }) => {
        console.log(`🤖 AI called write_file: ${path}`);
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('write_file_tool', {
            path,
            content,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error writing file: ${error}`;
        }
      },
    }),

    append_to_file: tool({
      description: `Append content to the end of a file. Creates file if it doesn't exist.

Examples:
- Add to log: path="app.log", content="[INFO] Message\\n"
- Update list: path="notes.txt", content="- New item\\n"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file'),
        content: z.string().describe('Content to append'),
      }),
      execute: async ({ path, content }) => {
        console.log(`🤖 AI called append_to_file: ${path}`);
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('append_to_file_tool', {
            path,
            content,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error appending to file: ${error}`;
        }
      },
    }),

    git_status: tool({
      description: `Get git repository status including current branch, staged files, and uncommitted changes.

Use this to understand the state of the git repository before making suggestions.`,
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`🤖 AI called git_status`);
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('git_status_tool', {
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error getting git status: ${error}`;
        }
      },
    }),

    find_process: tool({
      description: `Find running processes by name or pattern. Useful for debugging "port already in use" errors.

Examples:
- Find node: pattern="node"
- Find Python: pattern="python"
- Find by port: pattern="8080"`,
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern for process name'),
      }),
      execute: async ({ pattern }) => {
        console.log(`🤖 AI called find_process: ${pattern}`);
        
        try {
          const result = await invoke<string>('find_process_tool', { pattern });
          return result;
        } catch (error) {
          return `Error finding process: ${error}`;
        }
      },
    }),

    check_port: tool({
      description: `Check if a network port is in use and what process is using it.

Examples:
- Check web port: port=8080
- Check database: port=5432`,
      inputSchema: z.object({
        port: z.number().describe('Port number to check (e.g., 8080, 3000)'),
      }),
      execute: async ({ port }) => {
        console.log(`🤖 AI called check_port: ${port}`);
        
        try {
          const result = await invoke<string>('check_port_tool', { port });
          return result;
        } catch (error) {
          return `Error checking port: ${error}`;
        }
      },
    }),

    get_system_info: tool({
      description: `Get system information including OS, architecture, and disk space. Useful for debugging environment issues.`,
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`🤖 AI called get_system_info`);
        
        try {
          const result = await invoke<string>('get_system_info_tool');
          return result;
        } catch (error) {
          return `Error getting system info: ${error}`;
        }
      },
    }),

    tail_file: tool({
      description: `Read the last N lines of a file. More efficient than read_file for large log files.

Examples:
- Last 50 lines: path="app.log", lines=50
- Recent errors: path="/var/log/error.log", lines=100`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file'),
        lines: z.number().optional().describe('Number of lines to read from end (default: 50)'),
      }),
      execute: async ({ path, lines }) => {
        console.log(`🤖 AI called tail_file: ${path} (${lines || 50} lines)`);
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('tail_file_tool', {
            path,
            lines: lines || 50,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error reading file tail: ${error}`;
        }
      },
    }),

    make_directory: tool({
      description: `Create a directory (and parent directories if needed).

Examples:
- Create folder: path="new_project"
- Nested path: path="src/components/ui"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the directory to create'),
      }),
      execute: async ({ path }) => {
        console.log(`🤖 AI called make_directory: ${path}`);
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('make_directory_tool', {
            path,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error creating directory: ${error}`;
        }
      },
    }),

    get_git_diff: tool({
      description: `Get uncommitted changes in the git repository. Shows what has been modified but not yet committed.`,
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`🤖 AI called get_git_diff`);
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('get_git_diff_tool', {
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error getting git diff: ${error}`;
        }
      },
    }),

    calculate: tool({
      description: `Evaluate a mathematical expression. Supports basic arithmetic and advanced math functions.

Examples:
- Simple: expression="2 + 2"
- Complex: expression="sqrt(16) * 3.14"
- Conversions: expression="1024 / 8" (bytes to KB)`,
      inputSchema: z.object({
        expression: z.string().describe('Mathematical expression to evaluate'),
      }),
      execute: async ({ expression }) => {
        console.log(`🤖 AI called calculate: ${expression}`);
        
        try {
          const result = await invoke<string>('calculate_tool', { expression });
          return `${expression} = ${result}`;
        } catch (error) {
          return `Error calculating: ${error}`;
        }
      },
    }),

    web_search: tool({
      description: `Get suggestions for searching the web. Cannot actually browse, but provides helpful search URLs.

Use this when the user asks about external documentation or errors that might need web research.`,
      inputSchema: z.object({
        query: z.string().describe('Search query'),
      }),
      execute: async ({ query }) => {
        console.log(`🤖 AI called web_search: ${query}`);
        
        try {
          const result = await invoke<string>('web_search_tool', { query });
          return result;
        } catch (error) {
          return `Error generating search suggestion: ${error}`;
        }
      },
    }),
  };
}
