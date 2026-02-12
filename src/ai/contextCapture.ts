import { invoke } from '@tauri-apps/api/core';
import { executeInPty } from '../terminal/core/executeInPty';

/**
 * SMART FILE CAPTURE SYSTEM
 * 
 * This module provides file content capture using the active terminal PTY.
 *
 * Benefits:
 * - Always matches the user's active terminal environment (SSH, containers, etc.)
 * - Respects file size limits to prevent crashes
 * - Full context for AI (not truncated by terminal display)
 */

export async function requestCaptureLast(count: number): Promise<void> {
  const safeCount = Math.max(1, Math.min(50, count));
  await invoke('emit_event', { 
    event: 'ai-context:capture-last', 
    payload: { count: safeCount } 
  });
}

/**
 * Intelligently capture file content without dumping to terminal.
 * - Local files: Uses direct Tauri filesystem access
 * - SSH files: Uses silent command execution (no terminal output)
 */
function shellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export async function captureFileContent(params: {
  path: string;
  fileLimitKb: number;
  terminalId?: number;
  workingDirectory?: string;
}): Promise<{ content: string; source: 'pty' }> {
  const trimmedPath = params.path.trim();
  if (!trimmedPath) {
    throw new Error('File path is required');
  }

  const maxBytes = Math.max(1024, Math.min(2 * 1024 * 1024, params.fileLimitKb * 1024));

  try {
    const terminalId = params.terminalId ?? await invoke<number>('get_active_terminal');
    const cwdPrefix = params.workingDirectory
      ? `cd ${shellEscape(params.workingDirectory)} && `
      : '';
    const command = `${cwdPrefix}head -c ${maxBytes} ${shellEscape(trimmedPath)} 2>&1`;

    const result = await executeInPty({
      terminalId,
      command,
      timeoutMs: 10000,
    });

    if (result.exitCode !== 0) {
      throw new Error(result.output || 'Unknown error');
    }

    return { content: result.output, source: 'pty' };
  } catch (error) {
    throw new Error(`Failed to read file via PTY: ${error}`);
  }
}

