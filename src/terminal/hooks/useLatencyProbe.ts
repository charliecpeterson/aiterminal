import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../../utils/logger';

const log = createLogger('LatencyProbe');

export function useLatencyProbe(terminalId: number, intervalMs: number = 10000): {
  latencyMs: number | null;
  latencyAt: number | null;
} {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [latencyAt, setLatencyAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const measure = async () => {
      try {
        const result = await invoke<number>('measure_pty_latency', { id: terminalId });
        if (cancelled) return;
        setLatencyMs(result);
        setLatencyAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        log.warn('Latency probe failed', err);
        setLatencyMs(null);
        setLatencyAt(Date.now());
      }
    };

    measure();
    const handle = setInterval(measure, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [terminalId, intervalMs]);

  return { latencyMs, latencyAt };
}
