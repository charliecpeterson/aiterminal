/**
 * Path Validation for PTY Tools
 * 
 * Provides security validation for file paths before PTY execution.
 * Ported from Rust implementation in src-tauri/src/security/path_validator.rs
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Sensitive file patterns (relative to home directory)
 * These files should be blocked for write operations
 */
const SENSITIVE_PATHS = [
  '.ssh/authorized_keys',
  '.ssh/authorized_keys2',
  '.ssh/id_rsa',
  '.ssh/id_ed25519',
  '.ssh/id_ecdsa',
  '.ssh/id_dsa',
  '.ssh/config',
  '.bashrc',
  '.bash_profile',
  '.bash_login',
  '.profile',
  '.zshrc',
  '.zprofile',
  '.zshenv',
  '.zlogin',
  '.config/fish/config.fish',
  '.npmrc',
  '.yarnrc',
  '.netrc',
  '.gitconfig',
  '.git/config',
  '.gnupg/gpg.conf',
  '.gnupg/gpg-agent.conf',
  '.aws/credentials',
  '.aws/config',
  '.kube/config',
  '.docker/config.json',
  '.config/gh/hosts.yml',
  '.env',
  '.env.local',
];

/**
 * Sensitive directory prefixes (relative to home)
 * Any file within these directories is blocked for writes
 */
const SENSITIVE_DIR_PREFIXES = [
  '.ssh/',
  '.gnupg/',
  '.aws/',
  '.kube/',
];

/**
 * Sensitive environment variable patterns
 * These should never be read or exposed
 */
const SENSITIVE_ENV_VAR_PATTERNS = [
  /^.*API[_-]?KEY$/i,
  /^.*SECRET$/i,
  /^.*PASSWORD$/i,
  /^.*TOKEN$/i,
  /^AWS_/i,
  /^OPENAI_/i,
  /^ANTHROPIC_/i,
  /^GITHUB_/i,
  /^GH_/i,
  /^SLACK_/i,
];

const SENSITIVE_ENV_VARS = new Set([
  'HOME',
  'PATH',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'GPG_AGENT_INFO',
]);

export interface PathValidationOptions {
  operation: 'read' | 'write';
  cwd?: string;
  allowAbsolute?: boolean;
}

export interface ValidatedPath {
  /** The validated absolute path */
  absolutePath: string;
  /** Whether this path is in a remote session */
  isRemote: boolean;
  /** Whether extra security checks apply */
  isStrictMode: boolean;
}

/**
 * Validate a path for security before PTY execution
 * 
 * @param path - Path to validate (relative or absolute)
 * @param terminalId - Terminal ID to get CWD and context
 * @param options - Validation options
 * @returns Validated path information
 * @throws Error if path is unsafe
 */
export async function validatePath(
  path: string,
  terminalId: number,
  options: PathValidationOptions
): Promise<ValidatedPath> {
  // Get terminal context
  const cwd = options.cwd || await invoke<string>('get_pty_cwd', { id: terminalId });
  const ptyInfo = await invoke<any>('get_pty_info', { id: terminalId });
  
  const isRemote = ptyInfo.pty_type === 'ssh';
  const isStrictMode = isRemote || options.operation === 'write';

  // Resolve to absolute path
  let absolutePath: string;
  if (path.startsWith('/')) {
    absolutePath = path;
  } else if (path.startsWith('~/')) {
    // For remote sessions, we can't reliably expand ~ without shell
    // Let the shell handle it, but validate no traversal
    absolutePath = path;
  } else {
    // Relative to CWD
    absolutePath = `${cwd}/${path}`.replace(/\/+/g, '/');
  }

  // Check for path traversal attempts
  if (containsTraversal(absolutePath)) {
    throw new Error(`Path traversal detected: ${path}`);
  }

  // For write operations, check sensitive paths
  if (options.operation === 'write') {
    if (await isSensitivePath(absolutePath)) {
      throw new Error(`Access denied: ${path} is a protected system file`);
    }
  }

  return {
    absolutePath,
    isRemote,
    isStrictMode,
  };
}

/**
 * Check if a path contains traversal attempts
 */
function containsTraversal(path: string): boolean {
  // Normalize the path
  const normalized = path.replace(/\/+/g, '/');
  
  // Check for .. traversal
  if (normalized.includes('/../') || normalized.endsWith('/..')) {
    return true;
  }
  
  // Check if path starts with ../
  if (normalized.startsWith('../')) {
    return true;
  }
  
  return false;
}

/**
 * Check if a path is sensitive (should not be written to)
 * 
 * Note: For remote sessions, we do best-effort checking since we can't
 * canonicalize paths locally. The approval flow is the final safeguard.
 */
export async function isSensitivePath(absolutePath: string): Promise<boolean> {
  // Extract path relative to home
  // Handle both ~/path and /home/user/path formats
  let relativePath = absolutePath;
  
  if (absolutePath.startsWith('~/')) {
    relativePath = absolutePath.substring(2);
  } else if (absolutePath.includes('/home/')) {
    // Try to extract path after /home/username/
    const match = absolutePath.match(/\/home\/[^/]+\/(.+)/);
    if (match) {
      relativePath = match[1];
    }
  } else if (absolutePath.includes('/Users/')) {
    // macOS home path
    const match = absolutePath.match(/\/Users\/[^/]+\/(.+)/);
    if (match) {
      relativePath = match[1];
    }
  }

  // Normalize to lowercase for case-insensitive comparison on macOS
  // macOS filesystems (HFS+, APFS) are case-insensitive by default
  const normalizedPath = relativePath.toLowerCase();

  // Check exact matches (compare lowercase versions)
  for (const sensitivePath of SENSITIVE_PATHS) {
    if (normalizedPath === sensitivePath.toLowerCase()) {
      return true;
    }
  }

  // Check directory prefixes (compare lowercase versions)
  for (const prefix of SENSITIVE_DIR_PREFIXES) {
    if (normalizedPath.startsWith(prefix.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Validate an environment variable name for safe reading
 * 
 * @param varName - Environment variable name
 * @throws Error if variable contains sensitive data
 */
export function validateEnvVar(varName: string): void {
  // Check if it's a sensitive variable
  if (SENSITIVE_ENV_VARS.has(varName)) {
    throw new Error(`Access denied: ${varName} is a protected environment variable`);
  }

  // Check against patterns
  for (const pattern of SENSITIVE_ENV_VAR_PATTERNS) {
    if (pattern.test(varName)) {
      throw new Error(
        `Access denied: ${varName} may contain credentials (matches pattern: ${pattern})`
      );
    }
  }
}

/**
 * Validate a program name for execution
 * 
 * @param program - Program/command name
 * @returns true if program is allowed
 */
export function isAllowedProgram(program: string): boolean {
  // Whitelist of safe programs for PTY execution
  const ALLOWED_PROGRAMS = new Set([
    'head', 'tail', 'cat', 'grep', 'find', 'ls', 'pwd', 'wc',
    'git', 'sed', 'awk', 'sort', 'uniq', 'stat', 'file',
    'rg', 'fd', 'bat', 'eza', // Modern alternatives
    'ps', 'printenv', 'which', 'type', 'echo', 'printf',
    'mkdir', 'diff', 'bc', 'base64',
  ]);

  return ALLOWED_PROGRAMS.has(program);
}
