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
import {
  ptyTools,
  shellEscape,
  createFileWriteCommand,
  truncateToolResult,
  COMMAND_TIMEOUT_QUICK_MS,
  COMMAND_TIMEOUT_DEFAULT_MS,
  COMMAND_TIMEOUT_LONG_MS,
} from './pty/securedPtyTools';

const log = createLogger('AITools');

const FILE_SIZE_WARNING_THRESHOLD_BYTES = 100 * 1024;
const FILE_SIZE_LARGE_THRESHOLD_BYTES = 1024 * 1024;
const TOOL_RESULT_MAX_CHARS = 8000; // Re-export for compatibility

// Quick commands for timeout optimization
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
export function getCommandTimeout(command: string): number {
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

async function requestApproval(params: {
  command: string;
  description?: string; // Human-friendly summary
  contentPreview?: string; // For file operations, preview of content
  terminalId: number;
  cwd?: string;
  reason: string;
  category: string;
  onPendingApproval?: (approval: PendingApproval) => void;
}): Promise<string> {
  const { command, description, contentPreview, terminalId, cwd, reason, category, onPendingApproval } = params;

  if (!onPendingApproval) {
    throw new Error('Approval required but handler is not available');
  }

  const approval: PendingApproval = {
    id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    command,
    description,
    contentPreview,
    reason,
    category,
    terminalId,
    cwd,
    timestamp: Date.now(),
  };

  const approvalPromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pendingApprovalPromises.has(approval.id)) {
        pendingApprovalPromises.delete(approval.id);
        reject(new Error('Approval timed out after 10 minutes'));
      }
    }, APPROVAL_TIMEOUT_MS);

    pendingApprovalPromises.set(approval.id, { resolve, reject, timer });
  });

  onPendingApproval(approval);

  return approvalPromise;
}

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
export async function getTerminalCwd(terminalId: number): Promise<string> {
  try {
    const result = await executeInPty({
      terminalId,
      command: 'pwd',
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
    const cwd = result.output.trim();
    log.debug('[getTerminalCwd] Got CWD:', { terminalId, cwd, rawOutput: result.output });

    // Defensive: detect if cwd looks duplicated (contains multiple spaces with same path)
    if (cwd.includes(' ') && cwd.split(' ').length > 1) {
      log.warn('[getTerminalCwd] CWD appears duplicated:', cwd);
      // Return just the first path
      return cwd.split(' ')[0];
    }

    return cwd;
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
 */
async function executeCommand(
  command: string, 
  terminalId: number
): Promise<string> {
  const timeoutMs = getCommandTimeout(command);

  log.debug('Executing command', { 
    command: command.substring(0, 50), 
    timeoutMs
  });
  
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
  
  // Create file read cache for this tool set
  // Avoids re-reading the same file multiple times in one agent turn
  const fileCache = createFileReadCache();
  
  return {
    get_current_directory: tool({
      description: `Get the current working directory of the active terminal.`,
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
        try {
          return await ptyTools.readFile(path, max_bytes);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
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
        max_bytes_per_file: z.number().max(500000).optional().describe('Max bytes per file (default: 50000, max: 500000)'),
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
      description: `List files and directories in a path. Shows file sizes and permissions.

Examples:
- List current: path="."
- List specific: path="/var/log"
- List subdirectory: path="src/components"`,
      inputSchema: z.object({
        path: z.string().optional().describe('Path to list (default: current directory)'),
      }),
      execute: async ({ path }) => {
        try {
          return await ptyTools.listDirectory(path || '.');
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
        }
      },
    }),

    search_files: tool({
      description: `Search for files by name or pattern. Fast file system search.

Examples:
- Find all JS files: path=".", pattern="*.js"
- Find config: path=".", pattern="*config*"
- Specific dir: path="src", pattern="*.tsx"`,
      inputSchema: z.object({
        path: z.string().optional().describe('Directory to search (default: current)'),
        pattern: z.string().describe('File name pattern (supports wildcards: *, ?)'),
      }),
      execute: async ({ path, pattern }) => {
        try {
          const result = await ptyTools.findFiles(path || '.', pattern);
          
          if (!result.trim()) {
            return `No files found matching pattern "${pattern}"`;
          }
          
          return result;
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
        }
      },
    }),

    grep_in_files: tool({
      description: `Search for a pattern within specific files. Fast grep/search operation.

Use this when:
- Looking for specific error messages in logs
- Finding where a variable/function is used
- Searching for TODO/FIXME comments

Examples:
- Find error: pattern="ConnectionError", paths=["app.log"]
- Search function: pattern="handleRequest", paths=["src/server.ts"]`,
      inputSchema: z.object({
        pattern: z.string().describe('Text pattern to search for'),
        paths: z.array(z.string()).describe('Array of file paths to search (max 50)'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive search (default: false)'),
        context: z.number().optional().describe('Lines of context (default: 0)'),
      }),
      execute: async ({ pattern, paths, case_sensitive, context }) => {
        try {
          const results: string[] = [];
          
          for (const path of paths.slice(0, 50)) {
            try {
              const result = await ptyTools.grep(pattern, path, {
                caseInsensitive: !case_sensitive,
                context: context || 0,
                maxHits: 50,
              });
              
              if (result.trim()) {
                results.push(`=== ${path} ===\n${result}`);
              }
            } catch {
              // Skip files that can't be read
            }
          }
          
          if (results.length === 0) {
            return `Pattern "${pattern}" not found in any files`;
          }
          
          return results.join('\n\n');
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
        }
      },
    }),

    rg_search: tool({
      description: `Fast recursive text search using ripgrep. Searches entire directory trees.

Examples:
- Find TODO: pattern="TODO", path="src"
- Find import: pattern="import.*React", path="."`,
      inputSchema: z.object({
        pattern: z.string().describe('Search pattern (supports regex)'),
        path: z.string().optional().describe('Directory to search (default: current)'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive (default: true)'),
        context: z.number().optional().describe('Lines of context (default: 0)'),
        max_hits: z.number().optional().describe('Max results (default: 50)'),
      }),
      execute: async ({ pattern, path, case_sensitive, context, max_hits }) => {
        try {
          const result = await ptyTools.grep(pattern, path || '.', {
            caseInsensitive: !case_sensitive,
            context: context || 0,
            maxHits: max_hits || 50,
          });
          
          if (!result.trim()) {
            return `No matches found for "${pattern}"`;
          }
          
          return result;
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
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
          const trimmed = name.trim();
          const isValidName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmed);
          if (!isValidName) {
            return `Error: Invalid environment variable name "${name}". Use letters, digits, and underscores only, and do not start with a digit.`;
          }
          
          // Escape shell variable name
          const command = `printenv ${trimmed}`;
          const output = await executeCommand(command, terminalId);
          
          if (!output.trim()) {
            return `Environment variable ${trimmed} is not set`;
          }
          
          return `${trimmed}=${output.trim()}`;
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
- Requires user approval before applying changes

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
          // For sed with | delimiter, escape: | \ &
          // Also escape newlines for sed compatibility
          const sedEscapedSearch = search.replace(/[|\\&]/g, '\\$&').replace(/\n/g, '\\n');
          const sedEscapedReplace = replace.replace(/[|\\&]/g, '\\$&').replace(/\n/g, '\\n');
          
          // Use | as delimiter to avoid issues with / in strings
          const sedCommand = all 
            ? `s|${sedEscapedSearch}|${sedEscapedReplace}|g`
            : `s|${sedEscapedSearch}|${sedEscapedReplace}|`;
          
          // sed -i.bak works on both macOS and Linux
          const command = `sed -i.bak '${sedCommand}' ${escapedPath} && rm ${escapedPath}.bak`;
          
          try {
            // Extract filename from path for clean description
            const filename = path.split('/').pop() || path;
            const approvalResult = await requestApproval({
              command,
              description: `Replace text in ${filename}`,
              terminalId,
              cwd,
              reason: 'Replace text in file',
              category: 'file-write',
              onPendingApproval,
            });

            // Invalidate cache since file was modified
            fileCache.invalidate(path, cwd);

            if (approvalResult.startsWith('Command failed') || approvalResult.startsWith('Error')) {
              return `Error replacing in file: ${approvalResult}`;
            }

            return `Successfully replaced "${search}" with "${replace}" in ${path}${all ? ' (all occurrences)' : ' (first occurrence)'}`;
          } catch (error) {
            return `Command not executed: ${error instanceof Error ? error.message : 'User cancelled'}`;
          }
        } catch (error) {
          return `Error replacing in file: ${error}`;
        }
      },
    }),

    write_file: tool({
      description: `Write content to a file (creates new file or overwrites existing).
Runs in the active terminal environment (local, SSH, container).
Requires user approval before writing.

Examples:
- Local: Use this tool with path="config.json", content="{\\"key\\": \\"value\\"}"
- Remote (SSH): Use this tool the same way; it writes in the active terminal session`,
      inputSchema: z.object({
        path: z.string().describe('Path to the file (absolute or relative)'),
        content: z.string().describe('Content to write to the file'),
      }),
      execute: async ({ path, content }) => {
        const terminalId = await getActiveTerminalId();
        const cwd = await getTerminalCwd(terminalId);
        try {
          // Create heredoc command (falls back to base64 if needed)
          const command = createFileWriteCommand(path, content, false);

          try {
            // Extract filename from path for clean description
            const filename = path.split('/').pop() || path;

            // Create content preview (first 500 chars or 10 lines, whichever is smaller)
            const lines = content.split('\n');
            const preview = lines.length > 10
              ? lines.slice(0, 10).join('\n') + '\n...(truncated)'
              : content.length > 500
                ? content.slice(0, 500) + '\n...(truncated)'
                : content;

            const approvalResult = await requestApproval({
              command,
              description: `Write to ${filename}`,
              contentPreview: preview,
              terminalId,
              cwd,
              reason: 'Write file content',
              category: 'file-write',
              onPendingApproval,
            });

            // Invalidate cache since file was modified
            fileCache.invalidate(path, cwd);

            if (approvalResult.startsWith('Command failed') || approvalResult.startsWith('Error')) {
              return `Error writing file: ${approvalResult}`;
            }

            return `Successfully wrote ${content.length} bytes to ${path}`;
          } catch (error) {
            return `Command not executed: ${error instanceof Error ? error.message : 'User cancelled'}`;
          }
        } catch (error) {
          return `Error writing file: ${error}`;
        }
      },
    }),

    append_to_file: tool({
      description: `Append content to the end of a file. Creates file if it doesn't exist.
Requires user approval before writing.

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
          // Create heredoc command for appending (falls back to base64 if needed)
          const command = createFileWriteCommand(path, content, true);

          try {
            // Extract filename from path for clean description
            const filename = path.split('/').pop() || path;

            // Create content preview
            const lines = content.split('\n');
            const preview = lines.length > 10
              ? lines.slice(0, 10).join('\n') + '\n...(truncated)'
              : content.length > 500
                ? content.slice(0, 500) + '\n...(truncated)'
                : content;

            const approvalResult = await requestApproval({
              command,
              description: `Append to ${filename}`,
              contentPreview: preview,
              terminalId,
              cwd,
              reason: 'Append content to file',
              category: 'file-write',
              onPendingApproval,
            });

            // Invalidate cache since file was modified
            fileCache.invalidate(path, cwd);

            if (approvalResult.startsWith('Command failed') || approvalResult.startsWith('Error')) {
              return `Error appending to file: ${approvalResult}`;
            }

            return `Successfully appended ${content.length} bytes to ${path}`;
          } catch (error) {
            return `Command not executed: ${error instanceof Error ? error.message : 'User cancelled'}`;
          }
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
        try {
          const status = await ptyTools.gitStatus();
          
          if (status.includes('not a git repository')) {
            return 'Not a git repository';
          }
          
          if (!status.trim()) {
            return 'Git repository is clean (no changes)';
          }
          
          return status;
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
        }
      },
    }),

    get_git_diff: tool({
      description: `Get uncommitted changes in the git repository. Shows what has been modified but not yet committed.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const diff = await ptyTools.gitDiff(false);
          
          if (diff.includes('not a git repository')) {
            return 'Not a git repository';
          }
          
          if (!diff.trim()) {
            return 'No uncommitted changes';
          }
          
          return truncateToolResult(diff, TOOL_RESULT_MAX_CHARS * 2);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
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
          return await ptyTools.findProcess(pattern);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
        }
      },
    }),

    check_port: tool({
      description: `Check if a network port is in use and what process is using it.

Examples:
- Check web port: port=8080
- Check database: port=5432`,
      inputSchema: z.object({
        port: z.number().int().min(1).max(65535).describe('Port number to check (e.g., 8080, 3000)'),
      }),
      execute: async ({ port }) => {
        try {
          return await ptyTools.checkPort(port);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
        }
      },
    }),

    get_system_info: tool({
      description: `Get system information including OS, architecture, and disk space. Useful for debugging environment issues.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await ptyTools.getSystemInfo();
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
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
        const cwd = await getTerminalCwd(terminalId);
        try {
          const escapedPath = shellEscape(path);
          
          const command = `mkdir -p ${escapedPath} && echo "Created directory: ${path}"`;
          
          try {
            const approvalResult = await requestApproval({
              command,
              terminalId,
              cwd,
              reason: 'Create directory',
              category: 'file-write',
              onPendingApproval,
            });

            if (approvalResult.startsWith('Command failed') || approvalResult.startsWith('Error')) {
              return `Error creating directory: ${approvalResult}`;
            }

            return approvalResult.trim() || `Successfully created directory: ${path}`;
          } catch (error) {
            return `Command not executed: ${error instanceof Error ? error.message : 'User cancelled'}`;
          }
          
        } catch (error) {
          return `Error creating directory: ${error}`;
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
- More history: count=100`,
      inputSchema: z.object({
        count: z.number().optional().describe('Number of commands to retrieve (default: 50, max: 200)'),
      }),
      execute: async ({ count }) => {
        try {
          return await ptyTools.getShellHistory(count || 50);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
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
        context_lines: z.number().max(20).optional().describe('Lines of context before/after each match (default: 2, max: 20)'),
        max_matches: z.number().optional().describe('Maximum matches to return (default: 50, max: 200)'),
        custom_patterns: z.array(z.string()).optional().describe('Additional patterns to search for'),
      }),
      execute: async ({ path, context_lines, max_matches, custom_patterns }) => {
        try {
          const context = context_lines || 2;
          const maxHits = Math.min(max_matches || 50, 200);
          
          // Build error pattern (regex alternation)
          const errorPatterns = [
            'error', 'Error', 'ERROR',
            'fatal', 'Fatal', 'FATAL',
            'panic', 'Panic', 'PANIC',
            'exception', 'Exception', 'EXCEPTION',
            'failed', 'Failed', 'FAILED',
            'crash', 'Crash', 'CRASH',
            'killed', 'Killed', 'KILLED',
            'timeout', 'Timeout', 'TIMEOUT',
          ];
          
          if (custom_patterns) {
            errorPatterns.push(...custom_patterns);
          }
          
          const pattern = errorPatterns.join('|');
          
          const result = await ptyTools.grep(pattern, path, {
            caseInsensitive: false,
            context,
            maxHits,
          });
          
          if (!result.trim()) {
            return `No error patterns found in ${path}`;
          }
          
          return `Found errors in ${path} (showing up to ${maxHits} matches with ${context} lines context):\n\n${result}`;
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
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
        try {
          const result = await ptyTools.diffFiles(file1, file2);
          
          if (!result.trim()) {
            return `Files are identical: ${file1} and ${file2}`;
          }
          
          if (result.includes('No such file')) {
            return `Error: One or both files not found`;
          }
          
          return truncateToolResult(result, TOOL_RESULT_MAX_CHARS * 2);
        } catch (error) {
          return `Error: ${error instanceof Error ? error.message : error}`;
        }
      },
    }),

    project_structure: tool({
      description: `Get an overview of the project structure. Shows directory tree with files.

This is useful when:
- First time exploring a new codebase
- User asks "what files are in this project?"
- Need to understand the project layout before making changes
- Looking for specific types of files (config, tests, source code)

Returns a tree view of the project with smart filtering (excludes node_modules, .git, etc.)

Examples:
- Get structure: path="." (current directory)
- Specific directory: path="src"
- Deeper scan: max_depth=3`,
      inputSchema: z.object({
        path: z.string().optional().describe('Directory to scan (defaults to current)'),
        max_depth: z.number().optional().describe('Maximum depth to scan (default: 2, max: 4)'),
      }),
      execute: async ({ path, max_depth }) => {
        const terminalId = await getActiveTerminalId();
        const searchPath = path || await getTerminalCwd(terminalId);
        const depth = Math.min(max_depth || 2, 4);
        
        try {
          // Use find with smart filtering - exclude common noise directories
          const command = `find ${shellEscape(searchPath)} -maxdepth ${depth} \\
            -not -path '*/node_modules/*' \\
            -not -path '*/.git/*' \\
            -not -path '*/dist/*' \\
            -not -path '*/build/*' \\
            -not -path '*/.next/*' \\
            -not -path '*/target/*' \\
            -not -path '*/__pycache__/*' \\
            -not -path '*/.pytest_cache/*' \\
            -not -path '*/.venv/*' \\
            -not -path '*/venv/*' \\
            -not -path '*/.idea/*' \\
            -not -path '*/.vscode/*' \\
            | head -500 \\
            | sort`;
          
          const output = await executeCommand(command, terminalId);
          
          if (!output.trim() || output.includes('No such file')) {
            return `Cannot access directory: ${searchPath}`;
          }
          
          const lines = output.trim().split('\n');
          const fileCount = lines.filter(l => !l.endsWith('/')).length;
          const dirCount = lines.filter(l => l.endsWith('/')).length;
          
          // Format as tree-like structure
          const formatted = lines.map(line => {
            const relativePath = line.replace(searchPath, '.');
            const depth = (relativePath.match(/\//g) || []).length;
            const indent = '  '.repeat(depth - 1);
            const name = relativePath.split('/').pop() || relativePath;
            return `${indent}${name}`;
          }).join('\n');
          
          const summary = `Project structure (${searchPath}):\n${fileCount} files, ${dirCount} directories (depth: ${depth}, filtered)\n\n${formatted}`;
          
          // Truncate if too large
          return truncateToolResult(summary, TOOL_RESULT_MAX_CHARS * 2);
        } catch (error) {
          return `Error getting project structure: ${error}`;
        }
      },
    }),
  };
}

/**
 * Create enhanced tools with MCP integration via Rust backend
 *
 * Combines core PTY-based tools with community MCP server tools.
 * Core tools (execute_command, analyze_error, etc.) take precedence over MCP tools.
 *
 * MCP servers run in Rust backend via rmcp SDK, avoiding Node.js API limitations.
 */

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  env?: Record<string, string>;
  api_key_env_var?: string; // Environment variable name for API key (e.g., "BRAVE_API_KEY")
  api_key?: string; // The API key value (stored securely)
}

interface MCPToolInfo {
  name: string;
  description?: string;
  input_schema: any;
}

// Helper to detect if a tool requires approval
function requiresApproval(toolName: string): boolean {
  const approvalRequired = [
    'write_file',
    'append_file',
    'replace_in_file',
    'create_directory',
    'write_to_file',
    'edit_file',
    'move_file',
    'delete_file',
    'git_commit',
    'git_push',
  ];
  return approvalRequired.includes(toolName);
}

export async function createEnhancedTools(
  requireApproval: boolean = true,
  onPendingApproval?: (approval: PendingApproval) => void,
  mcpServerConfigs?: MCPServerConfig[],
  workingDirectory?: string
): Promise<Record<string, any>> {
  log.info('[MCP] Creating enhanced tools with MCP integration');

  // 1. Get core tools (PTY-based, our unique value)
  const coreTools = createTools(requireApproval, onPendingApproval);
  log.info(`[MCP] Core tools loaded: ${Object.keys(coreTools).length} tools`);

  try {
    // 2. Get working directory
    const terminalId = await invoke<number>("get_active_terminal");
    const cwd = workingDirectory || (await getTerminalCwd(terminalId));

    // 3. Initialize MCP servers in Rust backend
    const configs = mcpServerConfigs || getDefaultMCPServers();
    
    // Inject API keys into environment variables for each server
    const configsWithEnv = configs.map(config => {
      if (config.api_key_env_var && config.api_key) {
        return {
          ...config,
          env: {
            ...config.env,
            [config.api_key_env_var]: config.api_key,
          },
        };
      }
      return config;
    });
    
    const initializedServers = await invoke<string[]>("init_mcp_servers", {
      configs: configsWithEnv,
      workingDirectory: cwd,
    });

    log.info(`[MCP] Initialized servers: ${initializedServers.join(", ")}`);

    // 4. Get available MCP tools
    const mcpToolInfos = await invoke<MCPToolInfo[]>("list_mcp_tools");
    log.info(`[MCP] Discovered ${mcpToolInfos.length} MCP tools`);

    // 5. Convert MCP tools to Vercel AI SDK format
    const mcpTools: Record<string, any> = {};
    for (const mcpTool of mcpToolInfos) {
      // Skip if core tool has same name (core tools take precedence)
      if (coreTools[mcpTool.name as keyof typeof coreTools]) {
        log.debug(
          `[MCP] Skipping tool ${mcpTool.name} (overridden by core tool)`
        );
        continue;
      }

      mcpTools[mcpTool.name] = tool({
        description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
        inputSchema: z.object({}).passthrough(), // Accept any parameters (JSON Schema conversion TBD)
        execute: async (params: Record<string, unknown>) => {
          try {
            log.debug(`[MCP] Executing tool: ${mcpTool.name}`);

            // Check if tool requires approval
            if (requireApproval && requiresApproval(mcpTool.name)) {
              log.debug(`[MCP] Tool ${mcpTool.name} requires approval`);

              return new Promise<string>((resolve, reject) => {
                const approvalId = `mcp_${Date.now()}_${Math.random()}`;

                if (onPendingApproval) {
                  onPendingApproval({
                    id: approvalId,
                    terminalId,
                    command: `MCP: ${mcpTool.name}`,
                    description: JSON.stringify(params, null, 2),
                    cwd,
                    timestamp: Date.now(),
                    reason: "MCP tool approval",
                    category: "mcp_tool",
                    mcpToolName: mcpTool.name,
                    mcpToolParams: params,
                    onApprove: async () => {
                      try {
                        const result = await invoke<string>("call_mcp_tool", {
                          toolName: mcpTool.name,
                          params,
                        });
                        resolve(result);
                      } catch (error) {
                        reject(error);
                      }
                    },
                    onReject: () => {
                      reject(new Error("User denied approval"));
                    },
                  } as any); // Type will be extended in AIContext
                } else {
                  reject(new Error("Approval required but no handler provided"));
                }
              });
            }

            // Execute without approval
            const result = await invoke<string>("call_mcp_tool", {
              toolName: mcpTool.name,
              params,
            });
            return result;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            log.error(`[MCP] Tool ${mcpTool.name} failed:`, errorMsg);
            return `Error calling MCP tool ${mcpTool.name}: ${errorMsg}`;
          }
        },
      });
    }

    log.info(
      `[MCP] Enhanced tools ready: ${Object.keys(coreTools).length} core + ${
        Object.keys(mcpTools).length
      } MCP`
    );

    // 6. Return merged tools (core tools override MCP if names conflict)
    return {
      ...mcpTools, // MCP tools first
      ...coreTools, // Core tools override
    };
  } catch (error) {
    log.error("[MCP] Failed to initialize MCP:", error);
    // Fall back to core tools only
    log.warn("[MCP] Falling back to core tools only (no MCP)");
    return coreTools;
  }
}

function getDefaultMCPServers(): MCPServerConfig[] {
  return [
    // Brave Search - Web search for documentation, errors, and solutions
    // Requires API key from https://brave.com/search/api/
    {
      name: "brave-search",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-brave-search"],
      enabled: false,  // User must add API key in settings first
      api_key_env_var: "BRAVE_API_KEY",  // Environment variable name
      api_key: "",  // User sets this in Settings UI
      env: {},  // Will be populated with API key at runtime
    },
    // Note: Filesystem operations use PTY tools (work over SSH/remote)
    // Only add MCPs for external APIs (GitHub, Slack, databases, etc.)
  ];
}

