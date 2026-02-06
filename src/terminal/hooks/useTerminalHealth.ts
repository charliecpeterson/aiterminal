/**
 * Terminal Health Hook
 *
 * Monitors PTY health status including process state, writability,
 * and time since last output.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../../utils/logger';

const log = createLogger('TerminalHealth');

export interface TerminalHealth {
  processAlive: boolean;
  writable: boolean;
  msSinceLastOutput: number | null;
  status: 'healthy' | 'idle' | 'unresponsive' | 'dead';
}

interface RustTerminalHealth {
  process_alive: boolean;
  writable: boolean;
  ms_since_last_output: number | null;
  status: string;
}

interface UseTerminalHealthOptions {
  /** Whether health checking is enabled (default: true) */
  enabled?: boolean;
  /** Polling interval in ms (default: 5000) */
  intervalMs?: number;
}

/**
 * Hook for terminal health monitoring
 */
export function useTerminalHealth(
  ptyId: number | null,
  options: UseTerminalHealthOptions = {}
): TerminalHealth | null {
  const { enabled = true, intervalMs = 5000 } = options;

  const [health, setHealth] = useState<TerminalHealth | null>(null);
  const mountedRef = useRef(true);

  // Fetch health status
  const fetchHealth = useCallback(async () => {
    if (!enabled || ptyId === null) return;

    try {
      const result = await invoke<RustTerminalHealth>('check_pty_health', { id: ptyId });
      if (mountedRef.current) {
        setHealth({
          processAlive: result.process_alive,
          writable: result.writable,
          msSinceLastOutput: result.ms_since_last_output,
          status: result.status as TerminalHealth['status'],
        });
      }
    } catch (err) {
      log.debug('Failed to check health', err);
      if (mountedRef.current) {
        setHealth({
          processAlive: false,
          writable: false,
          msSinceLastOutput: null,
          status: 'dead',
        });
      }
    }
  }, [ptyId, enabled]);

  // Set up polling
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || ptyId === null) {
      return () => { mountedRef.current = false; };
    }

    // Initial fetch
    fetchHealth();

    // Use recursive setTimeout for polling
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        await fetchHealth();
        if (mountedRef.current) {
          scheduleNext();
        }
      }, intervalMs);
    };
    scheduleNext();

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [fetchHealth, enabled, intervalMs, ptyId]);

  return health;
}

/**
 * Get a human-readable description of the health status
 */
export function getHealthDescription(health: TerminalHealth | null): string {
  if (!health) return 'Unknown';

  switch (health.status) {
    case 'healthy':
      return 'Terminal is responsive';
    case 'idle':
      const idleMins = health.msSinceLastOutput
        ? Math.floor(health.msSinceLastOutput / 60000)
        : 0;
      return `No output for ${idleMins} minute${idleMins !== 1 ? 's' : ''}`;
    case 'unresponsive':
      return 'Terminal may be hung (cannot write)';
    case 'dead':
      return 'Terminal process has exited';
    default:
      return 'Unknown status';
  }
}

/**
 * Get status indicator emoji/icon for health
 */
export function getHealthIndicator(health: TerminalHealth | null): string {
  if (!health) return '';

  switch (health.status) {
    case 'healthy':
      return '';
    case 'idle':
      return '💤';
    case 'unresponsive':
      return '⚠️';
    case 'dead':
      return '🔴';
    default:
      return '';
  }
}
