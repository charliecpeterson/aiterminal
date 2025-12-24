import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

export interface TerminalHotkeysParams {
  term: XTermTerminal;
  fitAddon: FitAddon;
  visibleRef: { current: boolean };
  setShowSearch: (updater: boolean | ((prev: boolean) => boolean)) => void;
  hideCopyMenu: () => void;
  hideSelectionMenu: () => void;
  resizePty: (rows: number, cols: number) => void;
}

export interface TerminalHotkeysHandle {
  cleanup: () => void;
}

export function attachTerminalHotkeys({
  term,
  fitAddon,
  visibleRef,
  setShowSearch,
  hideCopyMenu,
  hideSelectionMenu,
  resizePty,
}: TerminalHotkeysParams): TerminalHotkeysHandle {
  const handleKeydown = (e: KeyboardEvent) => {
    if (!visibleRef.current) return;

    if (e.metaKey || e.ctrlKey) {
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        const newSize = (term.options.fontSize || 14) + 1;
        term.options.fontSize = newSize;
        fitAddon.fit();
        resizePty(term.rows, term.cols);
      } else if (e.key === '-') {
        e.preventDefault();
        const newSize = Math.max(6, (term.options.fontSize || 14) - 1);
        term.options.fontSize = newSize;
        fitAddon.fit();
        resizePty(term.rows, term.cols);
      } else if (e.key === '0') {
        e.preventDefault();
        term.options.fontSize = 14;
        fitAddon.fit();
        resizePty(term.rows, term.cols);
      } else if (e.key === 'f') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      } else if (e.key === 'k') {
        e.preventDefault();
        // Clear terminal and refresh (helps fix rendering issues)
        term.clear();
        term.reset();
        fitAddon.fit();
        resizePty(term.rows, term.cols);
      }
    }

    if (e.key === 'Escape') {
      setShowSearch(false);
      hideCopyMenu();
      hideSelectionMenu();
      term.focus();
    }
  };

  window.addEventListener('keydown', handleKeydown);

  return {
    cleanup: () => window.removeEventListener('keydown', handleKeydown),
  };
}
