/**
 * Terminal Latency Hook
 *
 * Measures round-trip latency for PTY communication.
 * Useful for monitoring SSH connection quality or local responsiveness.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../../utils/logger';

const log = createLogger('TerminalLatency');

interface UseLatencyOptions {
  /** Whether latency measurement is enabled (default: true) */
  enabled?: boolean;
  /** Polling interval in ms (default: 5000) */
  intervalMs?: number;
}

/**
 * Hook for terminal latency measurement
 */
export function useLatency(
  ptyId: number | null,
  options: UseLatencyOptions = {}
): number | null {
  const { enabled = true, intervalMs = 5000 } = options;

  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const mountedRef = useRef(true);

  // Fetch latency
  const fetchLatency = useCallback(async () => {
    if (!enabled || ptyId === null) return;

    try {
      const latency = await invoke<number>('measure_pty_latency', { id: ptyId });
      if (mountedRef.current) {
        setLatencyMs(latency);
      }
    } catch (err) {
      log.debug('Failed to measure latency', err);
      if (mountedRef.current) {
        setLatencyMs(null);
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
    fetchLatency();

    // Use recursive setTimeout for polling
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        await fetchLatency();
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
  }, [fetchLatency, enabled, intervalMs, ptyId]);

  return latencyMs;
}
