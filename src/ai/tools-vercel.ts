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
import { executeInPty } from '../terminal/core/executeInPty';
import type { PendingApproval } from '../context/AIContext';
import { createLogger } from '../utils/logger';

const log = createLogger('AITools');

// Tool timeout and size limit constants
const COMMAND_TIMEOUT_MS = 10000;
const FILE_SIZE_WARNING_THRESHOLD_BYTES = 100 * 1024; // 100 KB
const FILE_SIZE_LARGE_THRESHOLD_BYTES = 1024 * 1024; // 1 MB

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
    return cwd;
  } catch (error) {
    log.error('Failed to get terminal CWD', error);
    // Fallback to home directory
    return '~';
  }
}

/**
 * Execute a shell command using the active terminal PTY
 * This ensures commands run in the current terminal context (local, SSH, docker, etc.)
 */
async function executeCommand(command: string, terminalId: number): Promise<string> {
  try {
    const result = await executeInPty({
      terminalId,
      command,
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    return result.output || '(no output)';
  } catch (error) {
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
    get_current_directory: tool({
      description: `Get the current working directory of the active terminal.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const result = await invoke<string>('get_current_directory_tool', {
            terminalId,
          });
          return result;
        } catch (error) {
          return `Error getting current directory: ${error}`;
        }
      },
    }),
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
        // Check if command requires approval
        if (requireApproval && onPendingApproval) {
          const safetyCheck = isCommandSafe(command);
          if (!safetyCheck.isSafe) {
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
        
        const output = await executeCommand(command, terminalId);
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

    get_file_info: tool({
      description: `Get metadata about a file before reading it. This helps decide if a file should be read, is too large, or is binary.

Returns:
- File size (bytes and human-readable)
- Line count (for text files under 10MB)
- File type/language detection
- Whether file is text or binary
- File extension
- Last modified time

Use this BEFORE read_file to:
1. Check if file is too large (>1MB may need truncation)
2. Verify it's a text file (not binary)
3. Understand what type of code/content it contains
4. Decide if reading is necessary

Examples:
- Check before reading: path="large_log.txt"
- Verify file type: path="src/main.rs"
- Check size: path="package-lock.json"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative to terminal directory)'),
      }),
      execute: async ({ path }) => {
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<{
            path: string;
            size_bytes: number;
            size_human: string;
            line_count: number | null;
            is_text: boolean;
            is_binary: boolean;
            extension: string | null;
            file_type: string;
            last_modified: string | null;
          }>('get_file_info_tool', {
            path,
            workingDirectory: cwd,
          });
          
          const lines = [
            `File: ${result.path}`,
            `Size: ${result.size_human} (${result.size_bytes} bytes)`,
            `Type: ${result.file_type}${result.extension ? ` (.${result.extension})` : ''}`,
            `Format: ${result.is_binary ? 'Binary' : 'Text'}`,
          ];
          
          if (result.line_count !== null) {
            lines.push(`Lines: ${result.line_count}`);
          }
          
          if (result.last_modified) {
            lines.push(`Modified: ${result.last_modified}`);
          }
          
          // Add helpful suggestions
          if (result.is_binary) {
            lines.push('\n⚠️  This is a binary file - cannot read with read_file');
          } else if (result.size_bytes > FILE_SIZE_LARGE_THRESHOLD_BYTES) {
            lines.push(`\n⚠️  Large file (${result.size_human}) - consider using max_bytes parameter with read_file`);
          } else if (result.size_bytes > FILE_SIZE_WARNING_THRESHOLD_BYTES) {
            lines.push(`\n💡 File is ${result.size_human} - safe to read but consider if full content is needed`);
          }
          
          return lines.join('\n');
        } catch (error) {
          return `Error getting file info: ${error}`;
        }
      },
    }),

    read_multiple_files: tool({
      description: `Read multiple files at once (up to 20 files). Useful for error analysis when you need to check several related files.

Use this when:
- Error spans multiple files
- Need to compare related files
- Checking imports/dependencies
- Analyzing project structure

Each file has independent size limits. Binary files are skipped automatically.

Examples:
- Read related files: paths=["src/main.rs", "src/lib.rs", "Cargo.toml"]
- Check package files: paths=["package.json", "package-lock.json", "tsconfig.json"]`,
      inputSchema: z.object({
        paths: z.array(z.string()).describe('Array of file paths (max 20)'),
        max_bytes_per_file: z.number().optional().describe('Max bytes per file (default: 50000)'),
      }),
      execute: async ({ paths, max_bytes_per_file }) => {
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('read_multiple_files_tool', {
            paths,
            maxBytesPerFile: max_bytes_per_file,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error reading files: ${error}`;
        }
      },
    }),

    grep_in_files: tool({
      description: `Search for a pattern within specific files. Fast grep/search operation.

Use this when:
- Looking for specific error messages in logs
- Finding where a variable/function is used
- Searching for TODO/FIXME comments
- Checking for specific patterns in code

Returns matching lines with line numbers.

Examples:
- Find error in logs: pattern="ConnectionError", paths=["app.log", "error.log"]
- Search for function: pattern="handleRequest", paths=["src/server.ts", "src/routes.ts"]
- Case-insensitive: pattern="todo", case_sensitive=false`,
      inputSchema: z.object({
        pattern: z.string().describe('Text pattern to search for'),
        paths: z.array(z.string()).describe('Array of file paths to search (max 50)'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search (default: false)'),
      }),
      execute: async ({ pattern, paths, case_sensitive }) => {
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('grep_in_files_tool', {
            pattern,
            paths,
            caseSensitive: case_sensitive,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error searching files: ${error}`;
        }
      },
    }),

    analyze_error: tool({
      description: `Intelligently analyze error output or stack traces. Automatically extracts:
- File paths and line numbers
- Error types and messages
- Stack traces
- Files that exist vs missing
- Suggested search queries

Use this FIRST when user provides error output. It will:
1. Parse the error structure
2. Extract relevant files/locations
3. Check if mentioned files exist
4. Suggest what to investigate next

Examples:
- Analyze crash: error_text="<paste full error output>"
- Parse stack trace: error_text="<full stack trace>"
- Debug compilation error: error_text="<compiler output>"`,
      inputSchema: z.object({
        error_text: z.string().describe('The full error output or stack trace to analyze'),
      }),
      execute: async ({ error_text }) => {
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('analyze_error_tool', {
            errorText: error_text,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error analyzing error: ${error}`;
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
        try {
          const result = await invoke<string | null>('get_env_var_tool', { name });
          return result || `Environment variable ${name} is not set`;
        } catch (error) {
          return `Error getting environment variable: ${error}`;
        }
      },
    }),

    replace_in_file: tool({
      description: `Replace text in a file using search and replace. More precise and safer than overwriting the entire file with write_file.

IMPORTANT: 
- This searches for EXACT text matches (not regex)
- By default, only replaces the first occurrence
- Use all=true to replace all occurrences
- Returns error if search text is not found

Examples:
- Fix typo: path="config.ts", search="prot", replace="port"
- Update version: path="package.json", search="\\"version\\": \\"1.0.0\\"", replace="\\"version\\": \\"1.1.0\\""
- Replace all: path="app.ts", search="oldName", replace="newName", all=true`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative)'),
        search: z.string().describe('Exact text to find (case-sensitive)'),
        replace: z.string().describe('Replacement text'),
        all: z.boolean().optional().describe('Replace all occurrences (default: false, only replaces first)'),
      }),
      execute: async ({ path, search, replace, all }) => {
        const cwd = await getTerminalCwd(terminalId);
        
        try {
          const result = await invoke<string>('replace_in_file_tool', {
            path,
            search,
            replace,
            all: all || false,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error replacing in file: ${error}`;
        }
      },
    }),

    write_file: tool({
      description: `Write content to a file (creates new file or overwrites existing).

⚠️ NOTE: This tool only works on your LOCAL machine. If you're SSHed to a remote server, 
use execute_command instead with: cat > filename << 'EOF'
content here
EOF

Examples:
- Local: Use this tool with path="config.json", content="{\\"key\\": \\"value\\"}"
- Remote (SSH): Use execute_command with command="cat > config.json << 'EOF'\\n{\\"key\\": \\"value\\"}\\nEOF"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative)'),
        content: z.string().describe('Content to write to the file'),
      }),
      execute: async ({ path, content }) => {
        // Escape for shell
        const escapedContent = content.replace(/'/g, "'\\''");
        const escapedPath = path.replace(/'/g, "'\\''");
        const command = `printf '%s' '${escapedContent}' > '${escapedPath}'`;
        
        try {
          await executeCommand(command, terminalId);
          return `Wrote to ${path}`;
        } catch (error) {
          return `Error: ${error}`;
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

⚠️ NOTE: This tool only works on your LOCAL machine. If you're SSHed to a remote server,
use execute_command instead with: mkdir -p directory_name

Examples:
- Local: Use this tool with path="new_project"
- Remote (SSH): Use execute_command with command="mkdir -p new_project"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the directory to create'),
      }),
      execute: async ({ path }) => {
        const escapedPath = path.replace(/'/g, "'\\''");
        const command = `mkdir -p '${escapedPath}'`;
        
        try {
          await executeCommand(command, terminalId);
          return `Created directory: ${path}`;
        } catch (error) {
          return `Error: ${error}`;
        }
      },
    }),

    get_git_diff: tool({
      description: `Get uncommitted changes in the git repository. Shows what has been modified but not yet committed.`,
      inputSchema: z.object({}),
      execute: async () => {
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
