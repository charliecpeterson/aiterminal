import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';

export async function fitAndResizePty(id: number, term: XTermTerminal, fitAddon: FitAddon): Promise<void> {
  fitAddon.fit();
  // Validate dimensions are positive integers
  const rows = Math.max(1, Math.min(1000, term.rows));
  const cols = Math.max(1, Math.min(1000, term.cols));
  await invoke('resize_pty', { id, rows, cols });
}

export interface WindowResizeParams {
  id: number;
  term: XTermTerminal;
  fitAddon: FitAddon;
  visibleRef: { current: boolean };
}

export interface WindowResizeHandle {
  handleResize: () => void;
  cleanup: () => void;
}

export function attachWindowResize({ id, term, fitAddon, visibleRef }: WindowResizeParams): WindowResizeHandle {
  const handleResize = () => {
    if (!visibleRef.current) return;
    fitAddon.fit();
    // Validate dimensions before sending to backend
    const rows = Math.max(1, Math.min(1000, term.rows));
    const cols = Math.max(1, Math.min(1000, term.cols));
    invoke('resize_pty', { id, rows, cols });
  };

  window.addEventListener('resize', handleResize);

  // Match existing behavior: do an initial resize slightly delayed.
  const timeoutId = window.setTimeout(handleResize, 100);

  const cleanup = () => {
    window.clearTimeout(timeoutId);
    window.removeEventListener('resize', handleResize);
  };

  return { handleResize, cleanup };
}
