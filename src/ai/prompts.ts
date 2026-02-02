/**
 * Enhanced prompting system with few-shot examples and better context management
 */

import type { ContextItem } from '../context/AIContext';
import type { QueryType } from '../types/routing';

export interface PromptConfig {
  userLevel?: 'beginner' | 'intermediate' | 'expert';
  terminalType?: 'local' | 'ssh' | 'docker';
  shellType?: 'bash' | 'zsh' | 'fish';
  platform?: 'macos' | 'linux' | 'windows' | 'unknown';
}

/**
 * Detect the current platform from browser/Tauri environment
 */
export function detectPlatform(): PromptConfig['platform'] {
  // Try navigator.platform first (works in browser context)
  if (typeof navigator !== 'undefined' && navigator.platform) {
    const platform = navigator.platform.toLowerCase();
    if (platform.includes('mac')) return 'macos';
    if (platform.includes('linux')) return 'linux';
    if (platform.includes('win')) return 'windows';
  }
  
  // Fallback to userAgent
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'macos';
    if (ua.includes('linux')) return 'linux';
    if (ua.includes('windows')) return 'windows';
  }
  
  return 'unknown';
}

/**
 * Few-shot examples categorized by query type for more efficient token usage.
 * Previously all 5 examples (~400 tokens) were always included for moderate+ queries.
 * Now we select only 1-2 relevant examples (~80-160 tokens) based on query type.
 */
const FEW_SHOT_EXAMPLES_BY_TYPE: Record<string, string> = {
  debug: `EXAMPLE: Debugging Command Errors
User: "Why did 'npm install' fail?"
Assistant: Let me check the error. First, I'll examine the output you provided.
[After reading context]
The error shows "EACCES: permission denied". This typically means:
1. You're trying to install globally without sudo
2. npm's cache has incorrect permissions

Try: \`npm install --prefix ~/.npm-global\`
Or fix permissions: \`sudo chown -R $(whoami) ~/.npm\``,

  system: `EXAMPLE: System Analysis
User: "System is slow, what's using resources?"
Assistant: I'll check multiple things:
\`\`\`bash
top -l 1 | head -n 10  # CPU usage
vm_stat                 # Memory
df -h                   # Disk usage
\`\`\`
[After seeing results]
Chrome is using 8GB RAM (PID 12345). You can restart it or kill heavy tabs.`,

  file: `EXAMPLE: File Operations
User: "Find all Python files modified today"
Assistant: I'll search for Python files with today's modification date:
\`\`\`bash
find . -name "*.py" -mtime 0 -type f
\`\`\`

To see them with details:
\`\`\`bash
find . -name "*.py" -mtime 0 -type f -exec ls -lh {} \\;
\`\`\``,

  code: `EXAMPLE: File Creation
User: "Create a config.json file with default settings"
Assistant: [Uses get_current_directory tool]
[Uses write_file tool to create config.json]
Created \`config.json\` in /path/to/current/dir:
\`\`\`json
{
  "name": "my-project",
  "version": "1.0.0",
  "settings": { "debug": false, "logLevel": "info" }
}
\`\`\``,
};

/**
 * Maps QueryType to relevant example categories.
 * 'factual' and 'explanation' queries don't benefit from examples (simple responses).
 */
const QUERY_TYPE_TO_EXAMPLES: Record<QueryType, string[]> = {
  debug: ['debug'],           // Error analysis, debugging
  code: ['code', 'file'],     // Code/file creation
  complex: ['debug', 'system'], // Complex analysis often involves debugging or system
  creative: ['code'],         // Creative solutions often involve file creation
  factual: [],                // Simple facts don't need examples
  explanation: [],            // Explanations don't need examples
};

/**
 * Select appropriate few-shot examples based on query type and complexity.
 * This reduces token usage from ~400 tokens to ~80-160 tokens on average.
 */
function selectFewShotExamples(queryType?: QueryType, complexityScore?: number): string {
  // Simple queries (score < 40) don't need examples at all
  if (complexityScore !== undefined && complexityScore < 40) {
    return '';
  }
  
  // No query type detected = use debug example as most useful default
  if (!queryType) {
    return FEW_SHOT_EXAMPLES_BY_TYPE.debug;
  }
  
  // Get relevant example categories for this query type
  const categories = QUERY_TYPE_TO_EXAMPLES[queryType] || [];
  if (categories.length === 0) {
    return ''; // factual/explanation queries don't need examples
  }
  
  // Return first relevant example only (1 example = ~80 tokens vs 5 = ~400)
  const firstCategory = categories[0];
  return FEW_SHOT_EXAMPLES_BY_TYPE[firstCategory] || '';
}

/**
 * Build enhanced system prompt with few-shot examples
 * Examples are only included for uncertain/complex queries (score >= 40) to save tokens.
 * Query-specific examples are selected based on queryType to further reduce tokens.
 */
export function buildEnhancedSystemPrompt(params: {
  mode: 'agent' | 'chat';
  terminalId: number;
  config?: PromptConfig;
  contextSummary?: string;
  complexityScore?: number; // Routing score 0-100, used to decide if examples are needed
  queryType?: QueryType; // Query type from router, used to select relevant examples
}): string {
  const { mode, terminalId, config = {}, contextSummary, complexityScore, queryType } = params;
  const isAgent = mode === 'agent';
  
  // Auto-detect platform if not provided
  const platform = config.platform || detectPlatform();
  
  const userLevelGuidance = getUserLevelGuidance(config.userLevel);
  const shellHints = getShellHints(config.shellType);
  const platformHints = getPlatformHints(platform);
  
  // Select relevant few-shot examples based on query type and complexity
  // This saves ~240-320 tokens compared to always including all 5 examples
  const examplesSection = selectFewShotExamples(queryType, complexityScore);

  if (isAgent) {
    return `You are an expert AI assistant embedded in a terminal emulator with tool execution capabilities.

CORE PRINCIPLES:
1. **Observe First**: Use tools to gather information before suggesting solutions
2. **Explain Simply**: Match complexity to user's apparent skill level
3. **Verify Assumptions**: Don't assume current directory or environment
4. **Safety First**: Warn about destructive operations, suggest backups
5. **Progressive Disclosure**: Start simple, add details if asked

YOUR CAPABILITIES:
- \`get_current_directory\`: Check where you are
- \`execute_command\`: Run shell commands (pwd, ls, cat, etc.)
- \`read_file\`: Read file contents directly
- \`get_file_info\`: Get file metadata (size, type, line count) BEFORE reading - use this to avoid reading huge/binary files
- \`read_multiple_files\`: Read up to 20 files at once (useful for errors spanning multiple files)
- \`grep_in_files\`: Fast search for patterns in specific files (better than grep command for targeted searches)
- \`analyze_error\`: **Smart error analysis** - paste error output and it extracts files, line numbers, error types, suggests fixes
- \`find_errors_in_file\`: **Scan large files for errors** - efficiently scans GB+ files for error patterns with context (great for job outputs, logs)
- \`file_sections\`: **Read specific line ranges** - read lines N-M from large files without loading everything
- \`write_file\`: Create or overwrite files
- \`append_to_file\`: Add content to end of existing file (great for .gitignore, .env, logs)
- \`replace_in_file\`: Search and replace text in files (safer than overwriting)
- \`undo_file_change\`: **Restore file from backup** - automatically backs up before modifications, can undo mistakes
- \`diff_files\`: **Compare files** - compare two files OR show what changed since last backup
- \`list_directory\`: List directory contents
- \`search_files\`: Find files by name/content
- \`get_environment_variable\`: Check env vars
- \`get_shell_history\`: Read user's shell command history (with optional filter)
- Git tools: \`git_status\`, \`get_git_diff\`
- Process tools: \`find_process\`, \`check_port\`
- System: \`get_system_info\`, \`calculate\`, \`web_search\`

WORKFLOW:
1. If user mentions "here", "current", or no path → use \`get_current_directory()\` first
2. **For errors/debugging**: Use \`analyze_error\` FIRST to parse error text, then investigate specific files
3. **For large output files**: Use \`find_errors_in_file\` to scan for problems, then \`file_sections\` to examine specific lines
4. **Before reading files**: Use \`get_file_info\` to check size/type, especially for unknown files
5. **Multiple related files**: Use \`read_multiple_files\` instead of multiple \`read_file\` calls
6. **"What did I run?"**: Use \`get_shell_history\` to see recent commands
7. **File creation**: When user asks to "create", "make", "generate", or "write" a file → use \`write_file\` to actually create it. Don't just show code in a code block - CREATE the file!
8. **Adding to existing files**: When user asks to "add to", "append", "include in", or modify .gitignore/.env/config files → use \`append_to_file\` instead of \`write_file\` to avoid overwriting existing content
9. **Undo/revert**: When user says "undo", "revert", "restore" a file → use \`undo_file_change\` to restore from backup
10. **Show changes**: When user asks "what did you change?" or wants to review edits → use \`diff_files\` to show differences
11. Then use the actual path with other tools
12. Prefer tool calls over asking user to run commands
13. Combine multiple observations in reasoning

${userLevelGuidance}

${shellHints}

${platformHints}

CONTEXT AWARENESS:
Terminal ID: ${terminalId}
${contextSummary ? `\nRECENT CONTEXT SUMMARY:\n${contextSummary}\n` : ''}
${examplesSection}
RESPONSE FORMAT:
- Use tools proactively without asking permission
- Show command examples in \`\`\`bash code blocks
- Structure complex answers with headings
- Highlight key information with **bold**
- Use bullet points for lists`;
  } else {
    // Chat mode - no tools
    return `You are an expert AI assistant embedded in a terminal emulator.

⚠️ CRITICAL: You do NOT have tool execution capabilities. Do NOT claim you can run commands.

CORE PRINCIPLES:
1. **Suggest, Don't Execute**: Provide commands user can copy and run
2. **Explain Clearly**: Help user understand what commands do
3. **Teach**: Explain concepts, not just solutions
4. **Safety First**: Warn about destructive operations

${userLevelGuidance}

${shellHints}

${platformHints}

CONTEXT AWARENESS:
Terminal ID: ${terminalId}
${contextSummary ? `\nRECENT CONTEXT SUMMARY:\n${contextSummary}\n` : ''}
${examplesSection}
RESPONSE FORMAT:
- Put all commands in \`\`\`bash code blocks
- Explain what each command does
- Provide alternatives when relevant
- Use **bold** for warnings
- Structure with headings for complex answers`;
  }
}

function getUserLevelGuidance(level?: 'beginner' | 'intermediate' | 'expert'): string {
  switch (level) {
    case 'beginner':
      return `USER SKILL LEVEL: Beginner
- Explain every command and flag
- Define technical terms
- Provide step-by-step instructions
- Suggest safer alternatives`;
    
    case 'expert':
      return `USER SKILL LEVEL: Expert
- Be concise, skip basic explanations
- Show advanced options
- Assume knowledge of Unix fundamentals
- Focus on efficiency`;
    
    case 'intermediate':
    default:
      return `USER SKILL LEVEL: Intermediate
- Balance explanation with brevity
- Explain non-obvious flags
- Provide learning resources when relevant`;
  }
}

function getShellHints(shell?: 'bash' | 'zsh' | 'fish'): string {
  switch (shell) {
    case 'zsh':
      return `SHELL: zsh
- Use zsh-specific features when helpful (globbing, etc.)
- Mention oh-my-zsh plugins when relevant`;
    
    case 'fish':
      return `SHELL: fish
- Use fish-friendly syntax
- Mention fish-specific commands`;
    
    case 'bash':
    default:
      return `SHELL: bash
- Stick to POSIX-compatible commands when possible
- Mention bash-specific features when useful`;
  }
}

/**
 * Get platform-specific hints for the AI
 */
function getPlatformHints(platform?: PromptConfig['platform']): string {
  switch (platform) {
    case 'macos':
      return `PLATFORM: macOS
- Use macOS-specific commands: open, pbcopy, pbpaste, say, screencapture
- Package manager: brew (Homebrew)
- File system: APFS, case-insensitive by default
- Services: launchctl for daemons
- Common paths: /Applications, ~/Library, /usr/local/bin (Intel) or /opt/homebrew (Apple Silicon)`;
    
    case 'linux':
      return `PLATFORM: Linux
- Package managers: apt/apt-get (Debian/Ubuntu), dnf/yum (Fedora/RHEL), pacman (Arch)
- Use xdg-open to open files, xclip for clipboard
- Services: systemctl for systemd-based distros
- Common paths: /etc, /var, /opt, /usr/local
- Check distro with: cat /etc/os-release`;
    
    case 'windows':
      return `PLATFORM: Windows
- Use PowerShell syntax when appropriate
- Package manager: winget, choco (Chocolatey), scoop
- Paths use backslashes but Git Bash/WSL use forward slashes
- Common paths: C:\\Program Files, %APPDATA%, %USERPROFILE%
- Note: User may be in WSL, Git Bash, or native PowerShell`;
    
    default:
      return `PLATFORM: Unknown
- Prefer POSIX-compatible commands for portability
- Ask about OS if platform-specific commands are needed`;
  }
}

/**
 * Generate context summary for system prompt
 * Reduces token usage by providing a brief overview instead of details.
 * Format optimized for minimal tokens while preserving key info.
 */
export function summarizeContext(contextItems: ContextItem[]): string {
  if (contextItems.length === 0) return '';

  // Count by type
  const typeCounts = new Map<string, number>();
  let hasErrors = false;
  let lastCommand = '';
  
  for (const item of contextItems) {
    const count = typeCounts.get(item.type) || 0;
    typeCounts.set(item.type, count + 1);
    
    if (item.metadata?.exitCode && item.metadata.exitCode !== 0) {
      hasErrors = true;
    }
    
    if (item.type === 'command' || item.metadata?.command) {
      lastCommand = item.metadata?.command || item.content;
    }
  }

  // Build compact single-line summary (saves ~20-30 tokens vs multi-line)
  const parts: string[] = [];
  
  const typeStr = Array.from(typeCounts.entries())
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  parts.push(typeStr);
  
  if (hasErrors) {
    parts.push('includes errors');
  }
  
  if (lastCommand) {
    // Truncate command more aggressively
    const truncatedCmd = lastCommand.length > 40 ? lastCommand.substring(0, 40) + '...' : lastCommand;
    parts.push(`last: ${truncatedCmd}`);
  }

  return parts.join(' | ');
}

/**
 * Add chain-of-thought prompting for complex queries
 * Only adds CoT for queries with complexity >= 2 (moderate or complex tier)
 * This saves ~30 tokens on simple queries.
 */
export function addChainOfThought(
  userPrompt: string, 
  complexityLevel?: number
): string {
  // If we have routing info, use it - only add CoT for moderate+ complexity
  if (complexityLevel !== undefined) {
    if (complexityLevel < 2) {
      return userPrompt; // Simple queries don't need CoT
    }
    
    return `${userPrompt}

Think step by step:
1. What information do I need?
2. What tools should I use?
3. What's the best approach?`;
  }
  
  // Fallback: detect complexity from keywords (for when routing is disabled)
  const complexityIndicators = [
    'why', 'how', 'explain', 'debug', 'fix', 'optimize',
    'best way', 'should i', 'difference between'
  ];
  
  const isComplex = complexityIndicators.some(indicator => 
    userPrompt.toLowerCase().includes(indicator)
  );
  
  if (isComplex) {
    return `${userPrompt}

Think step by step:
1. What information do I need?
2. What tools should I use?
3. What's the best approach?`;
  }
  
  return userPrompt;
}
