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
const COMMAND_TIMEOUT_QUICK_MS = 10000;   // 10s for quick commands (ls, cat, pwd)
const COMMAND_TIMEOUT_DEFAULT_MS = 30000; // 30s for most commands
const COMMAND_TIMEOUT_LONG_MS = 120000;   // 2min for builds, installs, tests
const FILE_SIZE_WARNING_THRESHOLD_BYTES = 100 * 1024; // 100 KB
const FILE_SIZE_LARGE_THRESHOLD_BYTES = 1024 * 1024; // 1 MB

// Tool result size limits (to prevent context bloat)
const TOOL_RESULT_MAX_CHARS = 8000;      // ~2000 tokens max per tool result
const TOOL_RESULT_TRUNCATE_CHARS = 3000; // Keep this much from start when truncating

/**
 * Truncate large tool results to prevent context bloat.
 * Keeps the beginning (usually most relevant) and adds a note about truncation.
 */
function truncateToolResult(result: string, maxChars: number = TOOL_RESULT_MAX_CHARS): string {
  if (result.length <= maxChars) {
    return result;
  }
  
  const truncated = result.substring(0, TOOL_RESULT_TRUNCATE_CHARS);
  const remaining = result.length - TOOL_RESULT_TRUNCATE_CHARS;
  const lines = (result.match(/\n/g) || []).length;
  const truncatedLines = (truncated.match(/\n/g) || []).length;
  
  return `${truncated}\n\n... [TRUNCATED: ${remaining} more characters, ~${lines - truncatedLines} more lines. Use file_sections to read specific line ranges, or tail_file for the end.]`;
}

// Commands that typically run quickly
const QUICK_COMMANDS = [
  /^ls(\s|$)/, /^pwd$/, /^cat\s/, /^head\s/, /^tail\s/, /^echo\s/,
  /^which\s/, /^type\s/, /^whoami$/, /^date$/, /^hostname$/,
  /^env$/, /^printenv/, /^uname/, /^id$/, /^groups$/,
];

// Commands that typically take longer
const LONG_COMMANDS = [
  /^npm\s+(install|ci|run|test|build)/, /^yarn\s+(install|add|run|test|build)/,
  /^pnpm\s+(install|add|run|test|build)/, /^bun\s+(install|add|run|test|build)/,
  /^pip\s+install/, /^pip3\s+install/, /^python.*setup\.py/,
  /^cargo\s+(build|test|run)/, /^rustc\s/,
  /^go\s+(build|test|run|install)/, /^make(\s|$)/,
  /^docker\s+(build|pull|push)/, /^docker-compose\s+up/,
  /^git\s+(clone|pull|push|fetch)/, /^curl\s/, /^wget\s/,
  /^apt(-get)?\s+(install|update|upgrade)/, /^brew\s+(install|upgrade)/,
];

/**
 * Get appropriate timeout for a command based on expected duration
 */
function getCommandTimeout(command: string): number {
  const trimmedCmd = command.trim().toLowerCase();
  
  // Check for quick commands
  if (QUICK_COMMANDS.some(pattern => pattern.test(trimmedCmd))) {
    return COMMAND_TIMEOUT_QUICK_MS;
  }
  
  // Check for long-running commands
  if (LONG_COMMANDS.some(pattern => pattern.test(trimmedCmd))) {
    return COMMAND_TIMEOUT_LONG_MS;
  }
  
  return COMMAND_TIMEOUT_DEFAULT_MS;
}

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
 * Create a cached CWD getter to avoid repeated IPC calls within a single agent turn.
 * The cache is scoped to a single createTools() invocation.
 */
function createCwdCache(terminalId: number) {
  let cachedCwd: string | null = null;
  let cacheTimestamp: number = 0;
  const CACHE_TTL_MS = 30000; // 30 seconds - covers most agent turns
  
  return async function getCachedCwd(): Promise<string> {
    const now = Date.now();
    if (cachedCwd && (now - cacheTimestamp) < CACHE_TTL_MS) {
      return cachedCwd;
    }
    
    cachedCwd = await getTerminalCwd(terminalId);
    cacheTimestamp = now;
    log.debug('CWD cached', { cwd: cachedCwd });
    return cachedCwd;
  };
}

/**
 * File read cache to avoid re-reading the same file multiple times in one agent turn.
 * This is scoped to a single createTools() invocation (one agent conversation turn).
 * 
 * Key features:
 * - 60 second TTL (covers multi-step agent turns)
 * - Invalidation on write operations to the same file
 * - Max 50 entries to prevent memory bloat
 * - Cache key is normalized path
 */
interface FileReadCacheEntry {
  content: string;
  timestamp: number;
}

function createFileReadCache() {
  const cache = new Map<string, FileReadCacheEntry>();
  const CACHE_TTL_MS = 60000; // 60 seconds
  const MAX_ENTRIES = 50;
  
  /**
   * Normalize path to create a consistent cache key.
   * Resolves relative paths against cwd.
   */
  function normalizePath(path: string, cwd: string): string {
    if (path.startsWith('/') || path.startsWith('~')) {
      return path;
    }
    // Relative path - combine with cwd
    return `${cwd}/${path}`.replace(/\/+/g, '/');
  }
  
  /**
   * Get cached file content if available and not expired.
   */
  function get(path: string, cwd: string): string | null {
    const key = normalizePath(path, cwd);
    const entry = cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    
    log.debug('File cache hit', { path: key });
    return entry.content;
  }
  
  /**
   * Store file content in cache.
   */
  function set(path: string, cwd: string, content: string): void {
    const key = normalizePath(path, cwd);
    
    // Evict oldest entries if at max capacity
    if (cache.size >= MAX_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      
      for (const [k, v] of cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }
      
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
    
    cache.set(key, {
      content,
      timestamp: Date.now(),
    });
    log.debug('File cached', { path: key, size: content.length });
  }
  
  /**
   * Invalidate cache entry for a specific path (called after write operations).
   */
  function invalidate(path: string, cwd: string): void {
    const key = normalizePath(path, cwd);
    if (cache.has(key)) {
      cache.delete(key);
      log.debug('File cache invalidated', { path: key });
    }
  }
  
  /**
   * Clear entire cache (useful for testing or manual reset).
   */
  function clear(): void {
    cache.clear();
    log.debug('File cache cleared');
  }
  
  return { get, set, invalidate, clear, normalizePath };
}

/**
 * Execute a shell command using the active terminal PTY
 * This ensures commands run in the current terminal context (local, SSH, docker, etc.)
 * Timeout is automatically adjusted based on command type.
 */
async function executeCommand(command: string, terminalId: number): Promise<string> {
  const timeoutMs = getCommandTimeout(command);
  log.debug('Executing command', { command: command.substring(0, 50), timeoutMs });
  
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

/**
 * Create tools with terminal context
 */
export function createTools(
  terminalId: number = 0, 
  requireApproval: boolean = true,
  onPendingApproval?: (approval: PendingApproval) => void
) {
  // Create a cached CWD getter for this tool set
  // This avoids repeated IPC calls within a single agent turn
  const getCwd = createCwdCache(terminalId);
  
  // Create file read cache for this tool set
  // Avoids re-reading the same file multiple times in one agent turn
  const fileCache = createFileReadCache();
  
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
            const cwd = await getCwd();
            
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
        // Truncate large command outputs to prevent context bloat
        return truncateToolResult(output);
      },
    }),

    read_file: tool({
      description: `Read the contents of a file. Only works with text files. Large files will be truncated to ~3000 chars.

Examples:
- Check package.json: path="package.json"
- Read log file: path="/var/log/app.log"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative to terminal directory)'),
        max_bytes: z.number().optional().describe('Maximum bytes to read (default: 50000)'),
      }),
      execute: async ({ path, max_bytes }) => {
        const cwd = await getCwd();
        
        // Check cache first (only for default max_bytes to ensure consistency)
        if (!max_bytes || max_bytes === 50000) {
          const cached = fileCache.get(path, cwd);
          if (cached !== null) {
            return cached;
          }
        }
        
        try {
          const result = await invoke<string>('read_file_tool', {
            path,
            maxBytes: max_bytes || 50000,
            workingDirectory: cwd,
          });
          // Truncate large results to prevent context bloat
          const truncated = truncateToolResult(result);
          
          // Cache the result (only for default max_bytes)
          if (!max_bytes || max_bytes === 50000) {
            fileCache.set(path, cwd, truncated);
          }
          
          return truncated;
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
        const cwd = await getCwd();
        
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
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('read_multiple_files_tool', {
            paths,
            maxBytesPerFile: max_bytes_per_file,
            workingDirectory: cwd,
          });
          // Truncate combined result to prevent context bloat
          // Allow more chars since this is explicitly for multiple files
          return truncateToolResult(result, TOOL_RESULT_MAX_CHARS * 2);
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
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('grep_in_files_tool', {
            pattern,
            paths,
            caseSensitive: case_sensitive,
            workingDirectory: cwd,
          });
          // Truncate large search results
          return truncateToolResult(result);
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
        const cwd = await getCwd();
        
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
        const searchPath = path || await getCwd();
        
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
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('replace_in_file_tool', {
            path,
            search,
            replace,
            all: all || false,
            workingDirectory: cwd,
          });
          // Invalidate cache since file was modified
          fileCache.invalidate(path, cwd);
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
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('write_file_tool', {
            path,
            content,
            workingDirectory: cwd,
          });
          // Invalidate cache since file was modified
          fileCache.invalidate(path, cwd);
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
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('append_to_file_tool', {
            path,
            content,
            workingDirectory: cwd,
          });
          // Invalidate cache since file was modified
          fileCache.invalidate(path, cwd);
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
        const cwd = await getCwd();
        
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
        const cwd = await getCwd();
        
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
        const cwd = await getCwd();
        
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
        const cwd = await getCwd();
        
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

    get_shell_history: tool({
      description: `Get the user's shell command history. Useful for:
- Understanding what commands the user has been running
- Finding a command they ran earlier
- Seeing patterns in their workflow
- Helping debug issues by seeing recent activity

⚠️ NOTE: This reads from the LOCAL machine's shell history file (~/.bash_history, ~/.zsh_history, etc.)

Examples:
- Recent commands: count=20
- Find git commands: filter="git", count=50
- All npm commands: filter="npm"`,
      inputSchema: z.object({
        count: z.number().optional().describe('Number of commands to retrieve (default: 50, max: 500)'),
        shell: z.string().optional().describe('Shell type: bash, zsh, or fish (auto-detected if not specified)'),
        filter: z.string().optional().describe('Filter commands containing this text (case-insensitive)'),
      }),
      execute: async ({ count, shell, filter }) => {
        try {
          const result = await invoke<string>('get_shell_history_tool', {
            count: count || 50,
            shell: shell || null,
            filter: filter || null,
          });
          return result;
        } catch (error) {
          return `Error reading shell history: ${error}`;
        }
      },
    }),

    find_errors_in_file: tool({
      description: `Scan large files for error patterns WITHOUT loading entire file into context.
Uses efficient streaming - handles GB+ files with no memory issues.

Searches for common error patterns:
- Critical: error, fatal, panic, crash, abort, segfault
- Memory: oom, out of memory, cannot allocate  
- Process: killed, terminated, timeout, timed out
- Access: permission denied, access denied, unauthorized
- Network: connection refused/reset/timeout, unreachable
- Files: no such file, file not found, cannot open
- General: failed, failure, exception, traceback, exit code

Returns matching lines WITH context (lines before/after) for debugging.

Use this for:
- Job output files (HPC, CI/CD, batch jobs)
- Application logs
- Build/compile output
- System logs
- Any large text file that might contain errors

Examples:
- Check job output: path="/scratch/jobs/job_12345.out"
- Scan log with more context: path="app.log", context_lines=5
- Limit matches: path="huge.log", max_matches=20`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative to terminal directory)'),
        context_lines: z.number().optional().describe('Lines of context before/after each match (default: 2)'),
        max_matches: z.number().optional().describe('Maximum matches to return (default: 50, max: 200)'),
        custom_patterns: z.array(z.string()).optional().describe('Additional patterns to search for'),
      }),
      execute: async ({ path, context_lines, max_matches, custom_patterns }) => {
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('find_errors_in_file_tool', {
            path,
            workingDirectory: cwd,
            contextLines: context_lines,
            maxMatches: max_matches,
            customPatterns: custom_patterns,
          });
          return result;
        } catch (error) {
          return `Error scanning file for errors: ${error}`;
        }
      },
    }),

    file_sections: tool({
      description: `Read specific line ranges from large files efficiently.
Uses streaming - handles GB+ files without loading entire file into memory.

Line numbers are 1-indexed (matches error output, stack traces, etc.)

Use this when:
- You know which lines to examine (from error messages, find_errors_in_file, etc.)
- You need to see code around a specific line number
- Exploring different sections of a large file
- Following up on analyze_error output

Examples:
- Read lines 500-600: path="output.log", start_line=500, end_line=600  
- Read 100 lines from line 1000: path="trace.log", start_line=1000
- Check end of file: Use tail_file instead for last N lines`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative to terminal directory)'),
        start_line: z.number().describe('First line to read (1-indexed)'),
        end_line: z.number().optional().describe('Last line to read (default: start_line + max_lines)'),
        max_lines: z.number().optional().describe('Maximum lines to return (default: 200, max: 500)'),
      }),
      execute: async ({ path, start_line, end_line, max_lines }) => {
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('file_sections_tool', {
            path,
            workingDirectory: cwd,
            startLine: start_line,
            endLine: end_line,
            maxLines: max_lines,
          });
          return result;
        } catch (error) {
          return `Error reading file section: ${error}`;
        }
      },
    }),

    undo_file_change: tool({
      description: `Undo the last file modification by restoring from backup.
File backups are automatically created when using write_file, append_to_file, or replace_in_file.

Use this when:
- User says "undo that" after a file was modified
- A file change caused problems and needs to be reverted
- You made a mistake in a file edit

Examples:
- Undo most recent change: (no parameters)
- Undo specific file: path="config.json"

Note: Keeps up to 5 backups per file, 50 total across all files.`,
      inputSchema: z.object({
        path: z.string().optional().describe('Specific file to restore (default: most recently modified file)'),
      }),
      execute: async ({ path }) => {
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('undo_file_change_tool', {
            path: path || null,
            workingDirectory: cwd,
          });
          // Invalidate cache since file was restored
          if (path) {
            fileCache.invalidate(path, cwd);
          }
          return result;
        } catch (error) {
          return `Error undoing file change: ${error}`;
        }
      },
    }),

    list_file_backups: tool({
      description: `List available file backups that can be restored with undo_file_change.
Shows backup timestamps and sizes.

Use this when:
- User asks what can be undone
- You want to see history of file changes
- Before restoring to check available versions`,
      inputSchema: z.object({
        path: z.string().optional().describe('Filter backups for a specific file'),
      }),
      execute: async ({ path }) => {
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('list_file_backups_tool', {
            path: path || null,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error listing backups: ${error}`;
        }
      },
    }),

    diff_files: tool({
      description: `Compare two files OR show changes made to a file since last backup.

Two modes:
1. Compare two files: file1="old.txt", file2="new.txt"
2. Show recent changes: file1="config.json" (compares current vs backup)

Use this when:
- User asks "what did you change?"
- Comparing two versions of a file
- Reviewing modifications before committing

Output shows:
- Lines added (+)
- Lines removed (-)
- Context around changes`,
      inputSchema: z.object({
        file1: z.string().describe('First file path (or only file to compare against its backup)'),
        file2: z.string().optional().describe('Second file path (omit to compare file1 with its backup)'),
      }),
      execute: async ({ file1, file2 }) => {
        const cwd = await getCwd();
        
        try {
          const result = await invoke<string>('diff_files_tool', {
            file1,
            file2: file2 || null,
            workingDirectory: cwd,
          });
          return result;
        } catch (error) {
          return `Error comparing files: ${error}`;
        }
      },
    }),
  };
}
