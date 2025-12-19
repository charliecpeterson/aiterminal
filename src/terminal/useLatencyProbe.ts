import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useLatencyProbe(intervalMs: number = 10000): {
  latencyMs: number | null;
  latencyAt: number | null;
} {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [latencyAt, setLatencyAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    const measure = async () => {
      const start = performance.now();
      try {
        await invoke('ping');
        if (cancelled) return;
        setLatencyMs(Math.round(performance.now() - start));
        setLatencyAt(Date.now());
      } catch {
        if (cancelled) return;
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
  }, [intervalMs]);

  return { latencyMs, latencyAt };
}
