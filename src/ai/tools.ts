/**
 * Tool Calling System for AI Agent
 * 
 * Defines tools the AI can use to interact with the terminal environment.
 * Uses OpenAI function calling and Anthropic tool use formats.
 */

export type ToolName = 
  | 'execute_command'
  | 'read_file'
  | 'list_directory'
  | 'search_files'
  | 'get_environment_variable';

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: ToolName;
    arguments: string; // JSON string
  };
}

export interface ParsedToolCall {
  id: string;
  name: ToolName;
  arguments: Record<string, any>;
  reasoning?: string;
}

export interface ToolCallResult {
  tool_call_id: string;
  output: string;
  success: boolean;
  error?: string;
}

export interface PendingToolCall extends ParsedToolCall {
  status: 'pending' | 'approved' | 'denied' | 'executing' | 'completed' | 'failed';
  result?: string;
  error?: string;
  timestamp: number;
}

/**
 * Tool definitions that get sent to the AI
 */
export const TOOLS: ToolDefinition[] = [
  {
    name: 'execute_command',
    description: `Execute a shell command in the terminal. Use this to run commands, check system state, install packages, etc.
    
IMPORTANT SAFETY RULES:
- Always explain WHY you're running the command
- For destructive commands (rm, dd, etc.), ask user confirmation
- For commands that modify system state, explain what will change
- If command might take long, warn the user
- Never run commands without clear reasoning

TO GET CURRENT DIRECTORY: Use execute_command("pwd")

Examples:
- "Check if Python is installed" → python --version
- "List files in current directory" → ls -la
- "Get current directory" → pwd
- "Install a package" → npm install lodash`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The exact shell command to execute (e.g., "ls -la", "pwd", "python --version")',
        },
        reasoning: {
          type: 'string',
          description: 'Explain WHY you want to run this command and what you expect to learn/accomplish',
        },
        working_directory: {
          type: 'string',
          description: 'Optional: Change to this directory before executing (if different from current)',
        },
      },
      required: ['command', 'reasoning'],
    },
  },
  {
    name: 'read_file',
    description: `Read the contents of a file. Use this to examine configuration files, code, logs, etc.

IMPORTANT:
- Only read text files (not binaries)
- Large files will be truncated
- Specify byte limit if you only need a preview

Examples:
- "Check the package.json" → read_file("package.json")
- "Look at the error log" → read_file("/var/log/error.log", max_bytes=5000)`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute or relative path to the file to read',
        },
        max_bytes: {
          type: 'string',
          description: 'Maximum bytes to read (default: 50000, max: 500000). Use smaller values for previews.',
        },
        reasoning: {
          type: 'string',
          description: 'Explain why you need to read this file',
        },
      },
      required: ['path', 'reasoning'],
    },
  },
  {
    name: 'list_directory',
    description: `List contents of a directory. Use this to explore the file structure.

CRITICAL: This tool runs in the backend process, NOT in the user's terminal.
- DO NOT use "." as the path - it will list the wrong directory
- ALWAYS get the user's actual terminal directory first by calling execute_command("pwd")
- Then use the explicit absolute path returned from pwd

Workflow for "list my directory":
1. Call execute_command("pwd") 
2. Call list_directory("/the/path/from/pwd")
Make BOTH calls in your single response!

Examples:
- "See what files are in /Users/john/projects" → list_directory("/Users/john/projects")`,
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ABSOLUTE path to the directory to list. NEVER use "." - always provide full path like "/Users/username/directory"',
        },
        show_hidden: {
          type: 'string',
          description: 'Whether to show hidden files (default: "false")',
          enum: ['true', 'false'],
        },
        reasoning: {
          type: 'string',
          description: 'Explain why you need to see this directory',
        },
      },
      required: ['path', 'reasoning'],
    },
  },
  {
    name: 'search_files',
    description: `Search for files by name pattern. Use this to find files when you don't know exact locations.

Examples:
- "Find all Python files" → search_files("*.py")
- "Find package.json" → search_files("package.json")`,
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: 'File name pattern (supports wildcards like *.py, test*.js)',
        },
        max_results: {
          type: 'string',
          description: 'Maximum number of results to return (default: "20")',
        },
        reasoning: {
          type: 'string',
          description: 'Explain what you\'re looking for and why',
        },
      },
      required: ['pattern', 'reasoning'],
    },
  },
  {
    name: 'get_environment_variable',
    description: 'Get the value of an environment variable. Use this to check configuration.',
    parameters: {
      type: 'object',
      properties: {
        variable: {
          type: 'string',
          description: 'Name of the environment variable (e.g., "PATH", "HOME", "NODE_ENV")',
        },
      },
      required: ['variable'],
    },
  },
];

/**
 * Convert our tool definitions to OpenAI function calling format
 */
export function toOpenAIFunctions() {
  return TOOLS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * Convert our tool definitions to Anthropic tool use format
 */
export function toAnthropicTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }));
}

/**
 * Parse tool call arguments safely
 */
export function parseToolCall(toolCall: ToolCall): ParsedToolCall | null {
  try {
    const args = JSON.parse(toolCall.function.arguments);
    return {
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: args,
      reasoning: args.reasoning,
    };
  } catch (error) {
    console.error('Failed to parse tool call:', error, toolCall);
    return null;
  }
}

/**
 * Validate tool call arguments
 */
export function validateToolCall(toolCall: ParsedToolCall): { valid: boolean; error?: string } {
  const tool = TOOLS.find((t) => t.name === toolCall.name);
  if (!tool) {
    return { valid: false, error: `Unknown tool: ${toolCall.name}` };
  }

  // Check required parameters
  for (const required of tool.parameters.required) {
    if (!(required in toolCall.arguments)) {
      return { valid: false, error: `Missing required parameter: ${required}` };
    }
  }

  return { valid: true };
}

/**
 * Get a human-readable description of what a tool call will do
 */
export function describeToolCall(toolCall: ParsedToolCall): string {
  switch (toolCall.name) {
    case 'execute_command':
      return `Run command: ${toolCall.arguments.command}`;
    case 'read_file':
      return `Read file: ${toolCall.arguments.path}`;
    case 'list_directory':
      return `List directory: ${toolCall.arguments.path || '.'}`;
    case 'search_files':
      return `Search for files: ${toolCall.arguments.pattern}`;
    case 'get_environment_variable':
      return `Get environment variable: ${toolCall.arguments.variable}`;
    default:
      return `Execute tool: ${toolCall.name}`;
  }
}

/**
 * Check if a command is potentially dangerous
 */
export function isDangerousCommand(command: string): { dangerous: boolean; reason?: string } {
  const dangerous = [
    { pattern: /\brm\s+-[\w-]*r[\w-]*f\b/i, reason: 'Recursive force deletion' },
    { pattern: /\bmkfs/i, reason: 'Filesystem formatting' },
    { pattern: /\bdd\s+.*of=/i, reason: 'Disk write operation' },
    { pattern: /\b(shutdown|reboot|poweroff)\b/i, reason: 'System shutdown' },
    { pattern: /\bkillall|pkill\b/i, reason: 'Mass process termination' },
    { pattern: /\bkill\s+-9/i, reason: 'Force kill' },
    { pattern: />\s*\/dev\/(sda|hda|nvme)/i, reason: 'Writing to disk device' },
    { pattern: /\bchmod\s+-R\s+777/i, reason: 'Dangerous permission change' },
    { pattern: /\bcurl.*\|\s*(sh|bash)/i, reason: 'Pipe to shell' },
  ];

  for (const { pattern, reason } of dangerous) {
    if (pattern.test(command)) {
      return { dangerous: true, reason };
    }
  }

  return { dangerous: false };
}
