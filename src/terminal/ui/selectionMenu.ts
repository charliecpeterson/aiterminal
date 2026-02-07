import type { Terminal as XTermTerminal } from '@xterm/xterm';

type Disposable = { dispose: () => void };

export interface SelectionMenuState {
  x: number;
  y: number;
}

export interface AttachSelectionMenuParams {
  term: XTermTerminal;
  container: HTMLElement;
  selectionPointRef: React.MutableRefObject<{ x: number; y: number } | null>;
  setSelectionMenu: (value: SelectionMenuState | null) => void;
  onSelectionStart?: () => void;
}

export interface SelectionMenuHandle {
  cleanup: () => void;
}

export function attachSelectionMenu({
  term,
  container,
  selectionPointRef,
  setSelectionMenu,
  onSelectionStart,
}: AttachSelectionMenuParams): SelectionMenuHandle {
  const hideSelectionMenu = () => setSelectionMenu(null);

  const handleSelectionChange = () => {
    if (!term.hasSelection()) {
      hideSelectionMenu();
      return;
    }

    // Just indicate that selection exists, no position needed
    setSelectionMenu({
      x: 0,
      y: 0,
    });
  };

  const handleMouseUpSelection = (event: MouseEvent) => {
    selectionPointRef.current = { x: event.clientX, y: event.clientY };
    requestAnimationFrame(handleSelectionChange);
  };

  const handleMouseDownSelection = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('.terminal-marker') ||
      target?.closest('.command-block-indicator')
    ) {
      return;
    }
    if (!term.hasSelection()) {
      onSelectionStart?.();
    }
  };

  const selectionDisposable = term.onSelectionChange(handleSelectionChange) as unknown as
    | Disposable
    | undefined;

  container.addEventListener('mousedown', handleMouseDownSelection);
  container.addEventListener('mouseup', handleMouseUpSelection);

  const cleanup = () => {
    selectionDisposable?.dispose?.();
    container.removeEventListener('mousedown', handleMouseDownSelection);
    container.removeEventListener('mouseup', handleMouseUpSelection);
    hideSelectionMenu();
  };

  return { cleanup };
}
