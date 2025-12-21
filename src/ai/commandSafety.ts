/**
 * Command Safety Detection
 * 
 * Identifies potentially dangerous commands that should require user approval
 */

export interface CommandSafetyResult {
  isSafe: boolean;
  reason?: string;
  category?: 'destructive' | 'system-change' | 'network-write' | 'process-control';
}

// Patterns for dangerous commands
const DANGEROUS_PATTERNS = {
  destructive: [
    /\brm\b/,           // rm
    /\bmv\b.*>/,        // mv with redirect
    /\bdd\b/,           // dd
    />>/,               // append redirect
    />/,                // redirect (overwrite)
    /\|\s*sh\b/,        // pipe to shell
    /\|\s*bash\b/,      // pipe to bash
    /\btruncate\b/,     // truncate
    /\bshred\b/,        // shred
  ],
  systemChange: [
    /\bsudo\b/,         // sudo
    /\bchmod\b/,        // chmod
    /\bchown\b/,        // chown
    /\bapt\s+install/, // apt install
    /\byum\s+install/, // yum install
    /\bbrew\s+install/,// brew install
    /\bnpm\s+install/, // npm install
    /\bpip\s+install/, // pip install
    /\bsystemctl\b/,   // systemctl
    /\bservice\b/,     // service
  ],
  networkWrite: [
    /\bcurl\b.*-[A-Z]*[OP]/,  // curl with -O or -P (download)
    /\bwget\b/,               // wget
    /\bscp\b.*:/,             // scp with remote destination
    /\brsync\b.*:/,           // rsync with remote
  ],
  processControl: [
    /\bkill\b/,         // kill
    /\bpkill\b/,        // pkill
    /\bkillall\b/,      // killall
    /\breboot\b/,       // reboot
    /\bshutdown\b/,     // shutdown
    /\bhalt\b/,         // halt
  ],
};

// Commands that are always safe (read-only operations)
const SAFE_COMMANDS = [
  'pwd', 'ls', 'cat', 'less', 'more', 'head', 'tail',
  'grep', 'find', 'which', 'where', 'type',
  'echo', 'printf',
  'date', 'whoami', 'hostname',
  'git status', 'git log', 'git diff', 'git branch',
  'node --version', 'npm --version', 'python --version',
  'ps', 'top', 'htop',
  'env', 'printenv',
  'df', 'du',
  'wc', 'sort', 'uniq',
];

/**
 * Check if a command is safe to execute without approval
 */
export function isCommandSafe(command: string): CommandSafetyResult {
  const trimmed = command.trim().toLowerCase();
  
  // Check if it's a known safe command
  for (const safeCmd of SAFE_COMMANDS) {
    if (trimmed.startsWith(safeCmd.toLowerCase())) {
      return { isSafe: true };
    }
  }
  
  // Check for dangerous patterns
  for (const [category, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(command)) {
        return {
          isSafe: false,
          category: category as any,
          reason: `Command contains potentially dangerous operation: ${category}`,
        };
      }
    }
  }
  
  // Default to safe for simple read operations
  // But be conservative - if we're not sure, mark as potentially unsafe
  const hasWriteIndicators = command.includes('>') || 
                             command.includes('install') || 
                             command.includes('sudo') ||
                             command.includes('rm');
  
  if (hasWriteIndicators) {
    return {
      isSafe: false,
      reason: 'Command may modify system state',
    };
  }
  
  return { isSafe: true };
}
