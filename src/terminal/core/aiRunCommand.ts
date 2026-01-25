import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createLogger } from '../../utils/logger';

const log = createLogger('AIRunCommand');

type RunMode = 'run' | 'insert';

type AiRunCommandPayload = {
  command: string;
  terminalId?: number | null;
  source?: string;
};

function normalizeCommand(raw: string): string {
  // Preserve leading whitespace (users sometimes rely on it for bash history controls),
  // but remove trailing newlines to avoid accidental execution when we mean to insert.
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[\n\t ]+$/g, '');
}

function decideRunMode(command: string): { mode: RunMode; reason?: string } {
  const trimmed = command.trim();
  if (!trimmed) return { mode: 'insert', reason: 'empty' };

  // Never auto-run multiline commands.
  if (command.includes('\n')) return { mode: 'insert', reason: 'multiline' };

  const lower = trimmed.toLowerCase();

  // High-risk patterns: destructive, privilege escalation, or common “pipe-to-shell”.
  const riskyRegexes: Array<{ re: RegExp; reason: string }> = [
    { re: /\brm\s+-[\w-]*r[\w-]*f\b/i, reason: 'rm -rf' },
    { re: /\bmkfs(\.|\s)/i, reason: 'mkfs' },
    { re: /\bdd\s+.*\bof=\/(dev|etc|usr|bin|sbin)\b/i, reason: 'dd to system path' },
    { re: /\bshutdown\b|\breboot\b|\bpoweroff\b/i, reason: 'shutdown/reboot' },
    { re: /\bsudo\b/i, reason: 'sudo' },
    { re: /\b(killall|pkill)\b/i, reason: 'killall/pkill' },
    { re: /\bkill\s+-9\b/i, reason: 'kill -9' },
    { re: /\b(scancel|sbatch|srun|qsub|qdel)\b/i, reason: 'scheduler command' },
    { re: /\b(curl|wget)\b[^|]*\|\s*(sh|bash|zsh)\b/i, reason: 'pipe-to-shell' },
    { re: /\|\s*sh\b|\|\s*bash\b|\|\s*zsh\b/i, reason: 'pipe-to-shell' },
    { re: />\s*\/(etc|usr|bin|sbin)\//i, reason: 'redirect to system path' },
    { re: /\bchmod\b\s+-r\b|\bchmod\b\s+-r\s+777\b/i, reason: 'recursive chmod' },
    { re: /\bchown\b\s+-r\b/i, reason: 'recursive chown' },
  ];

  for (const { re, reason } of riskyRegexes) {
    if (re.test(lower)) return { mode: 'insert', reason };
  }

  return { mode: 'run' };
}

function toOneLine(value: string, maxLen: number): string {
  const collapsed = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLen) return collapsed;
  return `${collapsed.slice(0, Math.max(0, maxLen - 1))}…`;
}

export interface AiRunCommandHandle {
  cleanup: () => void;
}

export function attachAiRunCommandListener(params: {
  id: number;
  visibleRef: { current: boolean };
  focusTerminal: () => void;
  auditToTerminal?: (line: string) => void;
}): AiRunCommandHandle {
  const unlistenPromise = listen<AiRunCommandPayload>('ai-run-command', (event) => {
    const targetId = event.payload?.terminalId;
    if (targetId !== null && targetId !== undefined && targetId !== params.id) return;
    if (!params.visibleRef.current) return;

    const rawCommand = event.payload?.command;
    if (!rawCommand || typeof rawCommand !== 'string') return;
    
    const normalized = normalizeCommand(rawCommand);
    const { mode, reason } = decideRunMode(normalized);
    if (!normalized.trim()) return;

    if (mode === 'run') {
      params.auditToTerminal?.(
        `[AI] run: ${toOneLine(normalized, 200)}`
      );
      invoke('write_to_pty', { id: params.id, data: `${normalized}\n` });
    } else {
      // Insert only (no newline) so the user can review before execution.
      // Prepend a space so bash doesn't add it to history for common configs.
      params.auditToTerminal?.(
        `[AI] insert${reason && reason !== 'empty' ? ` (${reason})` : ''}: ${toOneLine(normalized, 200)}`
      );
      invoke('write_to_pty', { id: params.id, data: ` ${normalized}` });
      if (reason && reason !== 'empty') {
        log.warn(`Inserted instead of running (${reason})`);
      }
    }
    params.focusTerminal();
  });

  return {
    cleanup: () => {
      unlistenPromise.then((f) => f());
    },
  };
}
