import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';

export interface AiStreamHandlers {
    onChunk: (content: string) => void;
    onEnd: () => void;
    onError: (error: string) => void;
}

export interface AiStreamSubscription {
    cleanup: () => void;
}

export function attachAiStreamListeners(params: {
    requestId: string;
    handlers: AiStreamHandlers;
}): AiStreamSubscription {
    const { requestId, handlers } = params;

    let cleanedUp = false;
    const unlistenPromises: Array<Promise<UnlistenFn>> = [];

    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        for (const promise of unlistenPromises) {
            promise.then((unlisten) => unlisten());
        }
    };

    unlistenPromises.push(
        listen<{ request_id: string; content: string }>('ai-stream:chunk', (event) => {
            if (event.payload.request_id !== requestId) return;
            handlers.onChunk(event.payload.content);
        })
    );

    unlistenPromises.push(
        listen<{ request_id: string }>('ai-stream:end', (event) => {
            if (event.payload.request_id !== requestId) return;
            try {
                handlers.onEnd();
            } finally {
                cleanup();
            }
        })
    );

    unlistenPromises.push(
        listen<{ request_id: string; error: string }>('ai-stream:error', (event) => {
            if (event.payload.request_id !== requestId) return;
            try {
                handlers.onError(event.payload.error);
            } finally {
                cleanup();
            }
        })
    );

    return { cleanup };
}
