import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import { fitAndResizePty } from './resize';

export function handleTerminalVisibilityChange(params: {
    id: number;
    visible: boolean;
    visibleRef: { current: boolean };
    termRef: { current: XTerm | null };
    fitAddonRef: { current: FitAddon | null };
}): void {
    const { id, visible, visibleRef, termRef, fitAddonRef } = params;

    visibleRef.current = visible;

    if (!visible) return;

    const term = termRef.current;
    const fitAddon = fitAddonRef.current;
    if (!term || !fitAddon) return;

    requestAnimationFrame(() => {
        const currentTerm = termRef.current;
        const currentFitAddon = fitAddonRef.current;
        if (!currentTerm || !currentFitAddon) return;

        fitAndResizePty(id, currentTerm, currentFitAddon).finally(() => {
            termRef.current?.focus();
        });
    });
}
