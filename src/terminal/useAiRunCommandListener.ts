import { useEffect } from 'react';
import { attachAiRunCommandListener } from './aiRunCommand';

export function useAiRunCommandListener(params: {
    id: number;
    visibleRef: { current: boolean };
    focusTerminal: () => void;
}): void {
    const { id, visibleRef, focusTerminal } = params;

    useEffect(() => {
        const handle = attachAiRunCommandListener({
            id,
            visibleRef,
            focusTerminal,
        });

        return () => handle.cleanup();
    }, [id, visibleRef, focusTerminal]);
}
