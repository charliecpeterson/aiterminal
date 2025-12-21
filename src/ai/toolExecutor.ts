import { invoke } from '@tauri-apps/api/core';
import type { ParsedToolCall, ToolCallResult } from './tools';
import { executeInPty } from '../terminal/executeInPty';

/**
 * Execute a tool call and return the result
 */
export async function executeTool(
  toolCall: ParsedToolCall,
  terminalId?: number
): Promise<ToolCallResult> {
  try {
    const output = await executeToolInternal(toolCall, terminalId);
    return {
      tool_call_id: toolCall.id,
      output,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      tool_call_id: toolCall.id,
      output: '',
      success: false,
      error: errorMessage,
    };
  }
}

async function executeToolInternal(
  toolCall: ParsedToolCall,
  terminalId?: number
): Promise<string> {
  const { name, arguments: args } = toolCall;

  switch (name) {
    case 'execute_command':
      return await executeCommand(args.command, args.working_directory, terminalId);

    case 'read_file':
      return await readFile(args.path, args.max_bytes);

    case 'list_directory':
      return await listDirectory(args.path, args.show_hidden === 'true');

    case 'search_files':
      return await searchFiles(args.pattern, parseInt(args.max_results || '20'));

    case 'get_environment_variable':
      return await getEnvironmentVariable(args.variable);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Execute a command in the terminal
 */
async function executeCommand(
  command: string,
  workingDirectory?: string,
  terminalId?: number
): Promise<string> {
  // Default to terminal 0 if no ID provided
  const actualTerminalId = terminalId !== undefined && terminalId !== null ? terminalId : 0;
  
  console.log(`🔧 executeCommand called with:`, { command, workingDirectory, terminalId, actualTerminalId });
  
  try {
    // ALWAYS try PTY execution with the actual terminal ID
    console.log(`✅ Using PTY execution for terminal ${actualTerminalId}`);
    
    try {
      // If a specific working directory is requested, prepend cd command
      const fullCommand = workingDirectory 
        ? `cd "${workingDirectory}" && ${command}`
        : command;
      
      const result = await executeInPty({
        terminalId: actualTerminalId,
        command: fullCommand,
        timeoutMs: 10000,
      });
      
      console.log(`✅ PTY execution successful, output length: ${result.output.length}`);
      return result.output || '(no output)';
    } catch (ptyError) {
      console.error(`❌ PTY execution failed:`, ptyError);
      console.warn(`⚠️ Falling back to separate shell process`);
      // Fall through to fallback method
    }
    
    // Fallback: use the old method (separate shell process)
    console.log(`🔄 Using fallback execution method`);
    
    // If no working directory specified, try to get from terminal
    let cwd = workingDirectory;
    
    if (!cwd) {
      try {
        cwd = await invoke<string>('get_pty_cwd', { id: actualTerminalId });
        console.log(`📂 Got terminal CWD: ${cwd}`);
      } catch (error) {
        console.warn('Failed to get terminal CWD:', error);
      }
    }

    console.log(`🔧 Executing command via fallback: ${command} in ${cwd || 'default directory'}`);
    
    const result = await invoke<{ stdout: string; stderr: string; exit_code: number }>(
      'execute_tool_command',
      { 
        command,
        workingDirectory: cwd
      }
    );

    if (result.exit_code !== 0) {
      return `Command failed (exit code ${result.exit_code})\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`;
    }

    return result.stdout || '(no output)';
  } catch (error) {
    throw new Error(`Failed to execute command: ${error}`);
  }
}

/**
 * Read a file
 */
async function readFile(path: string, maxBytes?: string): Promise<string> {
  try {
    const limit = maxBytes ? parseInt(maxBytes) : 50000;
    const content = await invoke<string>('read_file_tool', { path, maxBytes: limit });
    
    if (content.length >= limit - 100) {
      return `${content}\n\n[Note: File was truncated at ${limit} bytes]`;
    }
    
    return content;
  } catch (error) {
    throw new Error(`Failed to read file: ${error}`);
  }
}

/**
 * List directory contents
 */
async function listDirectory(path?: string, showHidden?: boolean): Promise<string> {
  try {
    const entries = await invoke<string[]>('list_directory_tool', {
      path: path || '.',
      showHidden: showHidden || false,
    });

    if (entries.length === 0) {
      return 'Directory is empty';
    }

    return entries.join('\n');
  } catch (error) {
    throw new Error(`Failed to list directory: ${error}`);
  }
}

/**
 * Search for files by pattern
 */
async function searchFiles(pattern: string, maxResults: number): Promise<string> {
  try {
    const results = await invoke<string[]>('search_files_tool', {
      pattern,
      maxResults,
    });

    if (results.length === 0) {
      return `No files found matching pattern: ${pattern}`;
    }

    const output = results.join('\n');
    if (results.length >= maxResults) {
      return `${output}\n\n[Note: Limited to ${maxResults} results. Use more specific pattern for more.]`;
    }

    return output;
  } catch (error) {
    throw new Error(`Failed to search files: ${error}`);
  }
}

/**
 * Get environment variable
 */
async function getEnvironmentVariable(variable: string): Promise<string> {
  try {
    const value = await invoke<string | null>('get_env_var_tool', { variable });
    
    if (value === null) {
      return `Environment variable '${variable}' is not set`;
    }
    
    return value;
  } catch (error) {
    throw new Error(`Failed to get environment variable: ${error}`);
  }
}
