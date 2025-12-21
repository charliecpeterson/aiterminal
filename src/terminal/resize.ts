import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';

export async function fitAndResizePty(id: number, term: XTermTerminal, fitAddon: FitAddon): Promise<void> {
  // Force a reflow before fitting
  fitAddon.fit();
  
  // Wait for layout to stabilize
  await new Promise(resolve => setTimeout(resolve, 10));
  
  // Fit again to ensure accurate dimensions
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
  let resizeTimeout: number | undefined;
  
  const handleResize = () => {
    if (!visibleRef.current) return;
    
    // Debounce resize to avoid excessive calls
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }
    
    resizeTimeout = window.setTimeout(() => {
      fitAddon.fit();
      // Validate dimensions before sending to backend
      const rows = Math.max(1, Math.min(1000, term.rows));
      const cols = Math.max(1, Math.min(1000, term.cols));
      invoke('resize_pty', { id, rows, cols });
    }, 100);
  };

  window.addEventListener('resize', handleResize);

  // Do a quick initial resize (ResizeObserver will handle most cases now)
  const initialTimeout = window.setTimeout(() => {
    fitAddon.fit();
    const rows = Math.max(1, Math.min(1000, term.rows));
    const cols = Math.max(1, Math.min(1000, term.cols));
    invoke('resize_pty', { id, rows, cols });
  }, 50);

  const cleanup = () => {
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }
    window.clearTimeout(initialTimeout);
    window.removeEventListener('resize', handleResize);
  };

  return { handleResize, cleanup };
}
