import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';

export async function fitAndResizePty(id: number, term: XTermTerminal, fitAddon: FitAddon): Promise<void> {
  fitAddon.fit();
  await invoke('resize_pty', { id, rows: term.rows, cols: term.cols });
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
    invoke('resize_pty', { id, rows: term.rows, cols: term.cols });
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
