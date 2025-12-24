import { listen } from '@tauri-apps/api/event';

export interface CaptureLastCapable {
    captureLast: (count: number) => void;
}

export function attachCaptureLastListener(params: {
    visibleRef: { current: boolean };
    markerManagerRef: { current: CaptureLastCapable | null };
}): { cleanup: () => void } {
    const { visibleRef, markerManagerRef } = params;

    const unlistenPromise = listen<{ count: number }>('ai-context:capture-last', (event) => {
        console.log('[captureLast] Received event', { visible: visibleRef.current, payload: event.payload });
        if (!visibleRef.current) return;
        const rawCount = event.payload?.count ?? 1;
        const count = Math.max(1, Math.min(50, 
            Number.isFinite(rawCount) ? rawCount : 1));
        console.log('[captureLast] Calling markerManager.captureLast', { count });
        markerManagerRef.current?.captureLast(count);
    });

    return {
        cleanup: () => {
            unlistenPromise.then((f) => f());
        },
    };
}
