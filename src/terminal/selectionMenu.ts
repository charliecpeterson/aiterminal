import type { Terminal as XTermTerminal } from '@xterm/xterm';

type Disposable = { dispose: () => void };

export interface AttachSelectionMenuParams {
  term: XTermTerminal;
  container: HTMLElement;
  selectionPointRef: React.MutableRefObject<{ x: number; y: number } | null>;
  setSelectionMenu: (value: { x: number; y: number } | null) => void;
}

export interface SelectionMenuHandle {
  cleanup: () => void;
}

export function attachSelectionMenu({
  term,
  container,
  selectionPointRef,
  setSelectionMenu,
}: AttachSelectionMenuParams): SelectionMenuHandle {
  const hideSelectionMenu = () => setSelectionMenu(null);

  const handleSelectionChange = () => {
    if (!term.hasSelection()) {
      hideSelectionMenu();
      return;
    }

    const point = selectionPointRef.current;
    const rect = container.getBoundingClientRect();
    const baseX = point ? point.x : rect.left + rect.width / 2;
    const baseY = point ? point.y : rect.top + rect.height / 2;
    const nextX = baseX + 8;
    const nextY = baseY - 32;

    setSelectionMenu({
      x: Math.max(rect.left + 8, Math.min(nextX, rect.right - 120)),
      y: Math.max(rect.top + 8, Math.min(nextY, rect.bottom - 40)),
    });
  };

  const handleMouseUpSelection = (event: MouseEvent) => {
    selectionPointRef.current = { x: event.clientX, y: event.clientY };
    requestAnimationFrame(handleSelectionChange);
  };

  const selectionDisposable = term.onSelectionChange(handleSelectionChange) as unknown as
    | Disposable
    | undefined;

  container.addEventListener('mouseup', handleMouseUpSelection);

  const cleanup = () => {
    selectionDisposable?.dispose?.();
    container.removeEventListener('mouseup', handleMouseUpSelection);
    hideSelectionMenu();
  };

  return { cleanup };
}
