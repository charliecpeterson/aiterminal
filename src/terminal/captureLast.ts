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
        if (!visibleRef.current) return;
        const count = Math.max(1, Math.min(50, event.payload.count || 1));
        markerManagerRef.current?.captureLast(count);
    });

    return {
        cleanup: () => {
            unlistenPromise.then((f) => f());
        },
    };
}
