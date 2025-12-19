import { useEffect } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { AppearanceSettings } from './appearance';
import { applyTerminalAppearance } from './appearance';

export function useTerminalAppearance(params: {
    termRef: { current: XTermTerminal | null };
    fitAddonRef: { current: FitAddon | null };
    appearance: AppearanceSettings | null | undefined;
}): void {
    const { termRef, fitAddonRef, appearance } = params;

    useEffect(() => {
        if (!appearance) return;
        const term = termRef.current;
        if (!term) return;

        applyTerminalAppearance({
            term,
            appearance,
            fitAddon: fitAddonRef.current,
        });
    }, [appearance, termRef, fitAddonRef]);
}
