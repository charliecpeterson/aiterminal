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

/**
 * Escape shell arguments for safe command execution.
 * Uses single quotes and escapes embedded single quotes.
 */
function shellEscape(str: string): string {
  if (!str) return "''";
  return `'${str.replace(/'/g, "'\\''")}'`;
}

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
  
  // Find the last newline before TOOL_RESULT_TRUNCATE_CHARS to avoid cutting mid-line
  let truncateAt = TOOL_RESULT_TRUNCATE_CHARS;
  const lastNewline = result.lastIndexOf('\n', TOOL_RESULT_TRUNCATE_CHARS);

  // Use the newline boundary if found and it's not too far back (within 200 chars)
  if (lastNewline > 0 && lastNewline > TOOL_RESULT_TRUNCATE_CHARS - 200) {
    truncateAt = lastNewline;
  }

  const truncated = result.substring(0, truncateAt);
  const remaining = result.length - truncateAt;
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
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

const pendingApprovalPromises = new Map<string, {
  resolve: (result: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

/**
 * Resolve a pending approval with execution result
 */
export function resolveApproval(id: string, result: string) {
  const promise = pendingApprovalPromises.get(id);
  if (promise) {
    clearTimeout(promise.timer);
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
    clearTimeout(promise.timer);
    promise.reject(new Error(reason));
    pendingApprovalPromises.delete(id);
  }
}

/**
 * Get the terminal's current working directory
 */
async function getTerminalCwd(terminalId: number): Promise<string> {
  try {
    const result = await executeInPty({
      terminalId,
      command: ' pwd', // Leading space to suppress history
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
    return result.output.trim();
  } catch (error) {
    log.error('Failed to get terminal CWD', error);
    // Fallback to home directory
    return '~';
  }
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
 * 
 * History suppression: Commands are prefixed with a space to avoid shell history
 * (works when HISTCONTROL=ignorespace is set, which is common in bash/zsh)
 */
async function executeCommand(
  command: string, 
  terminalId: number,
  options?: {
    suppressHistory?: boolean;
  }
): Promise<string> {
  const timeoutMs = getCommandTimeout(command);
  
  // Prefix command with space to suppress history (if HISTCONTROL=ignorespace is set)
  // This is a common default in bash and zsh
  const suppressHistory = options?.suppressHistory !== false; // Default to true
  const finalCommand = suppressHistory ? ` ${command}` : command;
  
  log.debug('Executing command', { 
    command: command.substring(0, 50), 
    timeoutMs,
    suppressHistory 
  });
  
  try {
    const result = await executeInPty({
      terminalId,
      command: finalCommand,
      timeoutMs,
    });
    return result.output || '(no output)';
  } catch (error) {
    return `Error: ${error}`;
  }
}

/**
 * Create tools without terminal context (queries active terminal at runtime)
 */
export function createTools(
  requireApproval: boolean = true,
  onPendingApproval?: (approval: PendingApproval) => void
) {
  /**
   * Helper to get the current active terminal ID from Rust backend.
   * Queries fresh every time to avoid stale state.
   */
  const getActiveTerminalId = async (): Promise<number> => {
    try {
      const id = await invoke<number>('get_active_terminal');
      log.debug('[AITools]', `Using terminal ID: ${id}`);
      return id;
    } catch (error) {
      throw new Error(`No active terminal found: ${error}`);
    }
  };
  
  /**
   * Helper to get the current working directory of the active terminal.
   * Queries the active terminal ID first, then gets its CWD.
   */
  const getCwd = async (): Promise<string> => {
    const terminalId = await getActiveTerminalId();
    return await getTerminalCwd(terminalId);
  };
  
  // Track if we've checked HISTCONTROL (one-time check per tool session)
  let histControlChecked = false;
  
  /**
   * Check if history suppression is supported in the user's shell.
   * Most modern shells (bash, zsh) support HISTCONTROL=ignorespace.
   */
  const checkHistoryControl = async () => {
    if (histControlChecked) return;
    histControlChecked = true;
    
    try {
      const terminalId = await getActiveTerminalId();
      const result = await executeInPty({
        terminalId,
        command: 'echo "$HISTCONTROL"',
        timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
      });
      
      const histControl = result.output.trim();
      if (!histControl.includes('ignorespace') && !histControl.includes('ignoreboth')) {
        log.warn('[AITools]', 'HISTCONTROL does not include ignorespace - AI commands may appear in shell history');
        log.info('[AITools]', 'To enable: export HISTCONTROL=ignorespace');
      }
    } catch (error) {
      log.debug('[AITools]', 'Could not check HISTCONTROL:', error);
    }
  };
  
  // Create file read cache for this tool set
  // Avoids re-reading the same file multiple times in one agent turn
  const fileCache = createFileReadCache();
  
  return {
    get_current_directory: tool({
      description: `Get the current working directory of the active terminal.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          // Check history control on first execution
          await checkHistoryControl();
          
          const terminalId = await getActiveTerminalId();
          const result = await executeInPty({
            terminalId,
            command: ' pwd', // Leading space to suppress history
            timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
          });
          return result.output.trim();
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
        // Get active terminal ID first
        const terminalId = await getActiveTerminalId();
        
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
            
            // Create a promise that waits for user approval/denial (with timeout)
            const approvalPromise = new Promise<string>((resolve, reject) => {
              const timer = setTimeout(() => {
                if (pendingApprovalPromises.has(approval.id)) {
                  pendingApprovalPromises.delete(approval.id);
                  reject(new Error('Approval timed out after 10 minutes'));
                }
              }, APPROVAL_TIMEOUT_MS);

              pendingApprovalPromises.set(approval.id, { resolve, reject, timer });
            });

            // Add to pending approvals immediately (shows UI)
            onPendingApproval(approval);

            // Wait for user decision
            try {
              const result = await approvalPromise;
              return result;
            } catch (error) {
              return `Command not executed: ${error instanceof Error ? error.message : 'User cancelled'}`;
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
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);
        
        // Check cache first (only for default max_bytes to ensure consistency)
        if (!max_bytes || max_bytes === 50000) {
          const cached = fileCache.get(path, cwd);
          if (cached !== null) {
            return cached;
          }
        }
        
        try {
          // Use head to limit bytes read for large files
          const maxBytes = max_bytes || 50000;
          const command = ` head -c ${maxBytes} ${shellEscape(path)} 2>&1`; // Leading space
          
          const result = await executeInPty({
            terminalId,
            command,
            timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
          });
          
          // Check for common error patterns
          if (result.exitCode !== 0) {
            const output = result.output.toLowerCase();
            if (output.includes('no such file') || output.includes('cannot find')) {
              return `Error: File not found: ${path}`;
            }
            if (output.includes('permission denied')) {
              return `Error: Permission denied: ${path}`;
            }
            if (output.includes('is a directory')) {
              return `Error: Path is a directory, not a file: ${path}`;
            }
            return `Error reading file: ${result.output}`;
          }
          
          // Truncate large results to prevent context bloat
          const truncated = truncateToolResult(result.output);
          
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
        const terminalId = await getActiveTerminalId();
        try {
          // Use stat, wc, and file commands to get file info
          const escapedPath = shellEscape(path);
          
          // Get size in bytes and last modified time
          const statCmd = `stat -f "%z %m" ${escapedPath} 2>/dev/null || stat -c "%s %Y" ${escapedPath} 2>/dev/null`;
          const statOutput = await executeCommand(statCmd, terminalId);
          
          if (!statOutput || statOutput.includes('cannot stat')) {
            return `Error: File not found or cannot access: ${path}`;
          }
          
          const [sizeStr] = statOutput.trim().split(/\s+/);
          const size_bytes = parseInt(sizeStr) || 0;
          
          // Convert size to human readable
          let size_human: string;
          if (size_bytes < 1024) {
            size_human = `${size_bytes} B`;
          } else if (size_bytes < 1024 * 1024) {
            size_human = `${(size_bytes / 1024).toFixed(1)} KB`;
          } else if (size_bytes < 1024 * 1024 * 1024) {
            size_human = `${(size_bytes / (1024 * 1024)).toFixed(1)} MB`;
          } else {
            size_human = `${(size_bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
          }
          
          // Get file type
          const fileCmd = `file -b ${escapedPath}`;
          const fileType = await executeCommand(fileCmd, terminalId);
          const is_binary = !fileType.toLowerCase().includes('text') && !fileType.toLowerCase().includes('empty');
          
          // Get line count for text files under 10MB
          let line_count: number | null = null;
          if (!is_binary && size_bytes < 10 * 1024 * 1024) {
            const wcCmd = `wc -l < ${escapedPath}`;
            const wcOutput = await executeCommand(wcCmd, terminalId);
            line_count = parseInt(wcOutput.trim()) || 0;
          }
          
          // Get extension
          const extension = path.includes('.') ? path.split('.').pop() || null : null;
          
          const lines = [
            `File: ${path}`,
            `Size: ${size_human} (${size_bytes} bytes)`,
            `Type: ${fileType.trim()}${extension ? ` (.${extension})` : ''}`,
            `Format: ${is_binary ? 'Binary' : 'Text'}`,
          ];
          
          if (line_count !== null) {
            lines.push(`Lines: ${line_count}`);
          }
          
          // Add helpful suggestions
          if (is_binary) {
            lines.push('\nNote: This is a binary file - cannot read with read_file');
          } else if (size_bytes > FILE_SIZE_LARGE_THRESHOLD_BYTES) {
            lines.push(`\nWarning: Large file (${size_human}) - consider using max_bytes parameter with read_file`);
          } else if (size_bytes > FILE_SIZE_WARNING_THRESHOLD_BYTES) {
            lines.push(`\nNote: File is ${size_human} - safe to read but consider if full content is needed`);
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
        const terminalId = await getActiveTerminalId();
        try {
          const maxBytes = max_bytes_per_file || 50000;
          const filePaths = paths.slice(0, 20); // Limit to 20 files
          
          const results: string[] = [];
          
          for (const path of filePaths) {
            const escapedPath = shellEscape(path);
            
            // Check if file exists first
            const testCmd = `test -f ${escapedPath} && echo "exists" || echo "missing"`;
            const testResult = await executeCommand(testCmd, terminalId);
            
            if (testResult.includes('missing')) {
              results.push(`=== ${path} ===\nFile not found\n`);
              continue;
            }
            
            // Read file with size limit
            const readCmd = `head -c ${maxBytes} ${escapedPath}`;
            const content = await executeCommand(readCmd, terminalId);
            
            if (content.includes('cannot open') || content.includes('Permission denied')) {
              results.push(`=== ${path} ===\nCannot read file: ${content}\n`);
            } else {
              const truncated = content.length >= maxBytes ? '\n\n... (truncated)' : '';
              results.push(`=== ${path} ===\n${content}${truncated}\n`);
            }
          }
          
          const combined = results.join('\n');
          
          // Truncate combined result to prevent context bloat
          return truncateToolResult(combined, TOOL_RESULT_MAX_CHARS * 2);
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
        const terminalId = await getActiveTerminalId();
        try {
          // Limit to 50 files for performance
          const filePaths = paths.slice(0, 50);
          
          // Build grep command
          const caseFlag = case_sensitive ? '' : '-i';
          const escapedPattern = shellEscape(pattern);
          const escapedPaths = filePaths.map(p => shellEscape(p)).join(' ');
          
          const command = `grep -n ${caseFlag} ${escapedPattern} ${escapedPaths} 2>/dev/null || echo "No matches found"`;
          const output = await executeCommand(command, terminalId);
          
          if (output.includes('No matches found') || !output.trim()) {
            return `No matches found for "${pattern}" in ${filePaths.length} file(s)`;
          }
          
          // Count matches
          const lines = output.trim().split('\n');
          const matchCount = lines.length;
          
          // Truncate large results
          const truncated = truncateToolResult(output);
          
          return `Found ${matchCount} matches for "${pattern}":\n\n${truncated}`;
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
        const terminalId = await getActiveTerminalId();
        try {
          // Use ls -la for detailed directory listing
          const command = `ls -la ${shellEscape(path)}`;
          const output = await executeCommand(command, terminalId);
          
          // Parse the output to count directories and files
          const lines = output.split('\n').filter(line => line.trim());
          const entries = lines.slice(1); // Skip header line
          
          const directories = entries.filter(line => line.startsWith('d')).length;
          const files = entries.filter(line => !line.startsWith('d') && !line.startsWith('total')).length;
          
          return `Contents of ${path}:\n${output}\n\nTotal: ${directories} directories, ${files} files`;
        } catch (error) {
          return `Error listing directory: ${error}`;
        }
      },
    }),

    search_files: tool({
      description: `Search for files by name pattern. Use for finding files by name.

Examples:
- Find all Python files: pattern="*.py"
- Find TypeScript files: pattern="*.ts"
- Find config files: pattern="*config*"`,
      inputSchema: z.object({
        pattern: z.string().describe('File name pattern to search for'),
        path: z.string().optional().describe('Directory to search in (defaults to current)'),
      }),
      execute: async ({ pattern, path }) => {
        const terminalId = await getActiveTerminalId();
        const searchPath = path || await getTerminalCwd(terminalId);
        
        try {
          // Use ls for simple pattern matching (works with shell wildcards)
          // For exact filename search, use both ls and find as fallback
          const isWildcard = pattern.includes('*') || pattern.includes('?');
          
          let command: string;
          if (isWildcard) {
            // Use ls with wildcards
            command = `cd ${shellEscape(searchPath)} && ls -1 ${pattern} 2>/dev/null || echo ""`;
          } else {
            // Search for exact filename recursively with find
            command = `find ${shellEscape(searchPath)} -name ${shellEscape(pattern)} -type f 2>&1 | grep -v 'Permission denied' | head -100`;
          }
          
          const output = await executeCommand(command, terminalId);
          
          if (!output || output.trim() === '' || output.includes('(no output)')) {
            return `No files found matching "${pattern}" in ${searchPath}`;
          }
          
          const matches = output.trim().split('\n').filter(line => line.trim());
          const count = matches.length;
          const displayMatches = matches.slice(0, 50); // Limit display to first 50
          
          const result = [
            `Found ${count} file(s) matching "${pattern}" in ${searchPath}:`,
            '',
            ...displayMatches.map(m => `  ${m}`),
          ];
          
          if (count > 50) {
            result.push('', `... and ${count - 50} more files (showing first 50)`);
          }
          
          return result.join('\n');
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
        const terminalId = await getActiveTerminalId();
        try {
          // Escape shell variable name
          const command = `echo "$${name}"`;
          const output = await executeCommand(command, terminalId);
          
          if (!output.trim()) {
            return `Environment variable ${name} is not set`;
          }
          
          return `${name}=${output.trim()}`;
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
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);
        try {
          // Use sed for find/replace via PTY
          const escapedPath = shellEscape(path);
          
          // Escape special sed characters in search and replace strings
          // For sed, we need to escape: / \ & 
          const sedEscapedSearch = search.replace(/[/\\&]/g, '\\$&').replace(/\n/g, '\\n');
          const sedEscapedReplace = replace.replace(/[/\\&]/g, '\\$&').replace(/\n/g, '\\n');
          
          // Use | as delimiter to avoid issues with / in strings
          const sedCommand = all 
            ? `s|${sedEscapedSearch}|${sedEscapedReplace}|g`
            : `s|${sedEscapedSearch}|${sedEscapedReplace}|`;
          
          // sed -i.bak works on both macOS and Linux
          const command = `sed -i.bak '${sedCommand}' ${escapedPath} && rm ${escapedPath}.bak`;
          
          const output = await executeCommand(command, terminalId);
          
          // Invalidate cache since file was modified
          fileCache.invalidate(path, cwd);
          
          if (output.includes('No such file') || output.includes('sed:')) {
            return `Error replacing in file: ${output}`;
          }
          
          return `Successfully replaced "${search}" with "${replace}" in ${path}${all ? ' (all occurrences)' : ' (first occurrence)'}`;
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
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);
        try {
          // Use base64 encoding to avoid heredoc issues with special characters
          const escapedPath = shellEscape(path);
          
          // Encode content as base64 (btoa works in browser)
          const base64Content = btoa(unescape(encodeURIComponent(content)));
          
          // Write using base64 decode (works on both macOS and Linux)
          const command = `echo '${base64Content}' | base64 -d > ${escapedPath}`;
          
          const output = await executeCommand(command, terminalId);
          
          // Invalidate cache since file was modified
          fileCache.invalidate(path, cwd);
          
          if (output.includes('No such file') || output.includes('cannot create') || output.includes('decode')) {
            return `Error writing file: ${output}`;
          }
          
          return `Successfully wrote ${content.length} bytes to ${path}`;
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
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);
        try {
          // Use base64 encoding to avoid heredoc issues
          const escapedPath = shellEscape(path);
          
          // Encode content as base64 (btoa works in browser)
          const base64Content = btoa(unescape(encodeURIComponent(content)));
          
          // Append using base64 decode
          const command = `echo '${base64Content}' | base64 -d >> ${escapedPath}`;
          
          const output = await executeCommand(command, terminalId);
          
          // Invalidate cache since file was modified
          fileCache.invalidate(path, cwd);
          
          if (output.includes('No such file') || output.includes('cannot create') || output.includes('decode')) {
            return `Error appending to file: ${output}`;
          }
          
          return `Successfully appended ${content.length} bytes to ${path}`;
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
        const terminalId = await getActiveTerminalId();
        try {
          const command = `git status --short`;
          const output = await executeCommand(command, terminalId);
          
          if (output.includes('not a git repository')) {
            return 'Not a git repository';
          }
          
          if (!output.trim()) {
            return 'Git repository is clean (no changes)';
          }
          
          // Get branch name too
          const branchCmd = `git branch --show-current`;
          const branch = await executeCommand(branchCmd, terminalId);
          
          return `Branch: ${branch.trim()}\n\nStatus:\n${output}`;
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
        const terminalId = await getActiveTerminalId();
        try {
          const escapedPattern = shellEscape(pattern);
          const command = `ps aux | grep ${escapedPattern} | grep -v grep`;
          const output = await executeCommand(command, terminalId);
          
          if (!output.trim()) {
            return `No processes found matching "${pattern}"`;
          }
          
          const lines = output.trim().split('\n');
          return `Found ${lines.length} process(es) matching "${pattern}":\n\n${output}`;
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
        const terminalId = await getActiveTerminalId();
        try {
          // Try lsof first (works on macOS/Linux), fallback to netstat
          const command = `lsof -i :${port} 2>/dev/null || netstat -an | grep ${port} 2>/dev/null || echo "Port ${port} is not in use"`;
          const output = await executeCommand(command, terminalId);
          
          if (output.includes('not in use')) {
            return `Port ${port} is not in use`;
          }
          
          return `Port ${port} status:\n${output}`;
        } catch (error) {
          return `Error checking port: ${error}`;
        }
      },
    }),

    get_system_info: tool({
      description: `Get system information including OS, architecture, and disk space. Useful for debugging environment issues.`,
      inputSchema: z.object({}),
      execute: async () => {
        const terminalId = await getActiveTerminalId();
        try {
          const command = `uname -a && echo "---" && df -h / && echo "---" && free -h 2>/dev/null || vm_stat`;
          const output = await executeCommand(command, terminalId);
          
          return `System Information:\n\n${output}`;
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
        const terminalId = await getActiveTerminalId();
        try {
          const escapedPath = shellEscape(path);
          const lineCount = lines || 50;
          
          const command = `tail -n ${lineCount} ${escapedPath}`;
          const output = await executeCommand(command, terminalId);
          
          if (output.includes('No such file') || output.includes('cannot open')) {
            return `Error: File not found or cannot access: ${path}`;
          }
          
          const actualLines = output.split('\n').length;
          return `Last ${actualLines} lines of ${path}:\n\n${output}`;
        } catch (error) {
          return `Error reading file tail: ${error}`;
        }
      },
    }),

    make_directory: tool({
      description: `Create a directory (and parent directories if needed).

Examples:
- Create nested: path="project/src/components"
- Create single: path="new_folder"`,
      inputSchema: z.object({
        path: z.string().describe('Path to the directory to create'),
      }),
      execute: async ({ path }) => {
        const terminalId = await getActiveTerminalId();
        try {
          const escapedPath = shellEscape(path);
          
          const command = `mkdir -p ${escapedPath} && echo "Created directory: ${path}"`;
          const output = await executeCommand(command, terminalId);
          
          if (output.includes('cannot create') || output.includes('Permission denied')) {
            return `Error creating directory: ${output}`;
          }
          
          return output.trim() || `Successfully created directory: ${path}`;
        } catch (error) {
          return `Error creating directory: ${error}`;
        }
      },
    }),

    get_git_diff: tool({
      description: `Get uncommitted changes in the git repository. Shows what has been modified but not yet committed.`,
      inputSchema: z.object({}),
      execute: async () => {
        const terminalId = await getActiveTerminalId();
        try {
          const command = `git diff`;
          const output = await executeCommand(command, terminalId);
          
          if (output.includes('not a git repository')) {
            return 'Not a git repository';
          }
          
          if (!output.trim()) {
            return 'No uncommitted changes';
          }
          
          // Truncate large diffs
          return truncateToolResult(output, TOOL_RESULT_MAX_CHARS * 2);
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

Examples:
- Recent commands: count=20
- Find git commands: filter="git", count=50`,
      inputSchema: z.object({
        count: z.number().optional().describe('Number of commands to retrieve (default: 50, max: 500)'),
        filter: z.string().optional().describe('Filter commands containing this text (case-insensitive)'),
      }),
      execute: async ({ count, filter }) => {
        const terminalId = await getActiveTerminalId();
        try {
          const lineCount = Math.min(count || 50, 500);
          
          // Try both bash and zsh history files
          let command = `tail -n ${lineCount} ~/.bash_history 2>/dev/null || tail -n ${lineCount} ~/.zsh_history 2>/dev/null || echo "No history file found"`;
          
          if (filter) {
            const escapedFilter = shellEscape(filter);
            command = `(tail -n ${lineCount * 2} ~/.bash_history 2>/dev/null || tail -n ${lineCount * 2} ~/.zsh_history 2>/dev/null) | grep -i ${escapedFilter} | tail -n ${lineCount}`;
          }
          
          const output = await executeCommand(command, terminalId);
          
          if (output.includes('No history file found') || !output.trim()) {
            return 'No shell history found';
          }
          
          const lines = output.trim().split('\n');
          return `Shell history (${lines.length} commands${filter ? ` matching "${filter}"` : ''}):\n\n${output}`;
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
        const terminalId = await getActiveTerminalId();
        try {
          const escapedPath = shellEscape(path);
          const context = context_lines || 2;
          const maxHits = Math.min(max_matches || 50, 200);
          
          // Build grep pattern - common error keywords
          const errorPatterns = [
            'error', 'Error', 'ERROR',
            'fatal', 'Fatal', 'FATAL',
            'panic', 'Panic', 'PANIC',
            'exception', 'Exception', 'EXCEPTION',
            'failed', 'Failed', 'FAILED',
            'crash', 'Crash', 'CRASH',
            'killed', 'Killed', 'KILLED',
            'timeout', 'Timeout', 'TIMEOUT'
          ];
          
          if (custom_patterns) {
            errorPatterns.push(...custom_patterns);
          }
          
          // Use grep with extended regex and context
          const pattern = errorPatterns.join('|');
          const command = `grep -E -n -${context === 0 ? '' : `${context}`} '${pattern}' ${escapedPath} 2>/dev/null | head -n ${maxHits * (context * 2 + 1)}`;
          
          const output = await executeCommand(command, terminalId);
          
          if (!output.trim()) {
            return `No error patterns found in ${path}`;
          }
          
          return `Found errors in ${path} (showing up to ${maxHits} matches with ${context} lines context):\n\n${output}`;
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
        const terminalId = await getActiveTerminalId();
        try {
          const escapedPath = shellEscape(path);
          const maxL = Math.min(max_lines || 200, 500);
          const endL = end_line || (start_line + maxL - 1);
          
          // Use sed to extract line range
          const command = `sed -n '${start_line},${endL}p' ${escapedPath}`;
          const output = await executeCommand(command, terminalId);
          
          if (!output.trim()) {
            return `No content found in lines ${start_line}-${endL} of ${path}`;
          }
          
          const actualLines = output.split('\n').length;
          return `Lines ${start_line}-${start_line + actualLines - 1} from ${path}:\n\n${output}`;
        } catch (error) {
          return `Error reading file sections: ${error}`;
        }
      },
    }),

    diff_files: tool({
      description: `Compare two files using diff command.

Use this when:
- Comparing two versions of a file
- Reviewing differences between files
- Understanding what changed

Output shows:
- Lines added (+)
- Lines removed (-)
- Context around changes`,
      inputSchema: z.object({
        file1: z.string().describe('First file path'),
        file2: z.string().describe('Second file path'),
      }),
      execute: async ({ file1, file2 }) => {
        const terminalId = await getActiveTerminalId();
        try {
          const escapedFile1 = shellEscape(file1);
          const escapedFile2 = shellEscape(file2);
          
          const command = `diff -u ${escapedFile1} ${escapedFile2} || true`;
          const output = await executeCommand(command, terminalId);
          
          if (!output.trim()) {
            return `Files are identical: ${file1} and ${file2}`;
          }
          
          if (output.includes('No such file')) {
            return `Error: One or both files not found`;
          }
          
          // Truncate large diffs
          return truncateToolResult(output, TOOL_RESULT_MAX_CHARS * 2);
        } catch (error) {
          return `Error comparing files: ${error}`;
        }
      },
    }),
  };
}
