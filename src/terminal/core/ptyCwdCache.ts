import { invoke } from '@tauri-apps/api/core';

// Minimal shared cache for PTY current working directory.
// Primary source: OSC 7 events forwarded to the window as `aiterm:pty-cwd`.
// Fallback: one-off `get_pty_cwd` invoke (may be expensive on macOS).

type CwdEntry = {
  cwd: string;
  updatedAt: number;
};

const cwdByPtyId = new Map<number, CwdEntry>();
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
    cwdByPtyId.set(id, { cwd, updatedAt: Date.now() });
  };

  window.addEventListener('aiterm:pty-cwd', onCwdEvent as EventListener);
}

export function getCachedPtyCwd(ptyId: number): string | null {
  ensureListenerInstalled();
  return cwdByPtyId.get(ptyId)?.cwd ?? null;
}

export async function getPtyCwd(ptyId: number, opts?: { maxAgeMs?: number }): Promise<string> {
  ensureListenerInstalled();

  const maxAgeMs = opts?.maxAgeMs ?? 30_000;
  const cached = cwdByPtyId.get(ptyId);
  if (cached && Date.now() - cached.updatedAt <= maxAgeMs) {
    return cached.cwd;
  }

  const existing = inFlight.get(ptyId);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const cwd = await invoke<string>('get_pty_cwd', { id: ptyId });
      cwdByPtyId.set(ptyId, { cwd, updatedAt: Date.now() });
      return cwd;
    } catch {
      return cached?.cwd ?? '~';
    } finally {
      inFlight.delete(ptyId);
    }
  })();

  inFlight.set(ptyId, promise);
  return promise;
}
