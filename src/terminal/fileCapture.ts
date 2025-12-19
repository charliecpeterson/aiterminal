import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export interface PendingFileCaptureRef {
  current: null | { path: string; maxBytes: number };
}

export interface FileCaptureListenerParams {
  id: number;
  visibleRef: { current: boolean };
  pendingFileCaptureRef: PendingFileCaptureRef;
  focusTerminal: () => void;
}

export interface FileCaptureListenerHandle {
  cleanup: () => void;
}

export function attachFileCaptureListener({
  id,
  visibleRef,
  pendingFileCaptureRef,
  focusTerminal,
}: FileCaptureListenerParams): FileCaptureListenerHandle {
  const unlistenPromise = listen<{ path: string; maxBytes: number }>('ai-context:capture-file', (event) => {
    if (!visibleRef.current) return;

    const path = event.payload.path?.trim();
    const maxBytes = Math.max(1024, Math.min(2 * 1024 * 1024, event.payload.maxBytes || 0));
    if (!path || !maxBytes) return;

    pendingFileCaptureRef.current = { path, maxBytes };

    const command = `HISTCONTROL=ignorespace HIST_IGNORE_SPACE=1 head -c ${maxBytes} ${shellQuote(path)}`;

    // Prepend a space so bash doesn't add it to history for common configs.
    invoke('write_to_pty', { id, data: ` ${command}\n` });
    focusTerminal();
  });

  const cleanup = () => {
    unlistenPromise.then((f) => f());
  };

  return { cleanup };
}
