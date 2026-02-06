import { useState, useMemo } from "react";
import SettingsModal from "./components/SettingsModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WindowRouter } from "./components/WindowRouter";
import { TabBar } from "./components/TabBar";
import { AppToolbar } from "./components/AppToolbar";
import { TerminalGrid } from "./components/TerminalGrid";
import { CommandPalette } from "./components/CommandPalette";

import { SettingsProvider } from "./context/SettingsContext";
import { AIProvider } from "./context/AIContext";
import { SSHProfilesProvider, useSSHProfiles } from "./context/SSHProfilesContext";
import { useTabManagement } from "./hooks/useTabManagement";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useQuickActionsExecutor } from "./hooks/useQuickActionsExecutor";
import { useCrossWindowEvents } from "./hooks/useCrossWindowEvents";
import { useSSHConnection } from "./hooks/useSSHConnection";
import { useSessionRestoration } from "./hooks/useSessionRestoration";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCommandTracking } from "./hooks/useCommandTracking";
import { useWindowCloseHandler } from "./hooks/useWindowCloseHandler";
import { useAIPanelAutoOpen } from "./hooks/useAIPanelAutoOpen";
import { detectWindowType } from "./utils/windowDetection";
import { openAIPanelWindow, openSSHPanelWindow } from "./utils/windowManagement";
import { initializeActions } from "./actions/actions";
import { createLogger } from "./utils/logger";
import "./App.css";

const log = createLogger('App');

function AppContent() {
  const [mainActiveTabId, setMainActiveTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
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
    addLocalTab,
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
  
  // Use command tracking hook
  const { runningCommands, handleCommandRunning, handleGoToTab } = useCommandTracking(tabs, setActiveTabId);

  // Get SSH profiles from context for session restoration
  const { profiles } = useSSHProfiles();

  // Use session restoration hook
  useSessionRestoration({
    profiles,
    connectSSHProfile,
    addLocalTab,
    setActiveTabId,
    setIsInitialized,
    createTab,
    loadSession,
  });

  // Use keyboard shortcuts hook
  useKeyboardShortcuts({
    activeTabId,
    tabs,
    createTab,
    closeTab,
    closePane,
    splitPane,
    setFocusedPane,
    setIsSettingsOpen,
    setIsCommandPaletteOpen,
    openAIPanelWindow,
    openSSHPanelWindow,
  });

  // Use window close handler hook
  useWindowCloseHandler({
    isAiWindow,
    saveSession,
  });

  // Auto-open AI Panel when context is added from terminal
  useAIPanelAutoOpen({
    enabled: !isAiWindow && !isSSHWindow && !isOutputViewer && !isQuickActionsWindow && !isPreviewWindow,
    activeTabId,
    tabs,
  });

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

  // Initialize command palette actions when dependencies change
  // Also run synchronously on first render to ensure actions are available immediately
  const actionDeps = useMemo(() => ({
    tabs,
    activeTabId,
    createTab,
    closeTab,
    renameTab,
    setActiveTabId,
    splitPane,
    closePane,
    setFocusedPane,
    setIsSettingsOpen,
    setIsCommandPaletteOpen,
  }), [tabs, activeTabId, createTab, closeTab, renameTab, setActiveTabId, splitPane, closePane, setFocusedPane, setIsSettingsOpen, setIsCommandPaletteOpen]);

  // Initialize actions synchronously when deps change
  initializeActions(actionDeps);

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
        <CommandPalette 
          isOpen={isCommandPaletteOpen} 
          onClose={() => setIsCommandPaletteOpen(false)} 
        />
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
            onCommandPaletteClick={() => setIsCommandPaletteOpen(true)}
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
