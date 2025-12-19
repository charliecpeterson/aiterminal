import { useEffect, useRef } from 'react';
import { attachPtyExitListener } from './ptyListeners';

export function usePtyAutoClose(params: { id: number; onClose: () => void }): void {
    const { id, onClose } = params;

    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        const handle = attachPtyExitListener({
            id,
            onExit: () => onCloseRef.current(),
        });
        return () => handle.cleanup();
    }, [id]);
}
