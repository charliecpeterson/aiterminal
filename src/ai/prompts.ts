/**
 * Enhanced prompting system with few-shot examples and better context management
 */

import type { ContextItem } from '../context/AIContext';

export interface PromptConfig {
  userLevel?: 'beginner' | 'intermediate' | 'expert';
  terminalType?: 'local' | 'ssh' | 'docker';
  shellType?: 'bash' | 'zsh' | 'fish';
}

/**
 * Few-shot examples for common terminal tasks
 */
const FEW_SHOT_EXAMPLES = `
EXAMPLE 1: Debugging Command Errors
User: "Why did 'npm install' fail?"
Assistant: Let me check the error. First, I'll examine the output you provided.
[After reading context]
The error shows "EACCES: permission denied". This typically means:
1. You're trying to install globally without sudo
2. npm's cache has incorrect permissions

Try: \`npm install --prefix ~/.npm-global\`
Or fix permissions: \`sudo chown -R $(whoami) ~/.npm\`

EXAMPLE 2: System Analysis
User: "System is slow, what's using resources?"
Assistant: I'll check multiple things:
\`\`\`bash
# CPU usage
top -l 1 | head -n 10

# Memory
vm_stat

# Disk usage
df -h
\`\`\`
[After seeing results]
Chrome is using 8GB RAM (PID 12345). You can restart it or kill heavy tabs.

EXAMPLE 3: File Operations
User: "Find all Python files modified today"
Assistant: I'll search for Python files with today's modification date:
\`\`\`bash
find . -name "*.py" -mtime 0 -type f
\`\`\`

To see them with details:
\`\`\`bash
find . -name "*.py" -mtime 0 -type f -exec ls -lh {} \\;
\`\`\`
`;

/**
 * Build enhanced system prompt with few-shot examples
 */
export function buildEnhancedSystemPrompt(params: {
  mode: 'agent' | 'chat';
  terminalId: number;
  config?: PromptConfig;
  contextSummary?: string;
}): string {
  const { mode, terminalId, config = {}, contextSummary } = params;
  const isAgent = mode === 'agent';
  
  const userLevelGuidance = getUserLevelGuidance(config.userLevel);
  const shellHints = getShellHints(config.shellType);

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
- \`write_file\`: Create or overwrite files
- \`replace_in_file\`: Search and replace text in files (safer than overwriting)
- \`list_directory\`: List directory contents
- \`search_files\`: Find files by name/content
- \`get_environment_variable\`: Check env vars
- Git tools: \`git_status\`, \`get_git_diff\`
- Process tools: \`find_process\`, \`check_port\`
- System: \`get_system_info\`, \`calculate\`, \`web_search\`

WORKFLOW:
1. If user mentions "here", "current", or no path → use \`get_current_directory()\` first
2. **For errors/debugging**: Use \`analyze_error\` FIRST to parse error text, then investigate specific files
3. **Before reading files**: Use \`get_file_info\` to check size/type, especially for unknown files
4. **Multiple related files**: Use \`read_multiple_files\` instead of multiple \`read_file\` calls
5. Then use the actual path with other tools
6. Prefer tool calls over asking user to run commands
7. Combine multiple observations in reasoning

${userLevelGuidance}

${shellHints}

CONTEXT AWARENESS:
Terminal ID: ${terminalId}
${contextSummary ? `\nRECENT CONTEXT SUMMARY:\n${contextSummary}\n` : ''}

${FEW_SHOT_EXAMPLES}

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

CONTEXT AWARENESS:
Terminal ID: ${terminalId}
${contextSummary ? `\nRECENT CONTEXT SUMMARY:\n${contextSummary}\n` : ''}

${FEW_SHOT_EXAMPLES}

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
 * Generate context summary for system prompt
 * Reduces token usage by summarizing large context
 */
export function summarizeContext(contextItems: ContextItem[]): string {
  if (contextItems.length === 0) return '';

  const summary: string[] = [];
  
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

  summary.push(`${contextItems.length} context items available`);
  
  const typeStr = Array.from(typeCounts.entries())
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  summary.push(`Types: ${typeStr}`);
  
  if (hasErrors) {
    summary.push('⚠️ Context includes command failures');
  }
  
  if (lastCommand) {
    summary.push(`Most recent command: ${lastCommand.substring(0, 60)}`);
  }

  return summary.join('\n');
}

/**
 * Add chain-of-thought prompting for complex queries
 */
export function addChainOfThought(userPrompt: string): string {
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
