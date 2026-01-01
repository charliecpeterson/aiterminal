import { invoke } from '@tauri-apps/api/core';

import type { MutableRefObject } from 'react';
import type { ContextItem } from '../context/AIContext';

import type { TerminalSession } from './createTerminalSession';
import { createTerminalSession } from './createTerminalSession';
import type { AppearanceSettings } from './ui/appearance';

import { attachScrollbarOverlay } from './ui/scrollbarOverlay';
import type { SelectionMenuState } from './ui/selectionMenu';
import { attachSelectionMenu } from './ui/selectionMenu';
import type { CopyMenuState, MarkerManager } from './ui/markers';
import { createMarkerManager } from './ui/markers';
import { attachFileCaptureListener, type PendingFileCapture } from './core/fileCapture';
import { attachHostLabelOsc } from './core/hostLabel';
import { attachTerminalHotkeys } from './core/keyboardShortcuts';
import { attachWindowResize } from './resize';
import { attachPtyDataListener } from './core/ptyListeners';
import { attachCaptureLastListener } from './captureLast';
import { getRangeText } from './ui/copyContext';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type { SearchAddon } from '@xterm/addon-search';

export interface TerminalWiring {
    session: TerminalSession;
    markerManager: MarkerManager;
    cleanup: () => void;
}

export interface TerminalWiringCleanup {
    dispose: () => void;
}

export function createTerminalWiring(params: {
    id: number;
    container: HTMLElement;
    appearance: AppearanceSettings;
    maxMarkers: number;
    foldThreshold: number;
    foldEnabled: boolean;

    visibleRef: { current: boolean };
    selectionPointRef: MutableRefObject<{ x: number; y: number } | null>;
    pendingFileCaptureRef: MutableRefObject<PendingFileCapture | null>;

    setCopyMenu: (value: CopyMenuState | null) => void;
    setSelectionMenu: (value: SelectionMenuState | null) => void;
    setShowSearch: (updater: boolean | ((prev: boolean) => boolean)) => void;
    setHostLabel: (value: string) => void;

    addContextItem: (item: ContextItem) => void;
    addContextItemWithScan?: (content: string, type: import('../context/AIContext').ContextType, metadata?: ContextItem['metadata']) => Promise<void>;

    hideCopyMenu: () => void;
    hideSelectionMenu: () => void;

    termRef?: { current: XTermTerminal | null };
    fitAddonRef?: { current: FitAddon | null };
    searchAddonRef?: { current: SearchAddon | null };
    
    onCommandStart?: () => void;
    onCommandEnd?: () => void;
}): TerminalWiring {
    const {
        id,
        container,
        appearance,
        maxMarkers,
        foldThreshold,
        foldEnabled,
        visibleRef,
        selectionPointRef,
        pendingFileCaptureRef,
        setCopyMenu,
        setSelectionMenu,
        setShowSearch,
        setHostLabel,
        addContextItem,
        addContextItemWithScan,
        hideCopyMenu,
        hideSelectionMenu,
        termRef,
        fitAddonRef,
        searchAddonRef,
        onCommandStart,
        onCommandEnd,
    } = params;

    const session = createTerminalSession({ container, appearance });
    const term = session.term;

    if (termRef) termRef.current = term;
    if (fitAddonRef) fitAddonRef.current = session.fitAddon;
    if (searchAddonRef) searchAddonRef.current = session.searchAddon;

    const scrollbar = attachScrollbarOverlay(container, term.element ?? null);

    const ptyDataListener = attachPtyDataListener({
        id,
        onData: (data) => term.write(data),
    });

    const focusTimeoutId = window.setTimeout(() => {
        term.focus();
    }, 50);

    const selectionMenuHandle = attachSelectionMenu({
        term,
        container,
        selectionPointRef,
        setSelectionMenu,
    });

    const markerManager = createMarkerManager({
        term,
        maxMarkers,
        foldThreshold,
        foldEnabled,
        setCopyMenu,
        getRangeText: (range) => getRangeText(term, range),
        addContextItem,
        addContextItemWithScan,
        pendingFileCaptureRef,
        onCommandStart,
        onCommandEnd,
    });

    const markerManagerRef = { current: markerManager };

    // Pass Python REPL detection callback to hostLabel handler
    const hostLabelHandle = attachHostLabelOsc(
        term,
        setHostLabel,
        (enabled) => {
            markerManager.setPythonREPL(enabled);
        },
        (enabled) => {
            markerManager.setRREPL(enabled);
        }
    );

    const onDataDisposable = term.onData((data) => {
        invoke('write_to_pty', { id, data });
    });

    // Watch the container for size changes (more reliable than window resize)
    let resizeTimeout: number | undefined;
    const resizeObserver = new ResizeObserver(() => {
        if (!visibleRef.current) return;
        
        // Debounce to avoid excessive resizes
        if (resizeTimeout) {
            window.clearTimeout(resizeTimeout);
        }
        
        resizeTimeout = window.setTimeout(() => {
            session.fitAddon.fit();
            const rows = Math.max(1, Math.min(1000, term.rows));
            const cols = Math.max(1, Math.min(1000, term.cols));
            invoke('resize_pty', { id, rows, cols });
        }, 50);
    });
    resizeObserver.observe(container);

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

    // Attach terminal click handler for command block highlighting
    const terminalClickCleanup = markerManager.attachTerminalClickHandler();

    return {
        session,
        markerManager,
        cleanup: () => {
            window.clearTimeout(focusTimeoutId);
            if (resizeTimeout) {
                window.clearTimeout(resizeTimeout);
            }

            // Tear down in reverse-ish order while term is still alive.
            terminalClickCleanup();
            fileCaptureListener.cleanup();
            captureLastListener.cleanup();
            hotkeys.cleanup();
            resizeObserver.disconnect();
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

            if (termRef) termRef.current = null;
            if (fitAddonRef) fitAddonRef.current = null;
            if (searchAddonRef) searchAddonRef.current = null;
        },
    };
}
