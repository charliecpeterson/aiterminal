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
import {
  MIN_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MAX_TERMINAL_COLS,
  TERMINAL_FOCUS_DELAY_MS,
  RESIZE_OBSERVER_DEBOUNCE_MS,
} from './constants';

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
    xtermContainer?: HTMLElement;
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
        xtermContainer,
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

    const session = createTerminalSession({ container: xtermContainer ?? container, appearance });
    const term = session.term;

    if (termRef) termRef.current = term;
    if (fitAddonRef) fitAddonRef.current = session.fitAddon;
    if (searchAddonRef) searchAddonRef.current = session.searchAddon;

    // Immediately resize PTY to match terminal dimensions after opening
    // This prevents the shell from assuming wrong columns before we send the real size
    Promise.resolve().then(() => {
        session.fitAddon.fit();
        const rows = Math.max(MIN_TERMINAL_ROWS, Math.min(MAX_TERMINAL_ROWS, term.rows));
        const cols = Math.max(MIN_TERMINAL_COLS, Math.min(MAX_TERMINAL_COLS, term.cols));
        invoke('resize_pty', { id, rows, cols });
    });

    const markerManagerRef: { current: MarkerManager | null } = { current: null };

    // Scrollbar overlay with marker ticks.
    // Prefer mounting on the xterm host container (outside xterm) so it's not hidden
    // by WebView compositing and it can live in the host's right padding gutter.
    const scrollbar = attachScrollbarOverlay(container, term.element ?? null, {
        getTicks: () => markerManagerRef.current?.getMarkerTicks?.() ?? [],
        getTotalLines: () => term.buffer.active.length,
    });

    const ptyDataListener = attachPtyDataListener({
        id,
        onData: (data) => term.write(data),
    });

    const focusTimeoutId = window.setTimeout(() => {
        term.focus();
    }, TERMINAL_FOCUS_DELAY_MS);

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
        onMarkersChanged: () => scrollbar.refresh(),
    });

    markerManagerRef.current = markerManager;

    // Pass Python REPL detection callback to hostLabel handler
    const hostLabelHandle = attachHostLabelOsc(
        term,
        setHostLabel,
        (enabled) => {
            markerManager.setPythonREPL(enabled);
        },
        (enabled) => {
            markerManager.setRREPL(enabled);
        },
        () => {
            markerManager.handlePromptDetected();
        }
    );

    const onDataDisposable = term.onData((data) => {
        if (data.includes('\r') || data.includes('\n')) {
            markerManager.noteUserCommandIssued();
        }
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
            const rows = Math.max(MIN_TERMINAL_ROWS, Math.min(MAX_TERMINAL_ROWS, term.rows));
            const cols = Math.max(MIN_TERMINAL_COLS, Math.min(MAX_TERMINAL_COLS, term.cols));
            invoke('resize_pty', { id, rows, cols });
        }, RESIZE_OBSERVER_DEBOUNCE_MS);
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
