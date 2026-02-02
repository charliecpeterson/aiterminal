import { invoke } from '@tauri-apps/api/core';
import { LRUCache } from '../../utils/cache';

// Minimal shared cache for PTY current working directory.
// Primary source: OSC 7 events forwarded to the window as `aiterm:pty-cwd`.
// Fallback: one-off `get_pty_cwd` invoke (may be expensive on macOS).

const DEFAULT_MAX_AGE_MS = 30_000;
const MAX_PTY_ENTRIES = 100; // Support up to 100 concurrent PTYs

// LRU cache for CWD entries by PTY ID
const cwdCache = new LRUCache<number, string>({
  maxSize: MAX_PTY_ENTRIES,
  maxAgeMs: DEFAULT_MAX_AGE_MS,
});

// Track in-flight requests to avoid duplicate concurrent fetches
const inFlight = new Map<number, Promise<string>>();

let listenerInstalled = false;

function ensureListenerInstalled() {
  if (listenerInstalled) return;
  listenerInstalled = true;

  if (typeof window === 'undefined') return;

  const onCwdEvent = (event: Event) => {
    const e = event as CustomEvent<{ id: number; cwd: string }>;
    if (!e?.detail) return;
    const id = e.detail.id;
    if (typeof id !== 'number') return;

    const cwd = e.detail.cwd || '/';
    cwdCache.set(id, cwd);
  };

  window.addEventListener('aiterm:pty-cwd', onCwdEvent as EventListener);
}

export function getCachedPtyCwd(ptyId: number): string | null {
  ensureListenerInstalled();
  return cwdCache.get(ptyId) ?? null;
}

export async function getPtyCwd(ptyId: number, opts?: { maxAgeMs?: number }): Promise<string> {
  ensureListenerInstalled();

  // Check cache (LRUCache handles TTL internally with default maxAgeMs)
  // For custom maxAgeMs, we still use the cache but may need to refresh sooner
  const maxAgeMs = opts?.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const cached = cwdCache.get(ptyId);
  
  // If we have a cached value and custom maxAgeMs isn't shorter than default, use it
  // Note: LRUCache uses its configured maxAgeMs (30s), so if caller wants fresher data,
  // they can pass a shorter maxAgeMs to trigger a refresh
  if (cached && maxAgeMs >= DEFAULT_MAX_AGE_MS) {
    return cached;
  }

  // For shorter maxAgeMs requests or cache misses, fetch fresh data
  const existing = inFlight.get(ptyId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const cwd = await invoke<string>('get_pty_cwd', { id: ptyId });
      cwdCache.set(ptyId, cwd);
      return cwd;
    } catch {
      return cached ?? '~';
    } finally {
      inFlight.delete(ptyId);
    }
  })();

  inFlight.set(ptyId, promise);
  return promise;
}
