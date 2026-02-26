/**
 * Secured PTY Tools - High-level wrapper for terminal-aware AI tools
 * 
 * Provides centralized security, command building, and execution
 * for all PTY-based tools. Eliminates code duplication and ensures
 * consistent security validation.
 */

import { invoke } from '@tauri-apps/api/core';
import { executeInPty } from '../../terminal/core/executeInPty';
import { validatePath, validateEnvVar } from '../security/pathValidator';
import type { PendingApproval } from '../../context/AIContext';
import { createLogger } from '../../utils/logger';

const log = createLogger('SecuredPtyTools');

// Timeout constants
export const COMMAND_TIMEOUT_QUICK_MS = 10_000;
export const COMMAND_TIMEOUT_DEFAULT_MS = 30_000;
export const COMMAND_TIMEOUT_LONG_MS = 120_000;

// Result size limits
const TOOL_RESULT_MAX_CHARS = 8000;

/**
 * Escape shell arguments for safe command execution
 * Uses single quotes and escapes embedded single quotes
 */
export function shellEscape(str: string): string {
  if (!str) return "''";
  return `'${str.replace(/'/g, "'\\''")}'`;
}

/**
 * Create a shell command to write content to a file using base64 encoding.
 * Base64 is used because heredocs don't work reliably with PTY execution.
 */
export function createFileWriteCommand(
  path: string,
  content: string,
  append: boolean = false
): string {
  const escapedPath = shellEscape(path);
  const redirect = append ? '>>' : '>';
  const base64Content = btoa(unescape(encodeURIComponent(content)));
  // Escape single quotes in base64 content to prevent shell injection
  const safeBase64 = base64Content.replace(/'/g, "'\\''");
  return `echo '${safeBase64}' | base64 -d ${redirect} ${escapedPath}`;
}

/**
 * Truncate large tool results to prevent context bloat
 * Uses head+tail strategy to keep beginning and end
 */
export function truncateToolResult(
  result: string,
  maxChars: number = TOOL_RESULT_MAX_CHARS
): string {
  if (result.length <= maxChars) {
    return result;
  }

  const headChars = Math.floor(maxChars / 2);
  const tailChars = Math.floor(maxChars / 2);

  let headCutoff = headChars;
  const headNewline = result.lastIndexOf('\n', headChars);
  if (headNewline > 0 && headNewline > headChars - 200) {
    headCutoff = headNewline;
  }

  let tailStart = result.length - tailChars;
  const tailNewline = result.indexOf('\n', tailStart);
  if (tailNewline > 0 && tailNewline < tailStart + 200) {
    tailStart = tailNewline + 1;
  }

  const head = result.substring(0, headCutoff);
  const tail = result.substring(tailStart);
  const omittedChars = result.length - headCutoff - (result.length - tailStart);
  const omittedLines = (result.substring(headCutoff, tailStart).match(/\n/g) || []).length;

  return `${head}\n\n... [TRUNCATED: ${omittedChars} characters, ~${omittedLines} lines omitted]\n\n${tail}`;
}

/**
 * Terminal context for command execution
 */
export interface PtyContext {
  terminalId: number;
  cwd: string;
  isRemote: boolean;
}

/**
 * Get PTY context for the active terminal
 */
export async function getPtyContext(): Promise<PtyContext> {
  const terminalId = await invoke<number>('get_active_terminal');
  const cwd = await getTerminalCwd(terminalId);
  const ptyInfo = await invoke<any>('get_pty_info', { id: terminalId });

  return {
    terminalId,
    cwd,
    isRemote: ptyInfo.pty_type === 'ssh',
  };
}

/**
 * Get terminal's current working directory
 */
async function getTerminalCwd(terminalId: number): Promise<string> {
  try {
    const result = await executeInPty({
      terminalId,
      command: 'pwd',
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
    const cwd = result.output.trim();

    // Handle duplicated output (sometimes command echoes input)
    // Split on newlines first, then use last line
    const lines = cwd.split('\n').filter(line => line.trim().length > 0);
    if (lines.length > 1) {
      // Return last non-empty line which should be actual pwd output
      return lines[lines.length - 1].trim();
    }

    return cwd;
  } catch (error) {
    log.error('Failed to get terminal CWD', error);
    return '~';
  }
}

/**
 * Command specification for safe execution
 */
export interface CommandSpec {
  program: string;
  args: string[];
}

/**
 * Build a safe shell command from specification
 * All arguments are individually escaped
 */
export function buildCommand(spec: CommandSpec): string {
  const escapedArgs = spec.args.map(arg => shellEscape(arg));
  return `${spec.program} ${escapedArgs.join(' ')}`;
}

/**
 * Approval request options
 */
export interface ApprovalOptions {
  command: string;
  description: string;
  terminalId: number;
  cwd: string;
  reason?: string;
  category?: string;
  contentPreview?: string;
}

/**
 * Execute command with approval flow
 */
async function requestApproval(
  options: ApprovalOptions,
  onPendingApproval?: (approval: PendingApproval) => void
): Promise<string> {
  if (!onPendingApproval) {
    throw new Error('Approval required but handler is not available');
  }

  const approval: PendingApproval = {
    id: `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    command: options.command,
    description: options.description,
    contentPreview: options.contentPreview,
    reason: options.reason || '',
    category: options.category || 'unknown',
    terminalId: options.terminalId,
    cwd: options.cwd,
    timestamp: Date.now(),
  };

  const approvalPromise = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Clean up map entry before rejecting to prevent memory leak
      pendingApprovalPromises.delete(approval.id);
      reject(new Error('Approval timed out after 10 minutes'));
    }, 10 * 60 * 1000);

    pendingApprovalPromises.set(approval.id, { resolve, reject, timer });
  });

  onPendingApproval(approval);
  return approvalPromise;
}

const pendingApprovalPromises = new Map<string, {
  resolve: (value: string) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

export function resolveApproval(id: string, result: string) {
  const promise = pendingApprovalPromises.get(id);
  if (promise) {
    clearTimeout(promise.timer);
    promise.resolve(result);
    pendingApprovalPromises.delete(id);
  }
}

export function rejectApproval(id: string, reason: string) {
  const promise = pendingApprovalPromises.get(id);
  if (promise) {
    clearTimeout(promise.timer);
    promise.reject(new Error(reason));
    pendingApprovalPromises.delete(id);
  }
}

/**
 * Execute command with security validation and optional approval
 */
export interface ExecuteOptions {
  ctx: PtyContext;
  command: string;
  requireApproval?: boolean;
  approvalDescription?: string;
  approvalCategory?: string;
  approvalContentPreview?: string;
  timeoutMs?: number;
  onPendingApproval?: (approval: PendingApproval) => void;
}

export async function executeSecured(options: ExecuteOptions): Promise<string> {
  const {
    ctx,
    command,
    requireApproval = false,
    approvalDescription,
    approvalCategory,
    approvalContentPreview,
    timeoutMs = COMMAND_TIMEOUT_DEFAULT_MS,
    onPendingApproval,
  } = options;

  // If approval required, go through approval flow
  if (requireApproval) {
    if (!approvalDescription) {
      throw new Error('Approval description required');
    }

    return requestApproval(
      {
        command,
        description: approvalDescription,
        terminalId: ctx.terminalId,
        cwd: ctx.cwd,
        reason: approvalDescription,
        category: approvalCategory,
        contentPreview: approvalContentPreview,
      },
      onPendingApproval
    );
  }

  // Execute via PTY
  const result = await executeInPty({
    terminalId: ctx.terminalId,
    command,
    timeoutMs,
  });

  if (result.exitCode !== 0) {
    throw new Error(result.output);
  }

  return result.output;
}

/**
 * File read cache to avoid re-reading files in the same agent turn
 */
interface FileReadCacheEntry {
  content: string;
  timestamp: number;
  cwd: string;
}

const FILE_CACHE_TTL_MS = 60_000;
const FILE_CACHE_MAX_ENTRIES = 50;

class FileReadCache {
  private cache = new Map<string, FileReadCacheEntry>();

  get(path: string, cwd: string): string | null {
    const key = this.normalizeKey(path, cwd);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() - entry.timestamp > FILE_CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.content;
  }

  set(path: string, cwd: string, content: string): void {
    const key = this.normalizeKey(path, cwd);

    if (this.cache.size >= FILE_CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      content,
      timestamp: Date.now(),
      cwd,
    });
  }

  invalidate(path: string, cwd: string): void {
    const key = this.normalizeKey(path, cwd);
    this.cache.delete(key);
  }

  private normalizeKey(path: string, cwd: string): string {
    const normalized = path.startsWith('/') ? path : `${cwd}/${path}`;
    return normalized.replace(/\/+/g, '/');
  }
}

const fileCache = new FileReadCache();

/**
 * High-level PTY tool primitives
 */
export const ptyTools = {
  /**
   * Read file contents with caching
   */
  async readFile(
    path: string,
    maxBytes: number = 50000
  ): Promise<string> {
    const ctx = await getPtyContext();

    // Check cache
    const cached = fileCache.get(path, ctx.cwd);
    if (cached !== null && maxBytes === 50000) {
      return cached;
    }

    // Validate path
    const validatedPath = await validatePath(path, ctx.terminalId, {
      operation: 'read',
      cwd: ctx.cwd,
    });

    // Build command
    const command = buildCommand({
      program: 'head',
      args: ['-c', maxBytes.toString(), validatedPath.absolutePath],
    });

    // Execute
    const result = await executeSecured({
      ctx,
      command: command + ' 2>&1',
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });

    // Truncate and cache
    const truncated = truncateToolResult(result);
    if (maxBytes === 50000) {
      fileCache.set(path, ctx.cwd, truncated);
    }

    return truncated;
  },

  /**
   * Write file with approval
   */
  async writeFile(
    path: string,
    content: string,
    append: boolean = false,
    onPendingApproval?: (approval: PendingApproval) => void
  ): Promise<string> {
    const ctx = await getPtyContext();

    // Validate path for write
    const validatedPath = await validatePath(path, ctx.terminalId, {
      operation: 'write',
      cwd: ctx.cwd,
    });

    // Build command
    const command = createFileWriteCommand(validatedPath.absolutePath, content, append);

    // Content preview
    const lines = content.split('\n');
    const preview = lines.length > 10
      ? lines.slice(0, 10).join('\n') + '\n...(truncated)'
      : content.length > 500
        ? content.slice(0, 500) + '\n...(truncated)'
        : content;

    // Execute with approval
    await executeSecured({
      ctx,
      command,
      requireApproval: true,
      approvalDescription: `${append ? 'Append to' : 'Write'} ${path}`,
      approvalCategory: 'file-write',
      approvalContentPreview: preview,
      timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
      onPendingApproval,
    });

    // Invalidate cache
    fileCache.invalidate(path, ctx.cwd);

    return `Successfully ${append ? 'appended to' : 'wrote'} ${path}`;
  },

  /**
   * Get environment variable with sensitive var blocking
   */
  async getEnvVar(varName: string): Promise<string> {
    // Validate var name
    validateEnvVar(varName);

    // Validate it's a valid variable name format
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
      throw new Error('Invalid environment variable name');
    }

    const ctx = await getPtyContext();

    const command = buildCommand({
      program: 'printenv',
      args: [varName],
    });

    const result = await executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });

    return result.trim();
  },

  /**
   * List directory contents
   */
  async listDirectory(path: string = '.'): Promise<string> {
    const ctx = await getPtyContext();

    const command = buildCommand({
      program: 'ls',
      args: ['-la', path],
    });

    return executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
  },

  /**
   * Search for files by pattern
   */
  async findFiles(
    searchPath: string,
    pattern: string,
    maxResults: number = 100
  ): Promise<string> {
    const ctx = await getPtyContext();

    const command = buildCommand({
      program: 'find',
      args: [searchPath, '-name', pattern, '-type', 'f'],
    });

    const result = await executeSecured({
      ctx,
      command: `${command} 2>&1 | grep -v 'Permission denied' | head -${maxResults}`,
      timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
    });

    return result;
  },

  /**
   * Grep search in files
   */
  async grep(
    pattern: string,
    searchPath: string = '.',
    options: {
      caseInsensitive?: boolean;
      context?: number;
      maxHits?: number;
    } = {}
  ): Promise<string> {
    const ctx = await getPtyContext();
    const { caseInsensitive = false, context = 0, maxHits = 50 } = options;

    // Try ripgrep first, fallback to grep
    const rgArgs = [
      '--line-number',
      '--max-count', maxHits.toString(),
      caseInsensitive ? '-i' : '',
      context > 0 ? `-C ${context}` : '',
      pattern,
      searchPath,
    ].filter(Boolean);

    const command = `rg ${rgArgs.join(' ')} 2>/dev/null || grep -R -n ${caseInsensitive ? '-i' : ''} ${context > 0 ? `-C ${context}` : ''} ${shellEscape(pattern)} ${shellEscape(searchPath)} | head -n ${maxHits}`;

    return executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
    });
  },

  /**
   * Git status
   */
  async gitStatus(): Promise<string> {
    const ctx = await getPtyContext();

    return executeSecured({
      ctx,
      command: 'git status --short --branch',
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
  },

  /**
   * Git diff
   */
  async gitDiff(staged: boolean = false): Promise<string> {
    const ctx = await getPtyContext();

    const command = staged ? 'git diff --staged' : 'git diff';

    return executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
    });
  },

  /**
   * Tail file (read last N lines)
   */
  async tailFile(path: string, lines: number = 100): Promise<string> {
    const ctx = await getPtyContext();

    // Validate path
    const validatedPath = await validatePath(path, ctx.terminalId, {
      operation: 'read',
      cwd: ctx.cwd,
    });

    const command = buildCommand({
      program: 'tail',
      args: ['-n', lines.toString(), validatedPath.absolutePath],
    });

    const result = await executeSecured({
      ctx,
      command: command + ' 2>&1',
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });

    return truncateToolResult(result);
  },

  /**
   * Read specific line ranges from a file
   */
  async readFileLines(
    path: string,
    startLine: number,
    endLine: number
  ): Promise<string> {
    const ctx = await getPtyContext();

    // Validate line numbers
    if (startLine < 1 || endLine < 1 || !Number.isInteger(startLine) || !Number.isInteger(endLine)) {
      throw new Error(`Invalid line numbers: startLine=${startLine}, endLine=${endLine}. Must be positive integers.`);
    }
    if (startLine > endLine) {
      throw new Error(`Invalid line range: startLine (${startLine}) must be <= endLine (${endLine}).`);
    }

    // Validate path
    const validatedPath = await validatePath(path, ctx.terminalId, {
      operation: 'read',
      cwd: ctx.cwd,
    });

    // Use sed to extract line range
    const command = buildCommand({
      program: 'sed',
      args: ['-n', `${startLine},${endLine}p`, validatedPath.absolutePath],
    });

    return executeSecured({
      ctx,
      command: command + ' 2>&1',
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
  },

  /**
   * Replace text in file with approval
   */
  async replaceInFile(
    path: string,
    search: string,
    replace: string,
    all: boolean = false,
    onPendingApproval?: (approval: PendingApproval) => void
  ): Promise<string> {
    const ctx = await getPtyContext();

    // Validate path for write
    const validatedPath = await validatePath(path, ctx.terminalId, {
      operation: 'write',
      cwd: ctx.cwd,
    });

    // Escape special sed characters including single quotes
    const sedEscapedSearch = search.replace(/[|\\&']/g, '\\$&').replace(/\n/g, '\\n');
    const sedEscapedReplace = replace.replace(/[|\\&']/g, '\\$&').replace(/\n/g, '\\n');

    const sedCommand = all
      ? `s|${sedEscapedSearch}|${sedEscapedReplace}|g`
      : `s|${sedEscapedSearch}|${sedEscapedReplace}|`;

    const command = `sed -i.bak '${sedCommand}' ${shellEscape(validatedPath.absolutePath)} && rm ${shellEscape(validatedPath.absolutePath)}.bak`;

    const filename = path.split('/').pop() || path;

    await executeSecured({
      ctx,
      command,
      requireApproval: true,
      approvalDescription: `Replace text in ${filename}`,
      approvalCategory: 'file-write',
      timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
      onPendingApproval,
    });

    // Invalidate cache
    fileCache.invalidate(path, ctx.cwd);

    return `Successfully replaced "${search}" with "${replace}" in ${path}${all ? ' (all occurrences)' : ' (first occurrence)'}`;
  },

  /**
   * Diff two files
   */
  async diffFiles(file1: string, file2: string): Promise<string> {
    const ctx = await getPtyContext();

    const command = `diff -u ${shellEscape(file1)} ${shellEscape(file2)} || true`;

    return executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
    });
  },

  /**
   * Get file info (size, type, etc.)
   */
  async getFileInfo(path: string): Promise<string> {
    const ctx = await getPtyContext();

    // Get size and modified time
    const statCmd = `stat -f "%z %m" ${shellEscape(path)} 2>/dev/null || stat -c "%s %Y" ${shellEscape(path)} 2>/dev/null`;
    const statOutput = await executeSecured({
      ctx,
      command: statCmd,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });

    if (!statOutput || statOutput.includes('cannot stat')) {
      throw new Error(`File not found: ${path}`);
    }

    const [sizeStr] = statOutput.trim().split(/\s+/);
    const sizeBytes = parseInt(sizeStr) || 0;

    // Human readable size
    let sizeHuman: string;
    if (sizeBytes < 1024) {
      sizeHuman = `${sizeBytes} B`;
    } else if (sizeBytes < 1024 * 1024) {
      sizeHuman = `${(sizeBytes / 1024).toFixed(1)} KB`;
    } else if (sizeBytes < 1024 * 1024 * 1024) {
      sizeHuman = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    } else {
      sizeHuman = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }

    // Get file type
    const fileCmd = `file -b ${shellEscape(path)}`;
    const fileType = await executeSecured({
      ctx,
      command: fileCmd,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });

    const isBinary = !fileType.toLowerCase().includes('text') && !fileType.toLowerCase().includes('empty');

    // Get line count for text files under 10MB
    let lineCount = 'N/A';
    if (!isBinary && sizeBytes < 10 * 1024 * 1024) {
      try {
        const wcCmd = `wc -l ${shellEscape(path)} 2>/dev/null`;
        const wcOutput = await executeSecured({
          ctx,
          command: wcCmd,
          timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
        });
        const match = wcOutput.match(/^\s*(\d+)/);
        if (match) {
          lineCount = match[1];
        }
      } catch {
        // Ignore wc errors
      }
    }

    const extension = path.split('.').pop() || 'none';

    return `File: ${path}
Size: ${sizeHuman} (${sizeBytes} bytes)
Type: ${fileType.trim()}
Binary: ${isBinary ? 'yes' : 'no'}
Lines: ${lineCount}
Extension: ${extension}`;
  },

  /**
   * Find processes by pattern
   */
  async findProcess(pattern: string): Promise<string> {
    const ctx = await getPtyContext();
    const command = `ps aux | grep ${shellEscape(pattern)} | grep -v grep`;
    
    const output = await executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
    
    if (!output.trim()) {
      return `No processes found matching "${pattern}"`;
    }
    
    const lines = output.trim().split('\n');
    return `Found ${lines.length} process(es) matching "${pattern}":\n\n${output}`;
  },

  /**
   * Check if port is in use
   */
  async checkPort(port: number): Promise<string> {
    const ctx = await getPtyContext();
    
    // Validate port number
    if (port < 1 || port > 65535 || !Number.isInteger(port)) {
      throw new Error(`Invalid port number: ${port}. Must be an integer between 1 and 65535.`);
    }
    
    // Use lsof or netstat depending on system
    const lsofCmd = `lsof -i :${port} 2>/dev/null`;
    const netstatCmd = `netstat -an | grep ${port} | grep LISTEN`;
    const command = `${lsofCmd} || ${netstatCmd}`;
    
    const output = await executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
    
    if (!output.trim()) {
      return `Port ${port} is not in use`;
    }
    
    return `Port ${port} is in use:\n${output}`;
  },

  /**
   * Get system information
   */
  async getSystemInfo(): Promise<string> {
    const ctx = await getPtyContext();
    
    // Get OS info
    const osCmd = 'uname -a';
    const osInfo = await executeSecured({
      ctx,
      command: osCmd,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
    
    // Get CPU/memory info (cross-platform)
    let resourceInfo = '';
    try {
      const topCmd = 'top -l 1 -n 0 2>/dev/null | head -10 || top -b -n 1 | head -20';
      resourceInfo = await executeSecured({
        ctx,
        command: topCmd,
        timeoutMs: COMMAND_TIMEOUT_DEFAULT_MS,
      });
    } catch {
      resourceInfo = '(Resource info unavailable)';
    }
    
    return `System Information:
${osInfo}

${resourceInfo}`;
  },

  /**
   * Get shell history
   */
  async getShellHistory(maxLines: number = 50): Promise<string> {
    const ctx = await getPtyContext();
    const limit = Math.min(Math.max(maxLines, 1), 200);
    
    // Use history command which works in active shell
    const command = `history ${limit}`;
    
    const output = await executeSecured({
      ctx,
      command,
      timeoutMs: COMMAND_TIMEOUT_QUICK_MS,
    });
    
    if (!output.trim()) {
      return 'No shell history available';
    }
    
    return `Last ${limit} shell commands:\n${output}`;
  },
};

