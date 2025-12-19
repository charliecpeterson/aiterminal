import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSettings } from '../context/SettingsContext';
import { useAIContext } from '../context/AIContext';
import { attachScrollbarOverlay } from '../terminal/scrollbarOverlay';
import { attachSelectionMenu } from '../terminal/selectionMenu';
import { createMarkerManager } from '../terminal/markers';
import { attachFileCaptureListener } from '../terminal/fileCapture';
import { attachHostLabelOsc } from '../terminal/hostLabel';
import { useLatencyProbe } from '../terminal/useLatencyProbe';
import { attachTerminalHotkeys } from '../terminal/keyboardShortcuts';

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
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
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
        const [start, end] = range;
        const safeStart = Math.max(0, start);
        const safeEnd = Math.max(safeStart, end);
        xtermRef.current.selectLines(safeStart, safeEnd);
        const text = xtermRef.current.getSelection();
        try {
            await writeText(text);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
        xtermRef.current.clearSelection();
        hideCopyMenu();
        xtermRef.current.focus();
    };

    const getRangeText = (range: [number, number]) => {
        if (!xtermRef.current) return '';
        const [start, end] = range;
        const safeStart = Math.max(0, start);
        const safeEnd = Math.max(safeStart, end);
        xtermRef.current.selectLines(safeStart, safeEnd);
        const text = xtermRef.current.getSelection();
        xtermRef.current.clearSelection();
        return text;
    };

    const copyCombined = async (commandRange: [number, number], outputRange: [number, number]) => {
        const start = Math.min(commandRange[0], outputRange[0]);
        const end = Math.max(commandRange[1], outputRange[1]);
        await copyRange([start, end]);
    };

    const addContextFromRange = (type: 'command' | 'output' | 'selection', range: [number, number]) => {
        const content = getRangeText(range).trim();
        if (!content) return;
        addContextItem({
            id: crypto.randomUUID(),
            type,
            content,
            timestamp: Date.now(),
        });
        hideCopyMenu();
        xtermRef.current?.focus();
    };

    const addContextFromCombined = (commandRange: [number, number], outputRange: [number, number]) => {
        const command = getRangeText(commandRange).trim();
        const output = getRangeText(outputRange).trim();
        if (!command && !output) return;
        addContextItem({
            id: crypto.randomUUID(),
            type: 'command_output',
            content: output || command,
            timestamp: Date.now(),
            metadata: {
                command: command || undefined,
                output: output || undefined,
            },
        });
        hideCopyMenu();
        xtermRef.current?.focus();
    };

    const addSelectionToContext = () => {
        if (!xtermRef.current) return;
        const text = xtermRef.current.getSelection().trim();
        if (!text) return;
        addContextItem({
            id: crypto.randomUUID(),
            type: 'selection',
            content: text,
            timestamp: Date.now(),
        });
        xtermRef.current.clearSelection();
        hideSelectionMenu();
        xtermRef.current.focus();
    };
  
  // Update terminal options when settings change
  useEffect(() => {
      if (xtermRef.current && settings) {
          xtermRef.current.options.fontSize = settings.appearance.font_size;
          xtermRef.current.options.fontFamily = settings.appearance.font_family;
          xtermRef.current.options.theme = {
              ...xtermRef.current.options.theme,
              background: settings.appearance.theme === 'light' ? '#ffffff' : '#1e1e1e',
              foreground: settings.appearance.theme === 'light' ? '#000000' : '#ffffff',
              cursor: settings.appearance.theme === 'light' ? '#000000' : '#ffffff',
          };
          fitAddonRef.current?.fit();
      }
  }, [settings]);

  const visibleRef = useRef(visible);
  useEffect(() => {
      visibleRef.current = visible;
      if (visible && fitAddonRef.current && xtermRef.current) {
          requestAnimationFrame(() => {
              fitAddonRef.current?.fit();
              if (xtermRef.current) {
                  invoke('resize_pty', { id, rows: xtermRef.current.rows, cols: xtermRef.current.cols });
                  xtermRef.current.focus();
              }
          });
      }
  }, [visible, id]);

  useEffect(() => {
    if (!terminalRef.current || loading || !settings) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: settings.appearance.theme === 'light' ? '#ffffff' : '#1e1e1e',
        foreground: settings.appearance.theme === 'light' ? '#000000' : '#ffffff',
        cursor: settings.appearance.theme === 'light' ? '#000000' : '#ffffff',
      },
      allowProposedApi: true,
      fontFamily: settings.appearance.font_family,
      fontSize: settings.appearance.font_size,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;
    
    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;
    
    term.loadAddon(new WebLinksAddon());

    try {
        const webglAddon = new WebglAddon();
        term.loadAddon(webglAddon);
    } catch (e) {
        console.warn("WebGL addon failed to load", e);
    }

    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    // Custom always-visible scrollbar overlay synced to xterm viewport
    const scrollbar = attachScrollbarOverlay(terminalRef.current, term.element ?? null);


    // Listen for data from PTY
    const unlistenDataPromise = listen<string>(`pty-data:${id}`, (event) => {
      term.write(event.payload);
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
        getRangeText,
        addContextItem,
        pendingFileCaptureRef,
    });

    const hostLabelHandle = attachHostLabelOsc(term, setHostLabel);

    // Send data to PTY
        const onDataDisposable = term.onData((data) => {
      invoke('write_to_pty', { id, data });
    });

    // Handle resize
    const handleResize = () => {
        if (visibleRef.current) {
            fitAddon.fit();
            invoke('resize_pty', { id, rows: term.rows, cols: term.cols });
        }
    };
    window.addEventListener('resize', handleResize);

    const hotkeys = attachTerminalHotkeys({
        term,
        fitAddon,
        visibleRef,
        setShowSearch,
        hideCopyMenu,
        hideSelectionMenu,
        resizePty: (rows, cols) => invoke('resize_pty', { id, rows, cols }),
    });
    
    // Initial resize
    setTimeout(handleResize, 100); // Delay slightly to ensure container is ready

    const unlistenCapturePromise = listen<{ count: number }>('ai-context:capture-last', (event) => {
        if (!visibleRef.current) return;
        const count = Math.max(1, Math.min(50, event.payload.count || 1));
        if (!xtermRef.current) return;
        markerManager.captureLast(count);
    });

    const fileCaptureListener = attachFileCaptureListener({
        id,
        visibleRef,
        pendingFileCaptureRef,
        focusTerminal: () => xtermRef.current?.focus(),
    });

      return () => {
      term.dispose();
            selectionMenuHandle.cleanup();
            scrollbar.cleanup();
        markerManager.cleanup();
        onDataDisposable?.dispose?.();
        hostLabelHandle.cleanup();
      unlistenDataPromise.then(f => f());
      window.removeEventListener('resize', handleResize);
            hotkeys.cleanup();
            fileCaptureListener.cleanup();
      unlistenCapturePromise.then(f => f());
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

  // Update the listener to use the ref
  useEffect(() => {
      const unlistenExitPromise = listen<void>(`pty-exit:${id}`, () => {
          onCloseRef.current();
      });
      return () => {
          unlistenExitPromise.then(f => f());
      };
  }, [id]);

  useEffect(() => {
      const unlistenRunPromise = listen<{ command: string }>('ai-run-command', (event) => {
          if (!visibleRef.current) return;
          const command = event.payload.command;
          if (!command || !xtermRef.current) return;
          invoke('write_to_pty', { id, data: `${command}\n` });
          xtermRef.current.focus();
      });
      return () => {
          unlistenRunPromise.then(f => f());
      };
  }, [id]);

    useEffect(() => {
        if (!copyMenu) return;
        const clampMenuPosition = () => {
            if (!copyMenuRef.current) return;
          const menuRect = copyMenuRef.current.getBoundingClientRect();
          const margin = 8;
          const maxX = window.innerWidth - menuRect.width - margin;
          const maxY = window.innerHeight - menuRect.height - margin;
          const nextX = Math.min(Math.max(margin, copyMenu.x), Math.max(margin, maxX));
          const nextY = Math.min(Math.max(margin, copyMenu.y), Math.max(margin, maxY));
          if (nextX !== copyMenu.x || nextY !== copyMenu.y) {
              setCopyMenu(prev => prev ? { ...prev, x: nextX, y: nextY } : prev);
          }
      };
      requestAnimationFrame(clampMenuPosition);
      const handleGlobalMouseDown = (event: MouseEvent) => {
          if (!copyMenuRef.current) return;
          if (!copyMenuRef.current.contains(event.target as Node)) {
              hideCopyMenu();
          }
      };
      window.addEventListener('mousedown', handleGlobalMouseDown);
      return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, [copyMenu]);

  useEffect(() => {
      if (!selectionMenu) return;
      const clampMenuPosition = () => {
          if (!selectionMenuRef.current) return;
          const menuRect = selectionMenuRef.current.getBoundingClientRect();
          const margin = 8;
          const maxX = window.innerWidth - menuRect.width - margin;
          const maxY = window.innerHeight - menuRect.height - margin;
          const nextX = Math.min(Math.max(margin, selectionMenu.x), Math.max(margin, maxX));
          const nextY = Math.min(Math.max(margin, selectionMenu.y), Math.max(margin, maxY));
          if (nextX !== selectionMenu.x || nextY !== selectionMenu.y) {
              setSelectionMenu(prev => prev ? { ...prev, x: nextX, y: nextY } : prev);
          }
      };
      requestAnimationFrame(clampMenuPosition);
      const handleGlobalMouseDown = (event: MouseEvent) => {
          if (!selectionMenuRef.current) return;
          if (!selectionMenuRef.current.contains(event.target as Node)) {
              hideSelectionMenu();
          }
      };
      window.addEventListener('mousedown', handleGlobalMouseDown);
      return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, [selectionMenu]);

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
                    onChange={(e) => {
                        searchAddonRef.current?.findNext(e.target.value, { incremental: true });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            if (e.shiftKey) {
                                searchAddonRef.current?.findPrevious((e.target as HTMLInputElement).value);
                            } else {
                                searchAddonRef.current?.findNext((e.target as HTMLInputElement).value);
                            }
                        }
                    }}
                />
                <button onClick={() => {
                    const value = searchInputRef.current?.value ?? '';
                    if (value) searchAddonRef.current?.findPrevious(value);
                }}>↑</button>
                <button onClick={() => {
                    const value = searchInputRef.current?.value ?? '';
                    if (value) searchAddonRef.current?.findNext(value);
                }}>↓</button>
                <button onClick={() => {
                    setShowSearch(false);
                    xtermRef.current?.focus();
                }}>✕</button>
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
                        onClick={() => addContextFromRange('command', copyMenu.commandRange)}
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
                            addContextFromRange('output', copyMenu.outputRange)
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
                    <button onClick={addSelectionToContext}>+ Context</button>
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
