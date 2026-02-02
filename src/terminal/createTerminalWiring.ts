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
import { createLogger } from '../utils/logger';
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

const log = createLogger('TerminalWiring');

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
        },
        (filePath) => {
            // Handle add file to context from terminal command
            import('@tauri-apps/api/core').then(({ invoke }) => {
                // Determine if we're in a remote session by checking PTY info
                invoke<{ pty_type: string }>('get_pty_info', { id })
                    .then((info) => {
                        const isRemote = info.pty_type === 'ssh';
                        const maxBytes = 200 * 1024; // 200KB default
                        
                        if (isRemote) {
                            // Remote file via silent command execution
                            invoke<{
                                stdout: string;
                                stderr: string;
                                exit_code: number;
                            }>('execute_tool_command', {
                                command: `head -c ${maxBytes} "${filePath.replace(/"/g, '\\"')}" 2>&1`,
                                workingDirectory: null,
                            }).then((result) => {
                                if (result.exit_code === 0) {
                                    addContextItemWithScan?.(result.stdout, 'file', {
                                        path: filePath,
                                        sizeKb: Math.round(result.stdout.length / 1024),
                                        source: 'remote',
                                    }).catch((err) => {
                                        log.error('Failed to add remote file to context', err);
                                        term.write(`\r\naiterm_add: Failed to add file to context: ${err}\r\n`);
                                    });
                                } else {
                                    term.write(`\r\naiterm_add: Failed to read file: ${result.stderr || result.stdout}\r\n`);
                                }
                            }).catch((err) => {
                                log.error('Failed to execute remote read command', err);
                                term.write(`\r\naiterm_add: Failed to read remote file: ${err}\r\n`);
                            });
                        } else {
                            // Local file via direct filesystem access
                            invoke<string>('read_file_tool', {
                                path: filePath,
                                maxBytes,
                            }).then((content) => {
                                addContextItemWithScan?.(content, 'file', {
                                    path: filePath,
                                    sizeKb: Math.round(content.length / 1024),
                                    source: 'local',
                                }).catch((err) => {
                                    log.error('Failed to add local file to context', err);
                                    term.write(`\r\naiterm_add: Failed to add file to context: ${err}\r\n`);
                                });
                            }).catch((err) => {
                                log.error('Failed to read local file', err);
                                term.write(`\r\naiterm_add: Failed to read file: ${err}\r\n`);
                            });
                        }
                    })
                    .catch((err) => {
                        log.error('Failed to get PTY info', err);
                        term.write(`\r\naiterm_add: Failed to determine session type: ${err}\r\n`);
                    });
            }).catch((err) => {
                log.error('Failed to import invoke', err);
            });
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
