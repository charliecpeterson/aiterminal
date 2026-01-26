import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { Terminal as XTermTerminal } from '@xterm/xterm';
import { SearchAddon } from '@xterm/addon-search';
import type { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import '../terminal/ui/fold.css';
import { invoke } from '@tauri-apps/api/core';
import { useSettings } from '../context/SettingsContext';
import { useAIContext } from '../context/AIContext';
import type { CopyMenuState } from '../terminal/ui/markers';
import type { SelectionMenuState } from '../terminal/ui/selectionMenu';
import { QUICK_ACTIONS, buildQuickActionPrompt, shouldShowAction, type QuickActionType } from '../ai/quickActions';
import { useFloatingMenu } from '../terminal/hooks/useFloatingMenu';
import { createSearchController } from '../terminal/ui/search';
import { handleTerminalVisibilityChange } from '../terminal/visibility';
import { createTerminalWiring } from '../terminal/createTerminalWiring';
import type { PendingFileCapture } from '../terminal/core/fileCapture';
import { createTerminalActions } from '../terminal/terminalActions';
import { usePtyAutoClose } from '../terminal/hooks/usePtyAutoClose';
import { useAiRunCommandListener } from '../terminal/hooks/useAiRunCommandListener';
import { useTerminalAppearance } from '../terminal/hooks/useTerminalAppearance';
import { useLatencyProbe } from '../terminal/hooks/useLatencyProbe';
import { useAutocompleteSimple } from '../terminal/hooks/useAutocompleteSimple';
import { useAutocompleteMenu } from '../terminal/hooks/useAutocompleteMenu';
import { AutocompleteMenu } from './AutocompleteMenu';
import CommandHistoryMenu from './CommandHistoryMenu';
import type { MarkerManager } from '../terminal/ui/markers';
import { createLogger } from '../utils/logger';

const log = createLogger('Terminal');

// Format duration in ms to human-readable string
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
}

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
    onUpdateRemoteState?: (isRemote: boolean, remoteHost?: string) => void;
    onClose: () => void;
    onCommandRunning?: (isRunning: boolean, startTime?: number, exitCode?: number) => void;  // Notify parent of command status
}

const Terminal = ({ id, visible, onUpdateRemoteState, onClose, onCommandRunning }: TerminalProps) => {
  const { settings, loading } = useSettings();
  const { addContextItem, addContextItemWithScan } = useAIContext();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermHostRef = useRef<HTMLDivElement>(null);
        const xtermRef = useRef<XTermTerminal | null>(null);
        const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
    const [hostLabel, setHostLabel] = useState('Local');
    const commandStartTimeRef = useRef<number | null>(null);
    
    const setHostLabelAndRemoteState = useCallback((label: string) => {
        setHostLabel(label);
        // Notify parent of remote state changes
        if (onUpdateRemoteState) {
            const isRemote = label !== 'Local' && label.includes('🔒');
            onUpdateRemoteState(isRemote, isRemote ? label : undefined);
        }
    }, [onUpdateRemoteState]);
    const [ptyInfo, setPtyInfo] = useState<PtyInfo | null>(null);
    const [copyMenu, setCopyMenu] = useState<CopyMenuState | null>(null);
    const copyMenuRef = useRef<HTMLDivElement | null>(null);
    const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(null);
    const selectionMenuRef = useRef<HTMLDivElement | null>(null);
    const selectionPointRef = useRef<{ x: number; y: number } | null>(null);
    const pendingFileCaptureRef = useRef<PendingFileCapture | null>(null);
    const [commandHistoryOpen, setCommandHistoryOpen] = useState(false);
    const markerManagerRef = useRef<MarkerManager | null>(null);

    const hideCopyMenu = useCallback(() => setCopyMenu(null), []);
    const hideSelectionMenu = useCallback(() => setSelectionMenu(null), []);

    // Use refs to avoid recreating terminal wiring when callbacks change
    const onCommandRunningRef = useRef(onCommandRunning);
    const addContextItemRef = useRef(addContextItem);
    const addContextItemWithScanRef = useRef(addContextItemWithScan);
    const hideCopyMenuRef = useRef(hideCopyMenu);
    const hideSelectionMenuRef = useRef(hideSelectionMenu);
    const setHostLabelAndRemoteStateRef = useRef(setHostLabelAndRemoteState);
    
    useEffect(() => {
        onCommandRunningRef.current = onCommandRunning;
        addContextItemRef.current = addContextItem;
        addContextItemWithScanRef.current = addContextItemWithScan;
        hideCopyMenuRef.current = hideCopyMenu;
        hideSelectionMenuRef.current = hideSelectionMenu;
        setHostLabelAndRemoteStateRef.current = setHostLabelAndRemoteState;
    });

    const handleQuickAction = useCallback(
        (actionType: QuickActionType, commandText: string, outputText?: string, exitCode?: number) => {
            const { systemPrompt, userPrompt } = buildQuickActionPrompt({
                actionType,
                command: commandText,
                output: outputText,
                exitCode,
            });

            // Add the command/output to context first with secret scanning
            const content = outputText || commandText;
            addContextItemWithScan(content, 'command_output', {
                command: commandText,
                output: outputText,
                exitCode,
            }).catch(err => {
                log.error('Failed to scan and add context for quick action', err);
            });

            // Close the menu
            hideCopyMenu();
            
            // Emit event to open AI panel and trigger chat
            invoke('emit_event', {
                event: 'ai-quick-action',
                payload: {
                    actionType,
                    systemPrompt,
                    userPrompt,
                    terminalId: id,
                },
            }).catch((err) => {
                log.warn('Failed to emit quick action event', err);
            });
        },
        [addContextItem, addContextItemWithScan, hideCopyMenu, id]
    );

    const actions = useMemo(() => createTerminalActions({
        termRef: xtermRef,
        addContextItem,
        addContextItemWithScan,
        hideCopyMenu,
        hideSelectionMenu,
    }), [addContextItem, addContextItemWithScan, hideCopyMenu, hideSelectionMenu]);

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

  // Simple Fish-style autocomplete (clean rewrite)
  useAutocompleteSimple(
    xtermRef, 
    settings?.autocomplete?.enable_inline ?? true, 
    id,
    settings?.autocomplete?.inline_source ?? 'history',
    settings?.autocomplete?.llm_debounce_ms ?? 300,
    terminalReady
  );

  const autocompleteMenu = useAutocompleteMenu(
    xtermRef,
    settings?.autocomplete?.enable_menu ?? true,
    id,
    terminalReady
  );

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
            setHostLabelAndRemoteState(`🔒 ${userPart}${info.remote_host}`);
          } else {
            setHostLabelAndRemoteState('Local');
          }
        })
        .catch((err) => log.error('Failed to get PTY info', err));
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
              log.error(`Failed to close PTY ${id}`, e);
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
      if (!terminalReady) return; // Don't handle visibility until terminal is initialized
      handleTerminalVisibilityChange({
          id,
          visible,
          visibleRef,
          termRef: xtermRef,
          fitAddonRef,
      });
  }, [visible, id, terminalReady]);

  useEffect(() => {
        if (!terminalRef.current || !xtermHostRef.current || loading || !settings) return;

    const wiring = createTerminalWiring({
        id,
        container: terminalRef.current,
        xtermContainer: xtermHostRef.current,
        appearance: settings.appearance,
        maxMarkers: settings?.terminal?.max_markers ?? 200,
        foldThreshold: settings?.fold?.threshold ?? 50,
        foldEnabled: settings?.fold?.enabled ?? true,
        visibleRef,
        selectionPointRef,
        pendingFileCaptureRef,
        setCopyMenu,
        setSelectionMenu,
        setShowSearch,
        setHostLabel: (label: string) => setHostLabelAndRemoteStateRef.current(label),
        addContextItem: (item) => addContextItemRef.current(item),
        addContextItemWithScan: (content, type, metadata) => addContextItemWithScanRef.current(content, type, metadata),
        hideCopyMenu: () => hideCopyMenuRef.current(),
        hideSelectionMenu: () => hideSelectionMenuRef.current(),
                termRef: xtermRef,
                fitAddonRef,
                searchAddonRef,
        onCommandStart: () => {
          const startTime = Date.now();
          commandStartTimeRef.current = startTime;
          onCommandRunningRef.current?.(true, startTime);
        },
        onCommandEnd: (exitCode?: number) => {
          commandStartTimeRef.current = null;
          onCommandRunningRef.current?.(false, undefined, exitCode);
        },
    });

    // Store marker manager for command history
    markerManagerRef.current = wiring.markerManager;

    // Signal that terminal is ready for keyboard listeners
    setTerminalReady(true);

      return () => {
      wiring.cleanup();
      setTerminalReady(false);
      markerManagerRef.current = null;
    };
    // Only re-run when id or loading changes - all callbacks are handled via refs
    // to avoid unnecessary terminal recreation
  }, [id, loading, settings]);

  usePtyAutoClose({ id, onClose });

  // Keyboard shortcut for command history (Cmd+R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r' && !e.shiftKey) {
        e.preventDefault();
        setCommandHistoryOpen(prev => !prev);
      }
    };

    const handleToggleEvent = () => {
      setCommandHistoryOpen(prev => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('toggle-command-history', handleToggleEvent);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('toggle-command-history', handleToggleEvent);
    };
  }, []);

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
            <div className="terminal-body" ref={terminalRef}>
                <div className="terminal-xterm-host" ref={xtermHostRef} />
            </div>
            {autocompleteMenu.menuVisible && (
                <AutocompleteMenu
                    suggestions={autocompleteMenu.suggestions}
                    selectedIndex={autocompleteMenu.selectedIndex}
                    position={autocompleteMenu.menuPosition}
                    loading={autocompleteMenu.loading}
                    onSelect={autocompleteMenu.acceptSuggestion}
                    onClose={autocompleteMenu.closeMenu}
                />
            )}
            {copyMenu && (
                <div
                    className="marker-copy-menu"
                    style={{ top: copyMenu.y, left: copyMenu.x }}
                    ref={copyMenuRef}
                >
                    {/* Show duration if available */}
                    {copyMenu.duration !== undefined && (
                        <div className="marker-duration">
                            ⏱️ {formatDuration(copyMenu.duration)}
                            {copyMenu.exitCode !== undefined && (
                                <span className={copyMenu.exitCode === 0 ? 'success' : 'error'}>
                                    {' '}• Exit: {copyMenu.exitCode}
                                </span>
                            )}
                        </div>
                    )}
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
                    
                    {/* AI Quick Actions */}
                    {copyMenu.commandText && (
                        <>
                            <div className="marker-copy-divider" />
                            <div className="marker-quick-actions-label">AI Quick Actions</div>
                            
                            {shouldShowAction('explain', copyMenu.exitCode, !!copyMenu.outputText) && (
                                <button
                                    className="marker-quick-action"
                                    disabled={copyMenu.disabled}
                                    onClick={() =>
                                        handleQuickAction(
                                            'explain',
                                            copyMenu.commandText!,
                                            copyMenu.outputText,
                                            copyMenu.exitCode
                                        )
                                    }
                                >
                                    {QUICK_ACTIONS.explain.icon} {QUICK_ACTIONS.explain.label}
                                </button>
                            )}
                            
                            {shouldShowAction('explainError', copyMenu.exitCode, !!copyMenu.outputText) && (
                                <button
                                    className="marker-quick-action marker-quick-action-error"
                                    disabled={copyMenu.disabled}
                                    onClick={() =>
                                        handleQuickAction(
                                            'explainError',
                                            copyMenu.commandText!,
                                            copyMenu.outputText,
                                            copyMenu.exitCode
                                        )
                                    }
                                >
                                    {QUICK_ACTIONS.explainError.icon} {QUICK_ACTIONS.explainError.label}
                                </button>
                            )}
                            
                            {shouldShowAction('suggestFix', copyMenu.exitCode, !!copyMenu.outputText) && (
                                <button
                                    className="marker-quick-action marker-quick-action-fix"
                                    disabled={copyMenu.disabled}
                                    onClick={() =>
                                        handleQuickAction(
                                            'suggestFix',
                                            copyMenu.commandText!,
                                            copyMenu.outputText,
                                            copyMenu.exitCode
                                        )
                                    }
                                >
                                    {QUICK_ACTIONS.suggestFix.icon} {QUICK_ACTIONS.suggestFix.label}
                                </button>
                            )}
                            
                            {shouldShowAction('whatsNext', copyMenu.exitCode, !!copyMenu.outputText) && (
                                <button
                                    className="marker-quick-action marker-quick-action-next"
                                    disabled={copyMenu.disabled}
                                    onClick={() =>
                                        handleQuickAction(
                                            'whatsNext',
                                            copyMenu.commandText!,
                                            copyMenu.outputText,
                                            copyMenu.exitCode
                                        )
                                    }
                                >
                                    {QUICK_ACTIONS.whatsNext.icon} {QUICK_ACTIONS.whatsNext.label}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
            {selectionMenu && (
                <div
                    className="selection-badge"
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
                    <>
                        <div 
                            className="status-latency" 
                            title={
                                ptyInfo.ssh_client
                                    ? `SSH Connection\n${ptyInfo.ssh_client}\nConnected: ${ptyInfo.connection_time ? new Date(ptyInfo.connection_time * 1000).toLocaleString() : 'Unknown'}\nLatency: ${latencyMs ? `${latencyMs}ms` : 'Measuring...'}`
                                    : 'SSH Session'
                            }
                        >
                            <span className={`latency-pill ${latencyMs && latencyMs > 0 ? (latencyMs < 100 ? 'latency-good' : latencyMs < 300 ? 'latency-warn' : 'latency-bad') : 'latency-unknown'}`}>
                                {latencyMs && latencyMs > 0 ? `${latencyMs}ms` : '\u2014'}
                            </span>
                        </div>
                    </>
                )}
            </div>
            
            <CommandHistoryMenu
                isOpen={commandHistoryOpen}
                onClose={() => setCommandHistoryOpen(false)}
                terminal={xtermRef.current}
                onJumpToCommand={(line) => markerManagerRef.current?.jumpToLine(line)}
                onCopyCommand={(line) => markerManagerRef.current?.copyCommandAtLine(line)}
                onAddToContext={(line) => markerManagerRef.current?.addCommandToContext(line)}
                getCommandHistory={() => markerManagerRef.current?.getCommandHistory() || []}
            />
        </div>
    );
};

export default Terminal;
