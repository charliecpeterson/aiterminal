import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { invoke } from '@tauri-apps/api/core';
import {
  MIN_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  LAYOUT_STABILIZATION_DELAY_MS,
  RESIZE_DEBOUNCE_MS,
  INITIAL_RESIZE_DELAY_MS,
} from './constants';

export async function fitAndResizePty(id: number, term: XTermTerminal, fitAddon: FitAddon): Promise<void> {
  // Force a reflow before fitting
  fitAddon.fit();
  
  // Wait for layout to stabilize
  await new Promise(resolve => setTimeout(resolve, LAYOUT_STABILIZATION_DELAY_MS));
  
  // Fit again to ensure accurate dimensions
  fitAddon.fit();
  
  // Validate dimensions are positive integers
  const rows = Math.max(MIN_TERMINAL_ROWS, Math.min(MAX_TERMINAL_ROWS, term.rows));
  const cols = Math.max(MIN_TERMINAL_COLS, Math.min(MAX_TERMINAL_COLS, term.cols));
  
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
      const rows = Math.max(MIN_TERMINAL_ROWS, Math.min(MAX_TERMINAL_ROWS, term.rows));
      const cols = Math.max(MIN_TERMINAL_COLS, Math.min(MAX_TERMINAL_COLS, term.cols));
      invoke('resize_pty', { id, rows, cols });
    }, RESIZE_DEBOUNCE_MS);
  };

  window.addEventListener('resize', handleResize);

  // Do a quick initial resize (ResizeObserver will handle most cases now)
  const initialTimeout = window.setTimeout(() => {
    fitAddon.fit();
    const rows = Math.max(MIN_TERMINAL_ROWS, Math.min(MAX_TERMINAL_ROWS, term.rows));
    const cols = Math.max(MIN_TERMINAL_COLS, Math.min(MAX_TERMINAL_COLS, term.cols));
    invoke('resize_pty', { id, rows, cols });
  }, INITIAL_RESIZE_DELAY_MS);

  const cleanup = () => {
    if (resizeTimeout) {
      window.clearTimeout(resizeTimeout);
    }
    window.clearTimeout(initialTimeout);
    window.removeEventListener('resize', handleResize);
  };

  return { handleResize, cleanup };
}
