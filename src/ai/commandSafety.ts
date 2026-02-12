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
    /\brm\b/,               // rm
    /\bmv\b.*>/,            // mv with redirect
    /\bdd\b/,               // dd
    />>/,                   // append redirect
    />/,                    // redirect (overwrite)
    /\|\s*sh\b/,            // pipe to sh
    /\|\s*bash\b/,          // pipe to bash
    /\|\s*zsh\b/,           // pipe to zsh
    /\|\s*fish\b/,          // pipe to fish
    /\|\s*python3?\b/,      // pipe to python (curl url | python)
    /\|\s*node\b/,          // pipe to node
    /\|\s*ruby\b/,          // pipe to ruby
    /\|\s*perl\b/,          // pipe to perl
    /\beval\b/,             // eval (executes arbitrary string as code)
    /\btruncate\b/,         // truncate
    /\bshred\b/,            // shred
  ],
  systemChange: [
    /\bsudo\b/,             // sudo
    /\bchmod\b/,            // chmod
    /\bchown\b/,            // chown
    /\bapt\s+install/,      // apt install
    /\byum\s+install/,      // yum install
    /\bbrew\s+install/,     // brew install
    /\bnpm\s+install/,      // npm install
    /\bpip\s+install/,      // pip install
    /\bsystemctl\b/,        // systemctl
    /\bservice\b/,          // service
  ],
  networkWrite: [
    /\bcurl\b.*-[A-Z]*[OP]/, // curl with -O or -P (download)
    /\bwget\b/,              // wget
    /\bscp\b.*:/,            // scp with remote destination
    /\brsync\b.*:/,          // rsync with remote
  ],
  processControl: [
    /\bkill\b/,             // kill
    /\bpkill\b/,            // pkill
    /\bkillall\b/,          // killall
    /\breboot\b/,           // reboot
    /\bshutdown\b/,         // shutdown
    /\bhalt\b/,             // halt
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

  // Dangerous patterns are checked FIRST. A "safe" command prefix does not
  // make the full command safe: "echo payload | bash", "cat file > /etc/hosts",
  // and "find . -exec rm -rf {} \;" all contain dangerous operations.
  for (const [category, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(command)) {
        return {
          isSafe: false,
          category: category as CommandSafetyResult['category'],
          reason: `Command contains potentially dangerous operation: ${category}`,
        };
      }
    }
  }

  // Secondary heuristic for write indicators not covered by patterns above
  const hasWriteIndicators = command.includes('install') ||
                             command.includes('sudo') ||
                             command.includes('rm');

  if (hasWriteIndicators) {
    return {
      isSafe: false,
      reason: 'Command may modify system state',
    };
  }

  // Known read-only commands
  for (const safeCmd of SAFE_COMMANDS) {
    if (trimmed.startsWith(safeCmd.toLowerCase())) {
      return { isSafe: true };
    }
  }

  return { isSafe: true };
}
