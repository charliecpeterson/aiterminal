import { useEffect, useRef, useState } from 'react';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../context/SettingsContext';
import { useAIContext } from '../context/AIContext';
import { attachScrollbarOverlay } from '../terminal/scrollbarOverlay';
import { attachSelectionMenu } from '../terminal/selectionMenu';
import { createMarkerManager } from '../terminal/markers';
import { attachFileCaptureListener } from '../terminal/fileCapture';
import { attachHostLabelOsc } from '../terminal/hostLabel';
import { useLatencyProbe } from '../terminal/useLatencyProbe';
import { attachTerminalHotkeys } from '../terminal/keyboardShortcuts';
import { attachWindowResize } from '../terminal/resize';
import { useFloatingMenu } from '../terminal/useFloatingMenu';
import { attachAiRunCommandListener } from '../terminal/aiRunCommand';
import { attachPtyDataListener, attachPtyExitListener } from '../terminal/ptyListeners';
import { createSearchController } from '../terminal/search';
import { createTerminalSession } from '../terminal/createTerminalSession';
import { attachCaptureLastListener } from '../terminal/captureLast';
import { applyTerminalAppearance } from '../terminal/appearance';
import { handleTerminalVisibilityChange } from '../terminal/visibility';
import {
    addContextFromCombinedRanges,
    addContextFromRange,
    addSelectionToContext,
    copyCombinedToClipboard,
    copyRangeToClipboard,
    getRangeText,
} from '../terminal/copyContext';

interface TerminalProps {
    id: number;
    visible: boolean;
    onClose: () => void;
}

interface CopyMenuState {
    x: number;
    y: number;
    commandRange: [number, number];
    outputRange: [number, number] | null;
    disabled?: boolean;
    outputDisabled?: boolean;
}

interface SelectionMenuState {
    x: number;
    y: number;
}

const Terminal = ({ id, visible, onClose }: TerminalProps) => {
  const { settings, loading } = useSettings();
  const { addContextItem } = useAIContext();
  const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<import('@xterm/xterm').Terminal | null>(null);
    const fitAddonRef = useRef<import('@xterm/addon-fit').FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showSearch, setShowSearch] = useState(false);
    const [hostLabel, setHostLabel] = useState('Local');
        const { latencyMs, latencyAt } = useLatencyProbe(10000);
    const [copyMenu, setCopyMenu] = useState<CopyMenuState | null>(null);
    const copyMenuRef = useRef<HTMLDivElement | null>(null);
    const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null);
    const selectionMenuRef = useRef<HTMLDivElement | null>(null);
    const selectionPointRef = useRef<{ x: number; y: number } | null>(null);
    const pendingFileCaptureRef = useRef<null | { path: string; maxBytes: number }>(null);

    const hideCopyMenu = () => setCopyMenu(null);
    const hideSelectionMenu = () => setSelectionMenu(null);
    const copyRange = async (range: [number, number]) => {
        if (!xtermRef.current) return;
        await copyRangeToClipboard(xtermRef.current, range);
        hideCopyMenu();
        xtermRef.current.focus();
    };

    const copyCombined = async (commandRange: [number, number], outputRange: [number, number]) => {
        if (!xtermRef.current) return;
        await copyCombinedToClipboard(xtermRef.current, commandRange, outputRange);
        hideCopyMenu();
        xtermRef.current.focus();
    };

    const addContextFromLineRange = (type: 'command' | 'output' | 'selection', range: [number, number]) => {
        if (!xtermRef.current) return;
        addContextFromRange({
            term: xtermRef.current,
            type,
            range,
            addContextItem,
        });
        hideCopyMenu();
        xtermRef.current.focus();
    };

    const addContextFromCombined = (commandRange: [number, number], outputRange: [number, number]) => {
        if (!xtermRef.current) return;
        addContextFromCombinedRanges({
            term: xtermRef.current,
            commandRange,
            outputRange,
            addContextItem,
        });
        hideCopyMenu();
        xtermRef.current.focus();
    };

    const addSelection = () => {
        if (!xtermRef.current) return;
        addSelectionToContext({ term: xtermRef.current, addContextItem });
        hideSelectionMenu();
        xtermRef.current.focus();
    };

    const search = createSearchController({
        searchAddonRef,
        searchInputRef,
        setShowSearch,
        focusTerminal: () => xtermRef.current?.focus(),
    });
  
  // Update terminal options when settings change
  useEffect(() => {
      if (xtermRef.current && settings) {
          applyTerminalAppearance({
              term: xtermRef.current,
              appearance: settings.appearance,
              fitAddon: fitAddonRef.current,
          });
      }
  }, [settings]);

  const visibleRef = useRef(visible);
  useEffect(() => {
      handleTerminalVisibilityChange({
          id,
          visible,
          visibleRef,
          termRef: xtermRef,
          fitAddonRef,
      });
  }, [visible, id]);

  useEffect(() => {
    if (!terminalRef.current || loading || !settings) return;

        const session = createTerminalSession({
                container: terminalRef.current,
                appearance: settings.appearance,
        });

        const term = session.term;
        const fitAddon = session.fitAddon;
        fitAddonRef.current = fitAddon;
        searchAddonRef.current = session.searchAddon;
        xtermRef.current = term;

    // Custom always-visible scrollbar overlay synced to xterm viewport
    const scrollbar = attachScrollbarOverlay(terminalRef.current, term.element ?? null);


        // Listen for data from PTY
        const ptyDataListener = attachPtyDataListener({
                id,
                onData: (data) => term.write(data),
        });

    // Focus terminal
    setTimeout(() => {
        term.focus();
    }, 100);

    const selectionMenuHandle = attachSelectionMenu({
        term,
        container: terminalRef.current,
        selectionPointRef,
        setSelectionMenu,
    });

    const markerManager = createMarkerManager({
        term,
        maxMarkers: settings?.terminal?.max_markers ?? 200,
        setCopyMenu,
        getRangeText: (range) => getRangeText(term, range),
        addContextItem,
        pendingFileCaptureRef,
    });

    const markerManagerRef = { current: markerManager };

    const hostLabelHandle = attachHostLabelOsc(term, setHostLabel);

    // Send data to PTY
        const onDataDisposable = term.onData((data) => {
      invoke('write_to_pty', { id, data });
    });

    const windowResize = attachWindowResize({ id, term, fitAddon, visibleRef });

    const hotkeys = attachTerminalHotkeys({
        term,
        fitAddon,
        visibleRef,
        setShowSearch,
        hideCopyMenu,
        hideSelectionMenu,
        resizePty: (rows, cols) => invoke('resize_pty', { id, rows, cols }),
    });
    
    // Initial resize is handled by attachWindowResize

    const captureLastListener = attachCaptureLastListener({
        visibleRef,
        markerManagerRef,
    });

    const fileCaptureListener = attachFileCaptureListener({
        id,
        visibleRef,
        pendingFileCaptureRef,
        focusTerminal: () => xtermRef.current?.focus(),
    });

      return () => {
    session.cleanup();
            selectionMenuHandle.cleanup();
            scrollbar.cleanup();
        markerManager.cleanup();
        onDataDisposable?.dispose?.();
        hostLabelHandle.cleanup();
    ptyDataListener.cleanup();
    windowResize.cleanup();
            hotkeys.cleanup();
            fileCaptureListener.cleanup();
    captureLastListener.cleanup();
      hideCopyMenu();
      hideSelectionMenu();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading]); // Only re-run if ID changes or loading finishes. onClose is handled via ref.

  // Keep onClose ref up to date
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

  useEffect(() => {
      const handle = attachAiRunCommandListener({
          id,
          visibleRef,
          focusTerminal: () => xtermRef.current?.focus(),
      });
      return () => handle.cleanup();
  }, [id]);

  useFloatingMenu(copyMenu, setCopyMenu, copyMenuRef);
  useFloatingMenu(selectionMenu, setSelectionMenu, selectionMenuRef);

  if (loading) return null;

  return (
        <div className="terminal-shell">
        {showSearch && (
            <div className="search-bar">
                <input 
                    ref={searchInputRef}
                    type="text" 
                    placeholder="Find..." 
                    autoFocus
                    onChange={search.onChange}
                    onKeyDown={search.onKeyDown}
                />
                <button onClick={search.findPrevious}>↑</button>
                <button onClick={search.findNext}>↓</button>
                <button onClick={search.close}>✕</button>
            </div>
        )}
            <div className="terminal-body" ref={terminalRef} />
            {copyMenu && (
                <div
                    className="marker-copy-menu"
                    style={{ top: copyMenu.y, left: copyMenu.x }}
                    ref={copyMenuRef}
                >
                    <button disabled={copyMenu.disabled} onClick={() => copyRange(copyMenu.commandRange)}>
                        Copy Command
                    </button>
                    <button
                        disabled={copyMenu.disabled || copyMenu.outputDisabled || !copyMenu.outputRange}
                        onClick={() =>
                            copyMenu.outputRange &&
                            copyCombined(copyMenu.commandRange, copyMenu.outputRange)
                        }
                    >
                        Copy Command + Output
                    </button>
                    <button
                        disabled={copyMenu.disabled || copyMenu.outputDisabled || !copyMenu.outputRange}
                        onClick={() => copyMenu.outputRange && copyRange(copyMenu.outputRange)}
                    >
                        Copy Output
                    </button>
                    <div className="marker-copy-divider" />
                    <button
                        disabled={copyMenu.disabled}
                        onClick={() => addContextFromLineRange('command', copyMenu.commandRange)}
                    >
                        Add Command to Context
                    </button>
                    <button
                        disabled={copyMenu.disabled || copyMenu.outputDisabled || !copyMenu.outputRange}
                        onClick={() =>
                            copyMenu.outputRange &&
                            addContextFromCombined(copyMenu.commandRange, copyMenu.outputRange)
                        }
                    >
                        Add Command + Output
                    </button>
                    <button
                        disabled={copyMenu.disabled || copyMenu.outputDisabled || !copyMenu.outputRange}
                        onClick={() =>
                            copyMenu.outputRange &&
                            addContextFromLineRange('output', copyMenu.outputRange)
                        }
                    >
                        Add Output to Context
                    </button>
                </div>
            )}
            {selectionMenu && (
                <div
                    className="selection-badge"
                    style={{ top: selectionMenu.y, left: selectionMenu.x }}
                    ref={selectionMenuRef}
                >
                    <button onClick={addSelection}>+ Context</button>
                </div>
            )}
            <div className="terminal-status">
                <div className="status-host" title={hostLabel}>
                    <span className="status-dot" />
                    <span className="status-text">{hostLabel}</span>
                </div>
                <div className="status-latency" title={latencyAt ? `Last checked ${new Date(latencyAt).toLocaleTimeString()}` : 'Latency probe'}>
                    <span className={`latency-pill ${latencyMs == null ? 'latency-unknown' : latencyMs < 80 ? 'latency-good' : latencyMs < 200 ? 'latency-warn' : 'latency-bad'}`}>
                        {latencyMs == null ? 'Latency: —' : `Latency: ${latencyMs} ms`}
                    </span>
                </div>
            </div>
    </div>
  );
};

export default Terminal;
