import { useState, useEffect, useCallback, useRef } from "react";
import SettingsModal from "./components/SettingsModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WindowRouter } from "./components/WindowRouter";
import { TabBar } from "./components/TabBar";
import { AppToolbar } from "./components/AppToolbar";
import { TerminalGrid } from "./components/TerminalGrid";

import { SettingsProvider } from "./context/SettingsContext";
import { AIProvider } from "./context/AIContext";
import { SSHProfilesProvider, useSSHProfiles } from "./context/SSHProfilesContext";
import { useTabManagement } from "./hooks/useTabManagement";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useQuickActionsExecutor } from "./hooks/useQuickActionsExecutor";
import { useCrossWindowEvents } from "./hooks/useCrossWindowEvents";
import { useSSHConnection } from "./hooks/useSSHConnection";
import { detectWindowType } from "./utils/windowDetection";
import { openAIPanelWindow, openSSHPanelWindow, openQuickActionsWindow, closeAuxiliaryWindows } from "./utils/windowManagement";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createLogger } from "./utils/logger";
import "./App.css";

const log = createLogger('App');

function AppContent() {
  const [mainActiveTabId, setMainActiveTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { updateProfile, updateConnection, getProfileById } = useSSHProfiles();
  
  // Detect window type
  const windowType = detectWindowType();
  const { isAiWindow, isSSHWindow, isOutputViewer, isQuickActionsWindow, isPreviewWindow } = windowType;
  
  // Map PTY ID to Profile ID for connection tracking
  const [ptyToProfileMap, setPtyToProfileMap] = useState<Map<number, string>>(new Map());
  
  // Use tab management hook
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    createTab,
    closeTab,
    renameTab,
    reorderTabs,
    splitPane,
    closePane,
    setFocusedPane,
    updateSplitRatio,
    updateTabRemoteState,
    addSSHTab,
  } = useTabManagement(isInitialized, ptyToProfileMap, updateConnection);
  
  // Use SSH connection hook
  const { connectSSHProfile } = useSSHConnection({
    tabs,
    ptyToProfileMap,
    setPtyToProfileMap,
    addSSHTab,
    updateProfile,
    updateConnection,
  });
  
  // Use session persistence hook (only in main window)
  const { saveSession, loadSession } = useSessionPersistence({
    tabs,
    activeTabId,
    ptyToProfileMap,
    enabled: !isAiWindow && !isSSHWindow && !isOutputViewer && !isQuickActionsWindow && !isPreviewWindow,
  });
  
  // Track running commands per tab: Map<ptyId, { startTime: number, elapsed: number }>
  const [runningCommands, setRunningCommands] = useState<Map<number, { startTime: number; elapsed: number }>>(new Map());
  const elapsedTimerRef = useRef<number | null>(null);
  const tabsRef = useRef(tabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const handleGoToTab = useCallback((tabId: string) => {
    const ptyId = parseInt(tabId);
    const tab = tabsRef.current.find(t => t.panes.some(p => p.id === ptyId));
    if (tab) {
      setActiveTabId(tab.id);
    }
  }, []);

  // Handle command running state for tabs
  const handleCommandRunning = useCallback((ptyId: number, isRunning: boolean, startTime?: number) => {
    if (isRunning && startTime) {
      setRunningCommands(prev => {
        const newMap = new Map(prev);
        newMap.set(ptyId, { startTime, elapsed: 0 });
        return newMap;
      });
    } else {
      setRunningCommands(prev => {
        const newMap = new Map(prev);
        newMap.delete(ptyId);
        return newMap;
      });
    }
  }, []);

  // Update elapsed time every second for running commands
  useEffect(() => {
    if (runningCommands.size === 0) {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      return;
    }

    elapsedTimerRef.current = setInterval(() => {
      setRunningCommands(prev => {
        const newMap = new Map(prev);
        const now = Date.now();
        for (const [ptyId, state] of newMap.entries()) {
          newMap.set(ptyId, { ...state, elapsed: now - state.startTime });
        }
        return newMap;
      });
    }, 1000);

    return () => {
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
    };
  }, [runningCommands.size]);

  // Get SSH profiles from context for session restoration
  const { profiles } = useSSHProfiles();

  /**
   * Restore a saved session or create a new tab
   */
  useEffect(() => {
    const restoreOrCreateSession = async () => {
      try {
        const sessionState = await loadSession();
        
        if (!sessionState || sessionState.tabs.length === 0) {
          // No saved session, create a new tab
          log.info('No saved session, creating new tab');
          await createTab();
          setIsInitialized(true);
          return;
        }

        log.info(`Restoring session with ${sessionState.tabs.length} tabs`);

        // Restore each tab
        for (const sessionTab of sessionState.tabs) {
          for (const sessionPane of sessionTab.panes) {
            if (sessionPane.restoreType === 'skip') {
              log.debug(`Skipping pane ${sessionPane.id} (marked as skip)`);
              continue;
            }

            if (sessionPane.restoreType === 'ssh' && sessionPane.sshProfileId) {
              // Restore SSH connection
              const profile = profiles.find(p => p.id === sessionPane.sshProfileId);
              if (profile) {
                log.info(`Restoring SSH connection to ${profile.name}`);
                try {
                  await connectSSHProfile(profile);
                } catch (error) {
                  log.error(`Failed to restore SSH connection for ${profile.name}:`, error);
                }
              } else {
                log.warn(`SSH profile ${sessionPane.sshProfileId} not found, skipping`);
              }
            } else if (sessionPane.restoreType === 'local') {
              // Restore local terminal
              log.info(`Restoring local terminal (cwd: ${sessionPane.workingDirectory || 'default'})`);
              try {
                const ptyId = await invoke<number>("spawn_pty");
                
                // Create tab with restored title
                addSSHTab(ptyId, sessionTab.customName || sessionTab.title, '');
                
                // Change to working directory if available
                if (sessionPane.workingDirectory) {
                  await invoke('write_to_pty', {
                    id: ptyId,
                    data: `cd "${sessionPane.workingDirectory}"\n`,
                  });
                }
              } catch (error) {
                log.error('Failed to restore local terminal:', error);
              }
            }
          }
        }

        // Restore active tab
        if (sessionState.activeTabId !== null) {
          setActiveTabId(sessionState.activeTabId);
        }

        setIsInitialized(true);
        log.info('Session restoration complete');
      } catch (error) {
        log.error('Session restoration failed:', error);
        // Fallback to creating a new tab
        await createTab();
        setIsInitialized(true);
      }
    };

    restoreOrCreateSession();
  }, []); // Empty deps - only run once on mount

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "t") {
          e.preventDefault();
          createTab();
        } else if (e.key === "w") {
          e.preventDefault();
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && activeTab.focusedPaneId) {
            closePane(activeTabId!, activeTab.focusedPaneId);
          } else if (activeTabId !== null) {
            closeTab(activeTabId);
          }
        } else if (e.key === "d") {
          e.preventDefault();
          if (activeTabId !== null) {
            const direction = e.shiftKey ? 'horizontal' : 'vertical';
            splitPane(activeTabId, direction);
          }
        } else if (e.key === "[") {
          e.preventDefault();
          // Navigate to previous pane
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && activeTab.panes.length > 1) {
            const currentIndex = activeTab.panes.findIndex(p => p.id === activeTab.focusedPaneId);
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : activeTab.panes.length - 1;
            setFocusedPane(activeTabId!, activeTab.panes[prevIndex].id);
          }
        } else if (e.key === "]") {
          e.preventDefault();
          // Navigate to next pane
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && activeTab.panes.length > 1) {
            const currentIndex = activeTab.panes.findIndex(p => p.id === activeTab.focusedPaneId);
            const nextIndex = (currentIndex + 1) % activeTab.panes.length;
            setFocusedPane(activeTabId!, activeTab.panes[nextIndex].id);
          }
        } else if (e.key === ",") {
          e.preventDefault();
          setIsSettingsOpen(true);
        } else if (e.key === "b") {
          e.preventDefault();
          openAIPanelWindow({ activeTabId, tabs });
        } else if (e.key === "o" && e.shiftKey) {
          e.preventDefault();
          openSSHPanelWindow();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (isAiWindow) return; // Only run in main window
    
    // Close AI Panel and SSH Panel windows when main window closes
    const currentWindow = getCurrentWindow();
    const unlistenPromise = currentWindow.onCloseRequested(async () => {
      // Save session before closing
      try {
        await saveSession();
        log.info('Session saved on window close');
      } catch (error) {
        log.error('Failed to save session on window close:', error);
      }
      
      await closeAuxiliaryWindows();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow, saveSession]);

  // Use cross-window events hook
  useCrossWindowEvents({
    isAiWindow,
    isSSHWindow,
    isOutputViewer,
    isQuickActionsWindow,
    tabs,
    activeTabId,
    ptyToProfileMap,
    onMainActiveTabIdChange: setMainActiveTabId,
    onGoToTab: handleGoToTab,
    onConnectSSHProfile: connectSSHProfile,
  });

  // Use Quick Actions executor hook
  const { executeQuickAction } = useQuickActionsExecutor({
    isQuickActionsWindow,
    mainActiveTabId,
    tabs,
    activeTabId,
    runningCommands,
  });

  return (
    <WindowRouter
      isAiWindow={isAiWindow}
      isSSHWindow={isSSHWindow}
      isOutputViewer={isOutputViewer}
      isQuickActionsWindow={isQuickActionsWindow}
      isPreviewWindow={isPreviewWindow}
      mainActiveTabId={mainActiveTabId}
      onExecuteQuickAction={executeQuickAction}
    >
      <div className="app-container">
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        <div className="tabs-header">
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            runningCommands={runningCommands}
            onTabClick={setActiveTabId}
            onNewTab={createTab}
            onCloseTab={closeTab}
            onRenameTab={renameTab}
            onReorderTabs={reorderTabs}
          />
          <div style={{ flex: 1 }} /> {/* Spacer */}
          <AppToolbar
            onSSHClick={openSSHPanelWindow}
            onAIPanelClick={() => openAIPanelWindow({ activeTabId, tabs })}
            onQuickActionsClick={() => openQuickActionsWindow({ activeTabId, tabs })}
            onHistoryClick={() => window.dispatchEvent(new CustomEvent('toggle-command-history'))}
            onSettingsClick={() => setIsSettingsOpen(true)}
          />
        </div>
        <TerminalGrid
          tabs={tabs}
          activeTabId={activeTabId}
          onFocusPane={setFocusedPane}
          onUpdateRemoteState={updateTabRemoteState}
          onClosePane={closePane}
          onCommandRunning={handleCommandRunning}
          onUpdateSplitRatio={updateSplitRatio}
          getProfileById={getProfileById}
        />
      </div>
    </WindowRouter>
  );
}

function App() {
    return (
        <ErrorBoundary 
          name="Application Root"
          onError={(error, errorInfo) => {
            // Log critical root-level errors
            log.error("Critical application error:", {
              error: error.message,
              stack: error.stack,
              componentStack: errorInfo.componentStack,
            });
          }}
        >
          <SettingsProvider>
              <AIProvider>
                  <SSHProfilesProvider>
                      <AppContent />
                  </SSHProfilesProvider>
              </AIProvider>
          </SettingsProvider>
        </ErrorBoundary>
    );
}

export default App;
