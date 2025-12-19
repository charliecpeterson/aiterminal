import { useEffect } from 'react';
import { attachAiRunCommandListener } from './aiRunCommand';

export function useAiRunCommandListener(params: {
    id: number;
    visibleRef: { current: boolean };
    focusTerminal: () => void;
    auditToTerminal?: (line: string) => void;
}): void {
    const { id, visibleRef, focusTerminal, auditToTerminal } = params;

    useEffect(() => {
        const handle = attachAiRunCommandListener({
            id,
            visibleRef,
            focusTerminal,
            auditToTerminal,
        });

        return () => handle.cleanup();
    }, [id, visibleRef, focusTerminal, auditToTerminal]);
}
