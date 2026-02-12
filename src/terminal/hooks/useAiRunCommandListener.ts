import { useEffect, useRef } from 'react';
import { attachAiRunCommandListener } from '../core/aiRunCommand';

export function useAiRunCommandListener(params: {
    id: number;
    visibleRef: { current: boolean };
    focusTerminal: () => void;
    auditToTerminal?: (line: string) => void;
}): void {
    const { id, visibleRef } = params;

    // Store callbacks in refs so the listener always calls the latest version
    // without needing to re-attach on every render
    const focusRef = useRef(params.focusTerminal);
    focusRef.current = params.focusTerminal;

    const auditRef = useRef(params.auditToTerminal);
    auditRef.current = params.auditToTerminal;

    useEffect(() => {
        const handle = attachAiRunCommandListener({
            id,
            visibleRef,
            focusTerminal: () => focusRef.current(),
            auditToTerminal: (line) => auditRef.current?.(line),
        });

        return () => handle.cleanup();
    // Only re-attach when the terminal ID changes
    // visibleRef is a stable ref object, focusRef/auditRef are accessed via .current
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);
}
