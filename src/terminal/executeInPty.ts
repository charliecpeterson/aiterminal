import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface ExecuteInPtyOptions {
  terminalId: number;
  command: string;
  timeoutMs?: number;
}

interface ExecuteInPtyResult {
  output: string;
  exitCode: number;
}

/**
 * Execute a command in the PTY and capture its output
 * This uses markers to identify command output in the PTY stream
 */
export async function executeInPty(options: ExecuteInPtyOptions): Promise<ExecuteInPtyResult> {
  const { terminalId, command, timeoutMs = 10000 } = options;
  
  // Generate unique markers
  const timestamp = Date.now();
  const startMarker = `__AITERM_START_${timestamp}__`;
  const endMarker = `__AITERM_END_${timestamp}__`;
  
  // Build the command with markers
  // We use printf to avoid extra newlines and escape sequences
  const wrappedCommand = `printf '${startMarker}\\n' && (${command}) && printf '\\n${endMarker}\\n'\n`;
  
  console.log(`🔧 Executing in PTY ${terminalId}:`, command);
  
  return new Promise(async (resolve, reject) => {
    let outputBuffer = '';
    let capturing = false;
    let capturedOutput: string[] = [];
    let unlisten: UnlistenFn | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolveTimer: ReturnType<typeof setTimeout> | null = null;
    
    const cleanup = () => {
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (resolveTimer) {
        clearTimeout(resolveTimer);
        resolveTimer = null;
      }
    };
    
    // Set up timeout
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Command timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    
    // Listen for PTY output
    try {
      unlisten = await listen<string>(`pty-data:${terminalId}`, (event) => {
        const data = event.payload;
        outputBuffer += data;
        
        // Check for start marker
        if (outputBuffer.includes(startMarker)) {
          capturing = true;
          // Remove everything up to and including the start marker
          const startIndex = outputBuffer.indexOf(startMarker) + startMarker.length;
          outputBuffer = outputBuffer.substring(startIndex);
          capturedOutput = [];
          console.log('📥 Started capturing output');
        }
        
        // Check for end marker
        if (capturing && outputBuffer.includes(endMarker)) {
          // Cancel any pending resolve timer
          if (resolveTimer) {
            clearTimeout(resolveTimer);
            resolveTimer = null;
          }
          
          // Extract output between markers
          const endIndex = outputBuffer.indexOf(endMarker);
          const output = outputBuffer.substring(0, endIndex);
          capturedOutput.push(output);
          
          // Wait a tiny bit to ensure we got all the data
          resolveTimer = setTimeout(() => {
            // Join captured output and clean it up
            let finalOutput = capturedOutput.join('');
            
            // Remove ANSI escape sequences for cleaner output
            finalOutput = finalOutput
              .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Remove ANSI codes
              .replace(/\r\n/g, '\n') // Normalize line endings
              .replace(/\r/g, '\n') // Convert CR to LF
              .trim();
            
            console.log('✅ Command completed, output length:', finalOutput.length);
            
            // Defer cleanup to avoid calling unlisten while in its own callback
            setTimeout(() => cleanup(), 0);
            
            resolve({
              output: finalOutput,
              exitCode: 0, // TODO: Capture actual exit code
            });
          }, 50); // Wait 50ms to ensure all chunks are received
        }
        
        // Accumulate if capturing
        if (capturing && !outputBuffer.includes(endMarker)) {
          // Keep buffering
        }
      });
      
      // Send the command
      await invoke('write_to_pty', {
        id: terminalId,
        data: wrappedCommand,
      });
      
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
