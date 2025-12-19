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

interface TerminalProps {
    id: number;
    visible: boolean;
    onClose: () => void;
}

interface CopyMenuState {
    x: number;
    y: number;
    commandRange: [number, number];
    outputRange: [number, number];
}

const Terminal = ({ id, visible, onClose }: TerminalProps) => {
  const { settings, loading } = useSettings();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [showSearch, setShowSearch] = useState(false);
    const [hostLabel, setHostLabel] = useState('Local');
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [latencyAt, setLatencyAt] = useState<number | null>(null);
    const [copyMenu, setCopyMenu] = useState<CopyMenuState | null>(null);
    const copyMenuRef = useRef<HTMLDivElement | null>(null);

    const hideCopyMenu = () => setCopyMenu(null);
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
    const viewport = term.element?.querySelector('.xterm-viewport') as HTMLElement | null;
    const track = document.createElement('div');
    const thumb = document.createElement('div');
    track.className = 'aiterm-scroll-track';
    thumb.className = 'aiterm-scroll-thumb';
    track.appendChild(thumb);
    terminalRef.current.appendChild(track);

    let lastThumbHeight = 24;
    const maxScroll = () => (viewport ? viewport.scrollHeight - viewport.clientHeight : 0);

    const updateThumb = () => {
        if (!viewport) return;
        const { scrollTop, scrollHeight, clientHeight } = viewport;
        const trackHeight = track.clientHeight || clientHeight;
        const thumbHeight = Math.max(24, (clientHeight / scrollHeight) * trackHeight);
        lastThumbHeight = thumbHeight;
        const maxTop = trackHeight - thumbHeight;
        const top = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * maxTop : 0;
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${top}px)`;
        thumb.style.opacity = scrollHeight > clientHeight ? '1' : '0';
    };

    const scrollToThumbPosition = (clientY: number) => {
        if (!viewport) return;
        const rect = track.getBoundingClientRect();
        const maxTop = rect.height - lastThumbHeight;
        const offset = Math.min(Math.max(clientY - rect.top - lastThumbHeight / 2, 0), Math.max(maxTop, 0));
        const ratio = maxTop > 0 ? offset / maxTop : 0;
        viewport.scrollTop = ratio * maxScroll();
    };

    let dragging = false;
    const onThumbMouseDown = (e: MouseEvent) => {
        dragging = true;
        thumb.classList.add('dragging');
        e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
        if (!dragging) return;
        scrollToThumbPosition(e.clientY);
    };

    const onMouseUp = () => {
        if (!dragging) return;
        dragging = false;
        thumb.classList.remove('dragging');
    };

    const onTrackMouseDown = (e: MouseEvent) => {
        if (e.target === thumb) return; // thumb handler covers drag
        scrollToThumbPosition(e.clientY);
    };

    thumb.addEventListener('mousedown', onThumbMouseDown);
    track.addEventListener('mousedown', onTrackMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    const refreshThumb = () => requestAnimationFrame(updateThumb);
    viewport?.addEventListener('scroll', refreshThumb);
    window.addEventListener('resize', refreshThumb);
    refreshThumb();

    // Source the shell integration script (client-side) so markers/functions are available
    setTimeout(() => {
            const sourceCommand = [
                'stty -echo >/dev/null 2>&1',
                'source ~/.config/aiterminal/bash_init.sh >/dev/null 2>&1',
                'stty echo >/dev/null 2>&1',
                'printf "\\r\\033[K"'
            ].join('; ') + '\r';
        invoke('write_to_pty', { id, data: sourceCommand });
        term.focus();
    }, 600);

    // Listen for data from PTY
    const unlistenDataPromise = listen<string>(`pty-data:${id}`, (event) => {
      term.write(event.payload);
    });

    // Focus terminal
    setTimeout(() => {
        term.focus();
    }, 100);

    let currentMarker: any = null;
    const markers: any[] = [];
    const markerOutputStarts = new Map<any, number>();
    const maxMarkers = settings?.terminal?.max_markers ?? 200;

    const removeMarker = (marker: any) => {
        const index = markers.indexOf(marker);
        if (index !== -1) {
            markers.splice(index, 1);
        }
        markerOutputStarts.delete(marker);
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
            console.log('Marker clicked!');
            
            const startLine = marker.marker.line;
            let endLine = term.buffer.active.length - 1;
            
            // Find next marker to define range
            const index = markers.indexOf(marker);
            if (index !== -1 && index < markers.length - 1) {
                endLine = markers[index + 1].marker.line - 1;
            }

            const outputStartLine = Math.max(
                markerOutputStarts.get(marker) || (startLine + 1),
                startLine + 1
            );
            console.log(`Range: ${startLine} -> ${outputStartLine} -> ${endLine}`);

            const cmdEnd = Math.max(startLine, outputStartLine - 1);
            setCopyMenu({
                x: e.clientX + 8,
                y: e.clientY + 8,
                commandRange: [startLine, cmdEnd],
                outputRange: [outputStartLine, Math.max(outputStartLine, endLine)],
            });
        });
    };

    term.parser.registerOscHandler(133, (data) => {
        try {
            const parts = data.split(';');
            const type = parts[0];

            if (type === 'A') {
                // Prompt Start - Create Marker
                console.log('Creating marker at line', term.buffer.active.baseY + term.buffer.active.cursorY);
                const marker = term.registerDecoration({
                    marker: term.registerMarker(0),
                    x: 0, // Anchor to first column
                    width: 1,
                    height: 1,
                });
                
                if (marker) {
                    marker.onRender((element) => setupMarkerElement(marker, element));
                    currentMarker = marker;
                    markers.push(marker);
                    if (markers.length > maxMarkers) {
                        const oldest = markers[0];
                        removeMarker(oldest);
                        oldest?.dispose?.();
                    }
                }
            } else if (type === 'C') {
                 // Command Output Start
                 // Only set if not already set for this marker (First 'C' wins)
                 if (currentMarker && !markerOutputStarts.has(currentMarker)) {
                     // Store the line number where output starts
                     const outputLine = term.buffer.active.baseY + term.buffer.active.cursorY;
                     markerOutputStarts.set(currentMarker, outputLine);
                     console.log('Output started at line', outputLine);
                 }
            } else if (type === 'D') {
                // Command Finished
                const exitCode = parseInt(parts[1] || '0');
                if (currentMarker) {
                    currentMarker.onRender((element: HTMLElement) => setupMarkerElement(currentMarker, element, exitCode));
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

    return () => {
      term.dispose();
        viewport?.removeEventListener('scroll', refreshThumb);
        window.removeEventListener('resize', refreshThumb);
        thumb.removeEventListener('mousedown', onThumbMouseDown);
        track.removeEventListener('mousedown', onTrackMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        track.remove();
      unlistenDataPromise.then(f => f());
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeydown);
      hideCopyMenu();
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
      if (!copyMenu) return;
      const handleGlobalMouseDown = (event: MouseEvent) => {
          if (!copyMenuRef.current) return;
          if (!copyMenuRef.current.contains(event.target as Node)) {
              hideCopyMenu();
          }
      };
      window.addEventListener('mousedown', handleGlobalMouseDown);
      return () => window.removeEventListener('mousedown', handleGlobalMouseDown);
  }, [copyMenu]);

  if (loading) return null;

  return (
        <div className="terminal-shell">
        {showSearch && (
            <div className="search-bar">
                <input 
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
                    const input = document.querySelector('.search-bar input') as HTMLInputElement;
                    if (input) searchAddonRef.current?.findPrevious(input.value);
                }}>↑</button>
                <button onClick={() => {
                    const input = document.querySelector('.search-bar input') as HTMLInputElement;
                    if (input) searchAddonRef.current?.findNext(input.value);
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
                    <button onClick={() => copyRange(copyMenu.commandRange)}>Copy Command</button>
                    <button onClick={() => copyRange(copyMenu.outputRange)}>Copy Output</button>
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
