import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const MAX_OUTPUT_BYTES = 2 * 1024 * 1024; // 2MB cap to prevent UI freeze

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
  const markerToken =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  const startMarker = `__AITERM_START_${markerToken}__`;
  const endMarker = `__AITERM_END_${markerToken}__`;
  
  // Build the command with markers
  // We use printf to avoid extra newlines and escape sequences
  const wrappedCommand = [
    `printf '%s\\n' "${startMarker}"`,
    `(${command})`,
    'status=$?',
    `printf '%s:%s\\n' "${endMarker}" "$status"`,
  ].join(' ; ');
  
  const finalCommand = wrappedCommand + '\n';
  
  return new Promise(async (resolve, reject) => {
    let outputBuffer = '';
    let capturing = false;
    let capturedOutput: string[] = [];
    let unlisten: UnlistenFn | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let resolveTimer: ReturnType<typeof setTimeout> | null = null;
    let capturedExitCode = 0;
    
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

        // Guard against runaway output consuming memory and freezing the UI
        if (outputBuffer.length + data.length > MAX_OUTPUT_BYTES) {
          cleanup();
          resolve({
            output: outputBuffer.slice(0, MAX_OUTPUT_BYTES) + '\n[output truncated: exceeded 2MB limit]',
            exitCode: capturedExitCode,
          });
          return;
        }

        outputBuffer += data;
        
        // Check for start marker
        if (outputBuffer.includes(startMarker)) {
          capturing = true;
          // Remove everything up to and including the start marker
          const startIndex = outputBuffer.indexOf(startMarker) + startMarker.length;
          outputBuffer = outputBuffer.substring(startIndex);
          capturedOutput = [];
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
          
          const afterMarker = outputBuffer.substring(endIndex + endMarker.length);
          if (afterMarker.startsWith(':')) {
            const match = afterMarker.slice(1).match(/^\d+/);
            if (match) {
              capturedExitCode = parseInt(match[0], 10);
            }
          }
          
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
            
            // Strip any marker lines that may have leaked into output
            finalOutput = finalOutput
              .split('\n')
              .filter((line) => !line.includes(startMarker) && !line.includes(endMarker))
              .join('\n')
              .trim();
            
            // Defer cleanup to avoid calling unlisten while in its own callback
            setTimeout(() => cleanup(), 0);
            
            resolve({
              output: finalOutput,
              exitCode: capturedExitCode,
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
        data: finalCommand,
      });
      
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
