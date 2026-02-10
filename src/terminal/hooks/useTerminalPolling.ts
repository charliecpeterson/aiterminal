/**
 * Consolidated Terminal Polling Hook
 *
 * Combines all terminal polling into a single interval to reduce resource usage.
 * Previously, each terminal had 6+ separate intervals polling different data.
 * This consolidates: PTY info, latency, and health into one poll cycle.
 *
 * Refactored to compose smaller focused hooks:
 * - useTerminalHealth: Health monitoring
 * - useLatency: Latency measurement
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../../utils/logger';
import { useTerminalHealth, getHealthDescription, getHealthIndicator } from './useTerminalHealth';
import { useLatency } from './useLatency';

const log = createLogger('TerminalPolling');

// Default polling interval (5 seconds is a good balance)
const DEFAULT_POLL_INTERVAL_MS = 5000;

interface PtyInfo {
  pty_type: 'local' | 'ssh';
  remote_host?: string;
  remote_user?: string;
}

// Re-export types and helpers for backwards compatibility
export type { TerminalHealth } from './useTerminalHealth';
export { getHealthDescription, getHealthIndicator };

export interface TerminalPollingState {
  // PTY info
  isRemote: boolean;
  hostLabel: string;

  // Latency
  latencyMs: number | null;

  // Health
  health: {
    processAlive: boolean;
    writable: boolean;
    msSinceLastOutput: number | null;
    status: 'healthy' | 'idle' | 'unresponsive' | 'dead';
  } | null;
}

interface UseTerminalPollingOptions {
  /** Polling interval in milliseconds (default: 5000) */
  intervalMs?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
  /** Callback when remote state changes */
  onRemoteStateChange?: (isRemote: boolean) => void;
}

/**
 * Consolidated polling hook for terminal status information.
 *
 * Replaces: useTerminalStatus, useLatencyProbe, useTerminalHealth, and
 * the PTY info polling in Terminal.tsx.
 */
export function useTerminalPolling(
  ptyId: number | null,
  options: UseTerminalPollingOptions = {}
): TerminalPollingState {
  const {
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    enabled = true,
    onRemoteStateChange,
  } = options;

  // PTY info state (remote/local detection)
  const [isRemote, setIsRemote] = useState(false);
  const [hostLabel, setHostLabel] = useState('Local');

  // Refs for cleanup and tracking
  const mountedRef = useRef(true);
  const prevIsRemoteRef = useRef(false);
  const onRemoteStateChangeRef = useRef(onRemoteStateChange);

  // Keep callback ref updated
  useEffect(() => {
    onRemoteStateChangeRef.current = onRemoteStateChange;
  });

  const health = useTerminalHealth(ptyId, { enabled, intervalMs });
  const latencyMs = useLatency(ptyId, { enabled, intervalMs });

  // Fetch PTY info (remote state detection)
  const fetchPtyInfo = useCallback(async () => {
    if (!enabled || ptyId === null) return;

    try {
      const info = await invoke<PtyInfo>('get_pty_info', { id: ptyId });
      if (!mountedRef.current) return;

      const newIsRemote = info?.pty_type === 'ssh';
      setIsRemote(newIsRemote);

      if (newIsRemote && info.remote_host) {
        const userPart = info.remote_user ? `${info.remote_user}@` : '';
        setHostLabel(`🔒 ${userPart}${info.remote_host}`);
      } else {
        setHostLabel('Local');
      }

      // Notify if remote state changed
      if (newIsRemote !== prevIsRemoteRef.current) {
        prevIsRemoteRef.current = newIsRemote;
        onRemoteStateChangeRef.current?.(newIsRemote);
      }
    } catch (err) {
      log.debug('Failed to fetch PTY info', err);
    }
  }, [ptyId, enabled]);

  // Set up polling interval
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled || ptyId === null) {
      return () => { mountedRef.current = false; };
    }

    // Initial poll
    fetchPtyInfo();

    // Use recursive setTimeout instead of setInterval to prevent overlapping polls
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        await fetchPtyInfo();
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
  }, [fetchPtyInfo, enabled, intervalMs, ptyId]);

  return {
    isRemote,
    hostLabel,
    latencyMs,
    health,
  };
}
