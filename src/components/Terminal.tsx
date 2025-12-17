import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { ask } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const Terminal = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
      },
      allowProposedApi: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    try {
        const webglAddon = new WebglAddon();
        term.loadAddon(webglAddon);
    } catch (e) {
        console.warn("WebGL addon failed to load", e);
    }

    term.open(terminalRef.current);
    fitAddon.fit();
    xtermRef.current = term;

    // Spawn PTY
    invoke('spawn_pty');

    // Source the shell integration script (Safe Injection)
    setTimeout(() => {
        // Source the config file we created in the backend
        const sourceCommand = 'source ~/.config/aiterminal/bash_init.sh\r';
        invoke('write_to_pty', { data: sourceCommand });
        term.focus();
    }, 1000); // Wait 1s for shell to be fully ready

    // Listen for data from PTY
    const unlistenPromise = listen<string>('pty-data', (event) => {
      term.write(event.payload);
    });

    // Focus terminal
    setTimeout(() => {
        term.focus();
    }, 100);

    let currentMarker: any = null;
    const markers: any[] = [];
    const markerOutputStarts = new Map<any, number>();

    const setupMarkerElement = (marker: any, element: HTMLElement, exitCode?: number) => {
        element.classList.add('terminal-marker');
        element.style.cursor = 'pointer';
        element.title = 'Click to copy command output';
        
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

        element.addEventListener('mousedown', async (e) => {
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
            
            // Simple Context Menu Logic (Native confirm for now to test)
            const choice = await ask(
                "Copy Options:",
                {
                    title: "Copy",
                    kind: 'info',
                    okLabel: 'Copy Command Only',
                    cancelLabel: 'Copy Output Only'
                }
            );

            if (choice) {
                // Copy Command (Start -> Output Start)
                const cmdEnd = Math.max(startLine, outputStartLine - 1);
                term.selectLines(startLine, cmdEnd);
            } else {
                // Copy Output (Output Start -> End)
                term.selectLines(outputStartLine, endLine);
            }

            const text = term.getSelection();
            console.log('Copying text:', text);
            try {
                await writeText(text);
                console.log('Text copied to clipboard via Tauri plugin');
            } catch (err) {
                console.error('Failed to copy:', err);
            }
            term.clearSelection();
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

    // Listen for data from PTY
    // const unlistenPromise = listen<string>('pty-data', (event) => {
    //   term.write(event.payload);
    // });

    // Send data to PTY
    term.onData((data) => {
      invoke('write_to_pty', { data });
    });

    // Handle resize
    const handleResize = () => {
        fitAddon.fit();
        invoke('resize_pty', { rows: term.rows, cols: term.cols });
    };
    window.addEventListener('resize', handleResize);

    // Handle Zoom
    const handleZoom = (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey) {
            if (e.key === '=' || e.key === '+') {
                e.preventDefault();
                const newSize = (term.options.fontSize || 14) + 1;
                term.options.fontSize = newSize;
                fitAddon.fit();
                invoke('resize_pty', { rows: term.rows, cols: term.cols });
            } else if (e.key === '-') {
                e.preventDefault();
                const newSize = Math.max(6, (term.options.fontSize || 14) - 1);
                term.options.fontSize = newSize;
                fitAddon.fit();
                invoke('resize_pty', { rows: term.rows, cols: term.cols });
            } else if (e.key === '0') {
                e.preventDefault();
                term.options.fontSize = 14;
                fitAddon.fit();
                invoke('resize_pty', { rows: term.rows, cols: term.cols });
            }
        }
    };
    window.addEventListener('keydown', handleZoom);
    
    // Initial resize
    setTimeout(handleResize, 100); // Delay slightly to ensure container is ready

    return () => {
      term.dispose();
      unlistenPromise.then(f => f());
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleZoom);
    };
  }, []);

  return <div ref={terminalRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', paddingLeft: '15px' }} />;
};

export default Terminal;
