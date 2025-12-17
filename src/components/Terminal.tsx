import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
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
                    marker.onRender((element) => {
                        element.classList.add('terminal-marker');
                        element.style.cursor = 'pointer';
                        element.title = 'Click to copy command output';
                        
                        element.addEventListener('click', () => {
                            const startLine = marker.marker.line;
                            let endLine = term.buffer.active.length - 1;
                            
                            // Find next marker to define range
                            const index = markers.indexOf(marker);
                            if (index !== -1 && index < markers.length - 1) {
                                endLine = markers[index + 1].marker.line - 1;
                            }

                            // Select and copy
                            console.log(`Copying lines ${startLine} to ${endLine}`);
                            term.selectLines(startLine, endLine);
                            const text = term.getSelection();
                            navigator.clipboard.writeText(text).then(() => {
                                // Visual feedback
                                element.style.backgroundColor = '#fff';
                                setTimeout(() => {
                                    element.style.backgroundColor = ''; // Revert to class style
                                }, 200);
                            });
                            term.clearSelection();
                        });
                    });
                    currentMarker = marker;
                    markers.push(marker);
                }
            } else if (type === 'C') {
                 // Command Output Start - We could mark this to separate command from output
            } else if (type === 'D') {
                // Command Finished
                const exitCode = parseInt(parts[1] || '0');
                if (currentMarker) {
                    currentMarker.onRender((element: HTMLElement) => {
                        // Keep the base class so it stays visible
                        if (exitCode === 0) {
                            element.classList.add('success');
                        } else {
                            element.classList.add('error');
                        }
                    });
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
    
    // Initial resize
    setTimeout(handleResize, 100); // Delay slightly to ensure container is ready

    return () => {
      term.dispose();
      unlistenPromise.then(f => f());
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return <div ref={terminalRef} style={{ width: '100%', height: '100vh', overflow: 'hidden', paddingLeft: '15px' }} />;
};

export default Terminal;
