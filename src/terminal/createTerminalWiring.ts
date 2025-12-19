import { invoke } from '@tauri-apps/api/core';

import type { MutableRefObject } from 'react';
import type { ContextItem } from '../context/AIContext';

import type { TerminalSession } from './createTerminalSession';
import { createTerminalSession } from './createTerminalSession';
import type { AppearanceSettings } from './appearance';

import { attachScrollbarOverlay } from './scrollbarOverlay';
import type { SelectionMenuState } from './selectionMenu';
import { attachSelectionMenu } from './selectionMenu';
import type { CopyMenuState, MarkerManager } from './markers';
import { createMarkerManager } from './markers';
import { attachFileCaptureListener } from './fileCapture';
import { attachHostLabelOsc } from './hostLabel';
import { attachTerminalHotkeys } from './keyboardShortcuts';
import { attachWindowResize } from './resize';
import { attachPtyDataListener } from './ptyListeners';
import { attachCaptureLastListener } from './captureLast';
import { getRangeText } from './copyContext';

export interface TerminalWiring {
    session: TerminalSession;
    markerManager: MarkerManager;
    cleanup: () => void;
}

export function createTerminalWiring(params: {
    id: number;
    container: HTMLElement;
    appearance: AppearanceSettings;
    maxMarkers: number;

    visibleRef: { current: boolean };
    selectionPointRef: MutableRefObject<{ x: number; y: number } | null>;
    pendingFileCaptureRef: MutableRefObject<null | { path: string; maxBytes: number }>;

    setCopyMenu: (value: CopyMenuState | null) => void;
    setSelectionMenu: (value: SelectionMenuState | null) => void;
    setShowSearch: (updater: boolean | ((prev: boolean) => boolean)) => void;
    setHostLabel: (value: string) => void;

    addContextItem: (item: ContextItem) => void;

    hideCopyMenu: () => void;
    hideSelectionMenu: () => void;
}): TerminalWiring {
    const {
        id,
        container,
        appearance,
        maxMarkers,
        visibleRef,
        selectionPointRef,
        pendingFileCaptureRef,
        setCopyMenu,
        setSelectionMenu,
        setShowSearch,
        setHostLabel,
        addContextItem,
        hideCopyMenu,
        hideSelectionMenu,
    } = params;

    const session = createTerminalSession({ container, appearance });
    const term = session.term;

    const scrollbar = attachScrollbarOverlay(container, term.element ?? null);

    const ptyDataListener = attachPtyDataListener({
        id,
        onData: (data) => term.write(data),
    });

    const focusTimeoutId = window.setTimeout(() => {
        term.focus();
    }, 100);

    const selectionMenuHandle = attachSelectionMenu({
        term,
        container,
        selectionPointRef,
        setSelectionMenu,
    });

    const markerManager = createMarkerManager({
        term,
        maxMarkers,
        setCopyMenu,
        getRangeText: (range) => getRangeText(term, range),
        addContextItem,
        pendingFileCaptureRef,
    });

    const markerManagerRef = { current: markerManager };

    const hostLabelHandle = attachHostLabelOsc(term, setHostLabel);

    const onDataDisposable = term.onData((data) => {
        invoke('write_to_pty', { id, data });
    });

    const windowResize = attachWindowResize({ id, term, fitAddon: session.fitAddon, visibleRef });

    const hotkeys = attachTerminalHotkeys({
        term,
        fitAddon: session.fitAddon,
        visibleRef,
        setShowSearch,
        hideCopyMenu,
        hideSelectionMenu,
        resizePty: (rows, cols) => invoke('resize_pty', { id, rows, cols }),
    });

    const captureLastListener = attachCaptureLastListener({
        visibleRef,
        markerManagerRef,
    });

    const fileCaptureListener = attachFileCaptureListener({
        id,
        visibleRef,
        pendingFileCaptureRef,
        focusTerminal: () => term.focus(),
    });

    return {
        session,
        markerManager,
        cleanup: () => {
            window.clearTimeout(focusTimeoutId);

            // Tear down in reverse-ish order while term is still alive.
            fileCaptureListener.cleanup();
            captureLastListener.cleanup();
            hotkeys.cleanup();
            windowResize.cleanup();
            onDataDisposable?.dispose?.();
            hostLabelHandle.cleanup();
            markerManager.cleanup();
            selectionMenuHandle.cleanup();
            ptyDataListener.cleanup();
            scrollbar.cleanup();

            hideCopyMenu();
            hideSelectionMenu();

            session.cleanup();
        },
    };
}
