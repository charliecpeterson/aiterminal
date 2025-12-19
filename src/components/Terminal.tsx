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
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [latencyAt, setLatencyAt] = useState<number | null>(null);
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

    const shellQuote = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`;

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

    let currentMarker: any = null;
    const markers: any[] = [];
    const markerMeta = new WeakMap<any, { outputStartMarker?: any; isBootstrap?: boolean }>();
    const maxMarkers = settings?.terminal?.max_markers ?? 200;

    const removeMarker = (marker: any) => {
        const index = markers.indexOf(marker);
        if (index !== -1) {
            markers.splice(index, 1);
        }
        const meta = markerMeta.get(marker);
        if (meta?.outputStartMarker?.dispose) {
            meta.outputStartMarker.dispose();
        }
        markerMeta.delete(marker);
    };

    const setupMarkerElement = (marker: any, element: HTMLElement, exitCode?: number) => {
        element.classList.add('terminal-marker');
        element.style.cursor = 'pointer';
        element.title = 'Click to copy';
        
        if (exitCode !== undefined) {
            if (exitCode === 0) {
                element.classList.add('success');
            } else {
                element.classList.add('error');
            }
        }

        // Prevent duplicate listeners if onRender is called multiple times
        if (element.dataset.listenerAttached) return;
        element.dataset.listenerAttached = 'true';

        element.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent other clicks
            
            const startLine = marker.marker.line;
            let endLine = term.buffer.active.length - 1;
            
            // Find next marker to define range
            const index = markers.indexOf(marker);
            if (index !== -1 && index < markers.length - 1) {
                endLine = markers[index + 1].marker.line - 1;
            }

            const meta = markerMeta.get(marker);
            const outputStartLine = meta?.outputStartMarker?.line ?? null;
            const hasOutput = outputStartLine !== null && outputStartLine > startLine && outputStartLine <= endLine;
            const safeOutputStart = hasOutput ? Math.max(outputStartLine, startLine + 1) : startLine + 1;
            const cmdEnd = Math.max(startLine, (hasOutput ? safeOutputStart : startLine + 1) - 1);

            const rect = element.getBoundingClientRect();
            const isBootstrapMarker = Boolean(meta?.isBootstrap);
            setCopyMenu({
                x: rect.right + 8,
                y: rect.top - 4,
                commandRange: [startLine, cmdEnd],
                outputRange: hasOutput ? [safeOutputStart, Math.max(safeOutputStart, endLine)] : null,
                disabled: isBootstrapMarker,
                outputDisabled: !hasOutput || isBootstrapMarker,
            });
        });
    };

    term.parser.registerOscHandler(133, (data) => {
        try {
            const parts = data.split(';');
            const type = parts[0];

            if (type === 'A') {
                // Prompt Start - Create Marker
                const marker = term.registerDecoration({
                    marker: term.registerMarker(0),
                    x: 0, // Anchor to first column
                    width: 1,
                    height: 1,
                });
                
                if (marker) {
                    marker.onRender((element) => setupMarkerElement(marker, element));
                    marker.onDispose?.(() => removeMarker(marker));
                    currentMarker = marker;
                    markers.push(marker);
                    markerMeta.set(marker, { isBootstrap: marker.marker.line <= 1 });
                    if (markers.length > maxMarkers) {
                        const oldest = markers[0];
                        removeMarker(oldest);
                        oldest?.dispose?.();
                    }
                }
            } else if (type === 'C') {
                 // Command Output Start
                 // Only set if not already set for this marker (First 'C' wins)
                 if (!currentMarker) {
                    const marker = term.registerDecoration({
                        marker: term.registerMarker(-1),
                        x: 0,
                        width: 1,
                        height: 1,
                    });
                     if (marker) {
                         marker.onRender((element) => setupMarkerElement(marker, element));
                         marker.onDispose?.(() => removeMarker(marker));
                         currentMarker = marker;
                         markers.push(marker);
                         markerMeta.set(marker, { isBootstrap: marker.marker.line <= 1 });
                         if (markers.length > maxMarkers) {
                             const oldest = markers[0];
                             removeMarker(oldest);
                             oldest?.dispose?.();
                         }
                     }
                 }
                 if (currentMarker) {
                     const meta = markerMeta.get(currentMarker) || {};
                     if (!meta.outputStartMarker) {
                         meta.outputStartMarker = term.registerMarker(0);
                         markerMeta.set(currentMarker, meta);
                     }
                 }
            } else if (type === 'D') {
                // Command Finished
                const exitCode = parseInt(parts[1] || '0');
                if (currentMarker) {
                    currentMarker.onRender((element: HTMLElement) => setupMarkerElement(currentMarker, element, exitCode));
                    if (pendingFileCaptureRef.current) {
                        const { path, maxBytes } = pendingFileCaptureRef.current;
                        const startLine = currentMarker.marker.line;
                        let endLine = term.buffer.active.length - 1;
                        const markerIndex = markers.indexOf(currentMarker);
                        if (markerIndex !== -1 && markerIndex < markers.length - 1) {
                            endLine = markers[markerIndex + 1].marker.line - 1;
                        }
                        const meta = markerMeta.get(currentMarker);
                        const outputStartLine = meta?.outputStartMarker?.line ?? null;
                        const hasOutput =
                            outputStartLine !== null &&
                            outputStartLine > startLine &&
                            outputStartLine <= endLine;
                        if (hasOutput) {
                            const safeOutputStart = Math.max(outputStartLine, startLine + 1);
                            const outputText = getRangeText([
                                safeOutputStart,
                                Math.max(safeOutputStart, endLine),
                            ]).trim();
                            if (outputText) {
                                addContextItem({
                                    id: crypto.randomUUID(),
                                    type: 'file',
                                    content: outputText,
                                    timestamp: Date.now(),
                                    metadata: {
                                        path,
                                        truncated: outputText.length >= maxBytes,
                                        byte_count: outputText.length,
                                    },
                                });
                            }
                        }
                        pendingFileCaptureRef.current = null;
                    }
                    // Clear currentMarker so subsequent 'C' events (e.g. from PROMPT_COMMAND) don't overwrite our output start
                    currentMarker = null;
                }
            }
        } catch (e) {
            console.error('Error handling OSC 133:', e);
        }
        return true;
    });

    term.parser.registerOscHandler(633, (data) => {
        // Custom: 633;H;hostname
        try {
            const parts = data.split(';');
            if (parts[0] === 'H' && parts[1]) {
                setHostLabel(parts.slice(1).join(';'));
            }
        } catch (e) {
            console.error('Error handling OSC 633:', e);
        }
        return true;
    });

    // Send data to PTY
    term.onData((data) => {
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

    // Handle Zoom and Search
    const handleKeydown = (e: KeyboardEvent) => {
        if (!visibleRef.current) return; // Only handle keys if visible

        if (e.metaKey || e.ctrlKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                const newSize = (term.options.fontSize || 14) + 1;
                term.options.fontSize = newSize;
                fitAddon.fit();
                invoke('resize_pty', { id, rows: term.rows, cols: term.cols });
            } else if (e.key === '-') {
                e.preventDefault();
                const newSize = Math.max(6, (term.options.fontSize || 14) - 1);
                term.options.fontSize = newSize;
                fitAddon.fit();
                invoke('resize_pty', { id, rows: term.rows, cols: term.cols });
            } else if (e.key === '0') {
                e.preventDefault();
                term.options.fontSize = 14;
                fitAddon.fit();
                invoke('resize_pty', { id, rows: term.rows, cols: term.cols });
            } else if (e.key === 'f') {
                e.preventDefault();
                setShowSearch(prev => !prev);
            }
        }
        // Hide search on Escape
        if (e.key === 'Escape') {
            setShowSearch(false);
            hideCopyMenu();
            term.focus();
        }
    };
    window.addEventListener('keydown', handleKeydown);
    
    // Initial resize
    setTimeout(handleResize, 100); // Delay slightly to ensure container is ready

    const unlistenCapturePromise = listen<{ count: number }>('ai-context:capture-last', (event) => {
        if (!visibleRef.current) return;
        const count = Math.max(1, Math.min(50, event.payload.count || 1));
        if (!xtermRef.current || markers.length === 0) return;
        const eligibleMarkers = markers.filter((marker) => {
            const meta = markerMeta.get(marker);
            return Boolean(meta?.outputStartMarker);
        });
        const slice = eligibleMarkers.slice(-count);
        slice.forEach((marker, index) => {
            const startLine = marker.marker.line;
            let endLine = term.buffer.active.length - 1;
            const markerIndex = eligibleMarkers.indexOf(marker);
            if (markerIndex !== -1 && markerIndex < eligibleMarkers.length - 1) {
                endLine = eligibleMarkers[markerIndex + 1].marker.line - 1;
            }
            const meta = markerMeta.get(marker);
            const outputStartLine = meta?.outputStartMarker?.line ?? null;
            const hasOutput = outputStartLine !== null && outputStartLine > startLine && outputStartLine <= endLine;
            const safeOutputStart = hasOutput ? Math.max(outputStartLine, startLine + 1) : startLine + 1;
            const cmdEnd = Math.max(startLine, (hasOutput ? safeOutputStart : startLine + 1) - 1);
            const commandText = getRangeText([startLine, cmdEnd]).trim();
            const outputText = hasOutput ? getRangeText([safeOutputStart, Math.max(safeOutputStart, endLine)]).trim() : "";
            if (!commandText && !outputText) return;
            if (outputText) {
                addContextItem({
                    id: crypto.randomUUID(),
                    type: 'command_output',
                    content: outputText,
                    timestamp: Date.now() + index,
                    metadata: {
                        command: commandText || undefined,
                        output: outputText,
                    },
                });
            } else if (commandText) {
                addContextItem({
                    id: crypto.randomUUID(),
                    type: 'command',
                    content: commandText,
                    timestamp: Date.now() + index,
                });
            }
        });
    });

    const unlistenCaptureFilePromise = listen<{ path: string; maxBytes: number }>(
        'ai-context:capture-file',
        (event) => {
            if (!visibleRef.current) return;
            if (!xtermRef.current) return;
            const path = event.payload.path?.trim();
            const maxBytes = Math.max(1024, Math.min(2 * 1024 * 1024, event.payload.maxBytes || 0));
            if (!path || !maxBytes) return;
            pendingFileCaptureRef.current = { path, maxBytes };
            const command = `HISTCONTROL=ignorespace HIST_IGNORE_SPACE=1 head -c ${maxBytes} ${shellQuote(path)}`;
            invoke('write_to_pty', { id, data: ` ${command}\n` });
            xtermRef.current.focus();
        }
    );

      return () => {
      term.dispose();
            selectionMenuHandle.cleanup();
            scrollbar.cleanup();
      unlistenDataPromise.then(f => f());
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeydown);
      unlistenCaptureFilePromise.then(f => f());
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

  // Latency probe to backend invoke (app RTT)
  useEffect(() => {
      let cancelled = false;
      const measure = async () => {
          const start = performance.now();
          try {
              await invoke('ping');
              if (cancelled) return;
              setLatencyMs(Math.round(performance.now() - start));
              setLatencyAt(Date.now());
          } catch (e) {
              if (cancelled) return;
              setLatencyMs(null);
              setLatencyAt(Date.now());
          }
      };

      measure();
      const id = setInterval(measure, 10000);
      return () => {
          cancelled = true;
          clearInterval(id);
      };
  }, []);

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
