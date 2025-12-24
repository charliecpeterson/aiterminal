import { listen } from '@tauri-apps/api/event';

export interface PtyListenerHandle {
  cleanup: () => void;
}

export function attachPtyDataListener(params: {
  id: number;
  onData: (data: string) => void;
}): PtyListenerHandle {
  const unlistenPromise = listen<string>(`pty-data:${params.id}`, (event) => {
    // Validate payload is a string before processing
    if (typeof event.payload === 'string') {
      params.onData(event.payload);
    }
  });

  return {
    cleanup: () => {
      unlistenPromise.then((f) => f());
    },
  };
}

export function attachPtyExitListener(params: {
  id: number;
  onExit: () => void;
}): PtyListenerHandle {
  const unlistenPromise = listen<void>(`pty-exit:${params.id}`, () => {
    params.onExit();
  });

  return {
    cleanup: () => {
      unlistenPromise.then((f) => f());
    },
  };
}
