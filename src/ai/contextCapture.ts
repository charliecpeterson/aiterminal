import { invoke } from '@tauri-apps/api/core';

/**
 * SMART FILE CAPTURE SYSTEM
 * 
 * This module provides intelligent file content capture that works both locally and over SSH:
 * 
 * - LOCAL: Uses Tauri's direct filesystem access (no terminal output, fast)
 * - REMOTE (SSH): Uses silent command execution via execute_tool_command (no terminal spam)
 * 
 * Benefits:
 * - No terminal pollution (content doesn't appear in terminal)
 * - Works at any SSH depth
 * - Respects file size limits to prevent crashes
 * - Full context for AI (not truncated by terminal display)
 * - Automatic UTF-8 validation
 */

export async function requestCaptureLast(count: number): Promise<void> {
  const safeCount = Math.max(1, Math.min(50, count));
  console.log('[contextCapture] Emitting ai-context:capture-last', { count: safeCount });
  await invoke('emit_event', { 
    event: 'ai-context:capture-last', 
    payload: { count: safeCount } 
  });
  console.log('[contextCapture] Emit completed');
}

/**
 * Intelligently capture file content without dumping to terminal.
 * - Local files: Uses direct Tauri filesystem access
 * - SSH files: Uses silent command execution (no terminal output)
 */
export async function captureFileContent(params: {
  path: string;
  fileLimitKb: number;
  isRemote: boolean;
  workingDirectory?: string;
}): Promise<{ content: string; source: 'local' | 'remote' }> {
  const trimmedPath = params.path.trim();
  if (!trimmedPath) {
    throw new Error('File path is required');
  }

  const maxBytes = Math.max(1024, Math.min(2 * 1024 * 1024, params.fileLimitKb * 1024));

  if (!params.isRemote) {
    // Local file: Use direct filesystem access (no terminal)
    try {
      const content = await invoke<string>('read_file_tool', {
        path: trimmedPath,
        maxBytes,
      });
      return { content, source: 'local' };
    } catch (error) {
      throw new Error(`Failed to read local file: ${error}`);
    }
  } else {
    // Remote file (SSH): Use silent command execution
    try {
      const result = await invoke<{
        stdout: string;
        stderr: string;
        exit_code: number;
      }>('execute_tool_command', {
        command: `head -c ${maxBytes} "${trimmedPath.replace(/"/g, '\\"')}" 2>&1`,
        workingDirectory: params.workingDirectory || null,
      });

      if (result.exit_code !== 0) {
        throw new Error(`Command failed: ${result.stderr || result.stdout}`);
      }

      return { content: result.stdout, source: 'remote' };
    } catch (error) {
      throw new Error(`Failed to read remote file: ${error}`);
    }
  }
}

/**
 * Legacy event-based file capture (still used by terminal command approach).
 * @deprecated Use captureFileContent instead for better control
 */
export async function requestCaptureFile(params: {
  path: string;
  fileLimitKb: number;
}): Promise<void> {
  const trimmedPath = params.path.trim();
  if (!trimmedPath) return;

  const kb = Number.isFinite(params.fileLimitKb)
    ? Math.max(1, Math.min(2048, params.fileLimitKb))
    : 200;

  await invoke('emit_event', {
    event: 'ai-context:capture-file',
    payload: {
      path: trimmedPath,
      maxBytes: kb * 1024,
    }
  });
}
