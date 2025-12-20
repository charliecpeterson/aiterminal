import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../context/SettingsContext';
import { useAIContext } from '../context/AIContext';
import type { CopyMenuState } from '../terminal/markers';
import type { SelectionMenuState } from '../terminal/selectionMenu';
import { useFloatingMenu } from '../terminal/useFloatingMenu';
import { createSearchController } from '../terminal/search';
import { handleTerminalVisibilityChange } from '../terminal/visibility';
import { createTerminalWiring } from '../terminal/createTerminalWiring';
import type { PendingFileCapture } from '../terminal/fileCapture';
import { createTerminalActions } from '../terminal/terminalActions';
import { usePtyAutoClose } from '../terminal/usePtyAutoClose';
import { useAiRunCommandListener } from '../terminal/useAiRunCommandListener';
import { useTerminalAppearance } from '../terminal/useTerminalAppearance';
import { useLatencyProbe } from '../terminal/useLatencyProbe';

interface PtyInfo {
    pty_type: string;
    remote_host: string | null;
    remote_user: string | null;
    ssh_client: string | null;
    connection_time: number | null;
}

interface TerminalProps {
    id: number;
    visible: boolean;
    onClose: () => void;
}

const Terminal = ({ id, visible, onClose }: TerminalProps) => {
  const { settings, loading } = useSettings();
  const { addContextItem } = useAIContext();
  const terminalRef = useRef<HTMLDivElement>(null);
        const xtermRef = useRef<XTermTerminal | null>(null);
        const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showSearch, setShowSearch] = useState(false);
    const [hostLabel, setHostLabel] = useState('Local');
    const [ptyInfo, setPtyInfo] = useState<PtyInfo | null>(null);
    const [copyMenu, setCopyMenu] = useState<CopyMenuState | null>(null);
    const copyMenuRef = useRef<HTMLDivElement | null>(null);
    const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null);
    const selectionMenuRef = useRef<HTMLDivElement | null>(null);
    const selectionPointRef = useRef<{ x: number; y: number } | null>(null);
    const pendingFileCaptureRef = useRef<PendingFileCapture | null>(null);

    const hideCopyMenu = useCallback(() => setCopyMenu(null), []);
    const hideSelectionMenu = useCallback(() => setSelectionMenu(null), []);

    const actions = useMemo(() => createTerminalActions({
        termRef: xtermRef,
        addContextItem,
        hideCopyMenu,
        hideSelectionMenu,
    }), [addContextItem, hideCopyMenu, hideSelectionMenu]);

    const {
        copyRange,
        copyCombined,
        addContextFromLineRange,
        addContextFromCombined,
        addSelection,
    } = actions;

    const search = useMemo(() => createSearchController({
        searchAddonRef,
        searchInputRef,
        setShowSearch,
        focusTerminal: () => xtermRef.current?.focus(),
    }), []);
  
  useTerminalAppearance({
      termRef: xtermRef,
      fitAddonRef,
      appearance: settings?.appearance,
  });

  // Monitor latency for SSH sessions
  const { latencyMs } = useLatencyProbe(id, 5000); // Poll every 5 seconds

  const visibleRef = useRef(visible);
  
  // Fetch PTY info to determine if local or remote
  // Poll periodically to detect SSH session changes
  useEffect(() => {
    const fetchPtyInfo = () => {
      invoke<PtyInfo>('get_pty_info', { id })
        .then((info) => {
          setPtyInfo(info);
          if (info.pty_type === 'ssh' && info.remote_host) {
            const userPart = info.remote_user ? `${info.remote_user}@` : '';
            setHostLabel(`🔒 ${userPart}${info.remote_host}`);
          } else {
            setHostLabel('Local');
          }
        })
        .catch((err) => console.error('Failed to get PTY info:', err));
    };
    
    // Initial fetch
    fetchPtyInfo();
    
    // Poll every 2 seconds to detect SSH session changes
    const intervalId = setInterval(fetchPtyInfo, 2000);
    
    return () => clearInterval(intervalId);
  }, [id]);
  
  // Cleanup on unmount
  useEffect(() => {
      return () => {
          // Close PTY before cleaning up terminal
          invoke('close_pty', { id }).catch((e: unknown) => {
              console.error(`Failed to close PTY ${id}:`, e);
          });
          
          // Cleanup terminal instance
          if (xtermRef.current) {
              xtermRef.current.dispose();
              xtermRef.current = null;
          }
          
          // Cleanup addons
          if (fitAddonRef.current) {
              fitAddonRef.current.dispose();
              fitAddonRef.current = null;
          }
          
          if (searchAddonRef.current) {
              searchAddonRef.current.dispose();
              searchAddonRef.current = null;
          }
      };
  }, [id]);
  
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

    const wiring = createTerminalWiring({
        id,
        container: terminalRef.current,
        appearance: settings.appearance,
        maxMarkers: settings?.terminal?.max_markers ?? 200,
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
                termRef: xtermRef,
                fitAddonRef,
                searchAddonRef,
    });

      return () => {
      wiring.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, loading]); // Only re-run if ID changes or loading finishes. onClose is handled via ref.

  usePtyAutoClose({ id, onClose });

  useAiRunCommandListener({
      id,
      visibleRef,
            focusTerminal: () => xtermRef.current?.focus(),
            auditToTerminal: (line) => {
                const term = xtermRef.current;
                if (!term) return;
                // Write as terminal output (audit in scrollback). Keep it on one line.
                term.write(`\r\n${line}\r\n`);
            },
  });

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
                {ptyInfo?.pty_type === 'ssh' && (
                    <div 
                        className="status-latency" 
                        title={
                            ptyInfo.ssh_client
                                ? `SSH Connection\n${ptyInfo.ssh_client}\nConnected: ${ptyInfo.connection_time ? new Date(ptyInfo.connection_time * 1000).toLocaleString() : 'Unknown'}\nLatency: ${latencyMs ? `${latencyMs}ms` : 'Measuring...'}`
                                : 'SSH Session'
                        }
                    >
                        <span className={`latency-pill ${latencyMs && latencyMs > 0 ? (latencyMs < 50 ? 'latency-good' : latencyMs < 150 ? 'latency-ok' : 'latency-poor') : 'latency-measuring'}`}>
                            {latencyMs && latencyMs > 0 ? `${latencyMs}ms` : '—'}
                        </span>
                    </div>
                )}
            </div>
    </div>
  );
};

export default Terminal;
