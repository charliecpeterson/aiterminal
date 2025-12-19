import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export interface AiRunCommandHandle {
  cleanup: () => void;
}

export function attachAiRunCommandListener(params: {
  id: number;
  visibleRef: { current: boolean };
  focusTerminal: () => void;
}): AiRunCommandHandle {
  const unlistenPromise = listen<{ command: string }>('ai-run-command', (event) => {
    if (!params.visibleRef.current) return;

    const command = event.payload.command;
    if (!command) return;

    invoke('write_to_pty', { id: params.id, data: `${command}\n` });
    params.focusTerminal();
  });

  return {
    cleanup: () => {
      unlistenPromise.then((f) => f());
    },
  };
}
