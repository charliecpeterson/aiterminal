import React, { useState, useEffect, useCallback, useRef } from "react";
import Terminal from "./components/Terminal";
import AIPanel from "./components/AIPanel";
import SSHSessionWindow from "./components/SSHSessionWindow";
import OutputViewer from "./components/OutputViewer";
import QuickActionsWindow from "./components/QuickActionsWindow";
import PreviewWindow from "./components/PreviewWindow";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./context/SettingsContext";
import { AIProvider } from "./context/AIContext";
import { SSHProfilesProvider, useSSHProfiles } from "./context/SSHProfilesContext";
import { SSHProfile } from "./types/ssh";
import { QuickAction } from "./components/QuickActionsWindow";
import { connectSSHProfileNewTab, getProfileDisplayName } from "./utils/sshConnect";
import { useTabManagement } from "./hooks/useTabManagement";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo, listen } from "@tauri-apps/api/event";
import "./App.css";
import "./components/AIPanel.css";
import "./components/SSHSessionWindow.css";

function AppContent() {
  const [mainActiveTabId, setMainActiveTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingTabId, setEditingTabId] = useState<number | null>(null);
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const { updateProfile, updateConnection } = useSSHProfiles();
  
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
  
  // Track running commands per tab: Map<ptyId, { startTime: number, elapsed: number }>
  const [runningCommands, setRunningCommands] = useState<Map<number, { startTime: number; elapsed: number }>>(new Map());
  const elapsedTimerRef = useRef<number | null>(null);
  const tabsRef = useRef(tabs);
  
  let isAiWindow = false;
  let isSSHWindow = false;
  let isOutputViewer = false;
  let isQuickActionsWindow = false;
  let isPreviewWindow = false;
  try {
    isAiWindow = window.location.hash.startsWith("#/ai-panel");
    isSSHWindow = window.location.hash.startsWith("#/ssh-panel");
    isOutputViewer = window.location.hash.startsWith("#/output-viewer");
    isQuickActionsWindow = window.location.hash.startsWith("#/quick-actions");
    isPreviewWindow = window.location.search.includes("preview=");
  } catch {
    isAiWindow = false;
    isSSHWindow = false;
    isOutputViewer = false;
    isQuickActionsWindow = false;
    isPreviewWindow = false;
  }

  const connectSSHProfile = async (profile: SSHProfile) => {
    try {
      const ptyId = await connectSSHProfileNewTab(profile);
      const displayName = getProfileDisplayName(profile);
      
      // Use hook to add SSH tab
      addSSHTab(ptyId, displayName, profile.id);
      
      // Link PTY to Profile for health tracking
      setPtyToProfileMap(prev => new Map(prev).set(ptyId, profile.id));
      
      // Update connection state (keyed by ptyId)
      updateConnection(String(ptyId), {
        profileId: profile.id,
        tabId: String(ptyId),
        tabName: displayName,
        status: 'connecting',
        connectedAt: new Date(),
        lastActivity: new Date(),
      });
      
      // Broadcast to SSH window
      emitTo("ssh-panel", "connection-status-update", {
        ptyId: String(ptyId),
        profileId: profile.id,
        tabName: displayName,
        status: 'connecting',
        tabId: String(ptyId),
      }).catch(() => {});
      
      // Update profile connection stats
      await updateProfile(profile.id, {
        lastConnectedAt: new Date().toISOString(),
        connectionCount: (profile.connectionCount || 0) + 1,
      });
    } catch (error) {
      console.error("Failed to connect SSH profile:", error);
    }
  };

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

  const formatElapsedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return minutes > 0 ? `${minutes}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  useEffect(() => {
    createTab().then(() => setIsInitialized(true));
  }, [createTab]);

  // Monitor connection health for SSH sessions
  useEffect(() => {
    if (ptyToProfileMap.size === 0) return;

    const monitorConnections = async () => {
      for (const [ptyId, profileId] of ptyToProfileMap.entries()) {
        try {
          // Get PTY info
          const ptyInfo = await invoke<any>('get_pty_info', { id: ptyId });
          
          // Get latency
          const latency = await invoke<number>('measure_pty_latency', { id: ptyId });
          
          // Get tab name
          const tab = tabs.find(t => t.panes.some(p => p.id === ptyId));
          const tabName = tab?.customName || tab?.title || 'Unknown';
          
          // Determine status
          let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
          if (ptyInfo && ptyInfo.pty_type === 'ssh') {
            status = 'connected';
          }
          
          // Update connection health (keyed by ptyId)
          updateConnection(String(ptyId), {
            profileId,
            tabId: String(ptyId),
            tabName,
            status,
            latency: latency > 0 ? latency : undefined,
            lastActivity: new Date(),
          });
          
          // Broadcast to SSH window
          emitTo("ssh-panel", "connection-status-update", {
            ptyId: String(ptyId),
            profileId,
            tabName,
            status,
            latency: latency > 0 ? latency : undefined,
            tabId: String(ptyId),
          }).catch(() => {});
        } catch (error) {
          // PTY might be closed
          updateConnection(String(ptyId), {
            profileId,
            tabId: String(ptyId),
            status: 'disconnected',
          });
          
          // Broadcast to SSH window
          emitTo("ssh-panel", "connection-status-update", {
            ptyId: String(ptyId),
            profileId,
            status: 'disconnected',
            tabId: String(ptyId),
          }).catch(() => {});
        }
      }
    };

    // Monitor immediately
    monitorConnections();

    // Then monitor every 5 seconds
    const intervalId = setInterval(monitorConnections, 5000);

    return () => clearInterval(intervalId);
  }, [ptyToProfileMap, updateConnection]);

  // Clean up connection tracking when tabs close
  useEffect(() => {
    const activePtyIds = new Set(tabs.flatMap(tab => tab.panes.map(pane => pane.id)));
    
    setPtyToProfileMap(prev => {
      const updated = new Map(prev);
      let changed = false;
      
      for (const ptyId of prev.keys()) {
        if (!activePtyIds.has(ptyId)) {
          updated.delete(ptyId);
          changed = true;
        }
      }
      
      return changed ? updated : prev;
    });
  }, [tabs]);

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
          openAIPanelWindow();
        } else if (e.key === "o" && e.shiftKey) {
          e.preventDefault();
          openSSHPanelWindow();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, tabs]);

  // No resizing or attach/detach logic needed for separate window mode

  useEffect(() => {
    if (isAiWindow) return; // Only run in main window
    
    // Close AI Panel and SSH Panel windows when main window closes
    const currentWindow = getCurrentWindow();
    const unlistenPromise = currentWindow.onCloseRequested(async () => {
      const aiPanel = await WebviewWindow.getByLabel("ai-panel").catch(() => null);
      if (aiPanel) {
        await aiPanel.close().catch(() => {});
      }
      const sshPanel = await WebviewWindow.getByLabel("ssh-panel").catch(() => null);
      if (sshPanel) {
        await sshPanel.close().catch(() => {});
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow]);

  useEffect(() => {
    if (isAiWindow || isSSHWindow || isOutputViewer || isQuickActionsWindow) return; // Only run in main window

    // Listen for SSH connection events from SSH window
    const unlistenConnect = listen<{ profile: SSHProfile }>("ssh:connect", async (event) => {
      await connectSSHProfile(event.payload.profile);
    });

    const unlistenNewTab = listen<{ profile: SSHProfile }>("ssh:connect-new-tab", async (event) => {
      await connectSSHProfile(event.payload.profile);
    });

    const unlistenGoToTab = listen<{ ptyId: string }>("ssh:goto-tab", (event) => {
      handleGoToTab(event.payload.ptyId);
    });

    // Listen for status requests from SSH window
    const unlistenStatusRequest = listen("ssh:request-status", async () => {
      // Send current connection status for all tracked PTYs
      for (const [ptyId, profileId] of ptyToProfileMap.entries()) {
        try {
          const ptyInfo = await invoke<any>('get_pty_info', { id: ptyId });
          const latency = await invoke<number>('measure_pty_latency', { id: ptyId });
          
          let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
          if (ptyInfo && ptyInfo.pty_type === 'ssh') {
            status = 'connected';
          }
          
          emitTo("ssh-panel", "connection-status-update", {
            ptyId: String(ptyId),
            profileId,
            status,
            latency: latency > 0 ? latency : undefined,
            tabId: String(ptyId),
          }).catch(() => {});
        } catch (error) {
          // PTY closed
        }
      }
    });

    return () => {
      unlistenConnect.then((unlisten) => unlisten());
      unlistenNewTab.then((unlisten) => unlisten());
      unlistenGoToTab.then((unlisten) => unlisten());
      unlistenStatusRequest.then((unlisten) => unlisten());
    };
  }, [handleGoToTab]); // Include handleGoToTab which depends on tabs

  useEffect(() => {
    if (!isAiWindow) return;
    const unlistenPromise = listen<{ id: number | null }>("ai-panel:active-terminal", (event) => {
      setMainActiveTabId(event.payload?.id ?? null);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow]);

  useEffect(() => {
    if (!isQuickActionsWindow) return;
    const unlistenPromise = listen<{ id: number | null }>("quick-actions:active-terminal", (event) => {
      setMainActiveTabId(event.payload?.id ?? null);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isQuickActionsWindow]);

  useEffect(() => {
    if (isAiWindow || isQuickActionsWindow) return;
    // Best-effort: keep detached AI panel and Quick Actions aware of the current active terminal pane.
    const activeTab = tabs.find(t => t.id === activeTabId);
    const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;
    emitTo("ai-panel", "ai-panel:active-terminal", { id: focusedPaneId }).catch(() => {});
    emitTo("quick-actions", "quick-actions:active-terminal", { id: focusedPaneId }).catch(() => {});
  }, [activeTabId, tabs, isAiWindow, isQuickActionsWindow]);

  const executeQuickAction = async (action: QuickAction) => {
    // Get the active terminal's PTY ID
    let activePty: number | null = null;
    
    if (isQuickActionsWindow) {
      // In popup window: use mainActiveTabId from events, default to null if not set yet
      // We'll wait a moment for the event to arrive if it's null
      activePty = mainActiveTabId;
      
      if (activePty === null || activePty === undefined) {
        // Try waiting briefly for the event to arrive
        await new Promise(resolve => setTimeout(resolve, 100));
        activePty = mainActiveTabId;
      }
    } else {
      // In main window: use the focused pane
      activePty = tabs.find(t => t.id === activeTabId)?.focusedPaneId || activeTabId;
    }
    
    if (activePty === null || activePty === undefined) {
      console.error("No active terminal - mainActiveTabId:", mainActiveTabId, "activeTabId:", activeTabId);
      alert("No active terminal found. Please make sure a terminal is active in the main window and try again.");
      return;
    }
    
    // Execute commands sequentially
    for (let i = 0; i < action.commands.length; i++) {
      const command = action.commands[i];
      
      try {
        // Send command to PTY (with newline to execute)
        await invoke("write_to_pty", { 
          id: activePty, 
          data: command + "\r" 
        });
        
        // Wait for command to complete
        await waitForCommandComplete(activePty);
        
      } catch (error) {
        console.error(`[Quick Action: ${action.name}] Failed to execute command: ${command}`, error);
      }
    }
  };

  const waitForCommandComplete = (ptyId: number): Promise<void> => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        // Check if command is still running
        if (!runningCommands.has(ptyId)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Safety timeout (10 minutes max per command)
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10 * 60 * 1000);
    });
  };

  const openAIPanelWindow = async () => {
    const existing = await WebviewWindow.getByLabel("ai-panel");
    if (existing) {
      await existing.setFocus();
      return;
    }

    const panelWindow = new WebviewWindow("ai-panel", {
      title: "AI Panel",
      width: 380,
      height: 620,
      resizable: true,
      url: "/#/ai-panel",
    });
    panelWindow.once("tauri://created", () => {
      panelWindow.setFocus().catch(() => {});
      const activeTab = tabs.find(t => t.id === activeTabId);
      const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;
      emitTo("ai-panel", "ai-panel:active-terminal", { id: focusedPaneId }).catch(() => {});
    });
    panelWindow.once("tauri://error", (event) => {
      console.error("AI panel window error:", event);
    });
  };

  const openQuickActionsWindow = async () => {
    const existing = await WebviewWindow.getByLabel("quick-actions");
    if (existing) {
      await existing.setFocus();
      return;
    }

    const qaWindow = new WebviewWindow("quick-actions", {
      title: "Quick Actions",
      width: 600,
      height: 600,
      resizable: true,
      url: "/#/quick-actions",
    });
    qaWindow.once("tauri://created", async () => {
      await qaWindow.setFocus().catch(() => {});
      
      // Wait a moment for the window to fully initialize and set up listeners
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const activeTab = tabs.find(t => t.id === activeTabId);
      const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;
      await emitTo("quick-actions", "quick-actions:active-terminal", { id: focusedPaneId }).catch((err) => {
        console.error('[Quick Actions] Failed to emit active terminal:', err);
      });
    });
    qaWindow.once("tauri://error", (event) => {
      console.error("Quick Actions window error:", event);
    });
  };

  const openSSHPanelWindow = async () => {
    const existing = await WebviewWindow.getByLabel("ssh-panel");
    if (existing) {
      // If window exists, close it (toggle behavior)
      await existing.close().catch(() => {});
      return;
    }

    const sshWindow = new WebviewWindow("ssh-panel", {
      title: "SSH Sessions",
      width: 350,
      height: 600,
      resizable: true,
      url: "/#/ssh-panel",
    });
    sshWindow.once("tauri://created", () => {
      sshWindow.setFocus().catch(() => {});
    });
    sshWindow.once("tauri://error", (event) => {
      console.error("SSH panel window error:", event);
    });
  };

  if (isAiWindow) {
    return (
      <div className="ai-window">
        <AIPanel
          activeTerminalId={mainActiveTabId}
        />
      </div>
    );
  }

  if (isSSHWindow) {
    return (
      <div className="ssh-window">
        <SSHSessionWindow />
      </div>
    );
  }

  if (isQuickActionsWindow) {
    return (
      <div className="quick-actions-window-wrapper">
        <QuickActionsWindow
          onClose={async () => {
            const window = await WebviewWindow.getByLabel("quick-actions");
            await window?.close();
          }}
          onExecute={executeQuickAction}
        />
      </div>
    );
  }

  if (isPreviewWindow) {
    return <PreviewWindow />;
  }

  if (isOutputViewer) {
    return <OutputViewer />;
  }

  return (
    <div className="app-container">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <div className="tabs-header">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""} ${isDragging && draggedTabIndex === index ? "dragging" : ""}`}
            onMouseDown={(e) => {
              if (editingTabId === tab.id || e.button !== 0) return;
              setDragStartX(e.clientX);
              setDraggedTabIndex(index);
            }}
            onMouseMove={(e) => {
              if (draggedTabIndex === index && e.buttons === 1 && Math.abs(e.clientX - dragStartX) > 5) {
                setIsDragging(true);
              }
              if (isDragging && draggedTabIndex !== null && draggedTabIndex !== index) {
                reorderTabs(draggedTabIndex, index);
                setDraggedTabIndex(index);
              }
            }}
            onMouseUp={() => {
              setIsDragging(false);
              setDraggedTabIndex(null);
            }}
            onClick={() => {
              if (!isDragging && editingTabId !== tab.id) {
                setActiveTabId(tab.id);
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingTabId(tab.id);
            }}
          >
            {editingTabId === tab.id ? (
              <input
                type="text"
                className="tab-name-input"
                defaultValue={tab.customName || tab.title}
                autoFocus
                onBlur={(e) => {
                  renameTab(tab.id, e.target.value);
                  setEditingTabId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    renameTab(tab.id, e.currentTarget.value);
                    setEditingTabId(null);
                  } else if (e.key === "Escape") {
                    setEditingTabId(null);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                {runningCommands.has(tab.id) && (
                  <span className="tab-running-indicator" title="Command running">
                    ⏳ {formatElapsedTime(runningCommands.get(tab.id)!.elapsed)}
                  </span>
                )}
                {tab.customName || tab.title}
              </>
            )}
            <span
              className="close-tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </span>
          </div>
        ))}
        <div className="new-tab-button" onClick={createTab}>
          +
        </div>
        <div style={{ flex: 1 }} /> {/* Spacer */}
        <div className="top-segmented" role="group" aria-label="Top actions">
          <div
            className="segmented-button"
            onClick={openSSHPanelWindow}
            title="SSH Sessions (Cmd/Ctrl+Shift+O)"
          >
            SSH
          </div>
          <div
            className="segmented-button"
            onClick={openAIPanelWindow}
            title="Open AI Panel (Cmd/Ctrl+B)"
          >
            AI Panel
          </div>
          <div
            className="segmented-button"
            onClick={openQuickActionsWindow}
            title="Quick Actions"
          >
            Quick Actions
          </div>
          <div
            className="segmented-button"
            onClick={() => window.dispatchEvent(new CustomEvent('toggle-command-history'))}
            title="Command History (Cmd+R)"
          >
            History
          </div>
          <div 
            className="segmented-button"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings (Cmd+,)"
          >
            Settings
          </div>
        </div>
      </div>
      <div className="workbench" style={{ display: 'flex', height: '100%' }}>
        <div className="terminal-pane" style={{ flex: 1 }}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab-content ${tab.id === activeTabId ? "active" : ""}`}
              style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
            >
              <div 
                className={`split-container split-${tab.splitLayout}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: tab.splitLayout === 'vertical' 
                    ? `${tab.splitRatio}% 4px ${100 - tab.splitRatio}%` 
                    : '1fr',
                  gridTemplateRows: tab.splitLayout === 'horizontal' 
                    ? `${tab.splitRatio}% 4px ${100 - tab.splitRatio}%` 
                    : '1fr',
                  width: '100%',
                  height: '100%'
                }}
              >
                {tab.panes.map((pane, index) => (
                  <React.Fragment key={pane.id}>
                    <div
                      className={`terminal-wrapper ${pane.id === tab.focusedPaneId ? "focused" : ""}`}
                      onClick={() => setFocusedPane(tab.id, pane.id)}
                      style={{
                        border: pane.id === tab.focusedPaneId ? '2px solid #007acc' : '2px solid transparent',
                        borderRadius: '4px',
                        overflow: 'hidden',
                        position: 'relative'
                      }}
                    >
                      <Terminal 
                        id={pane.id} 
                        visible={tab.id === activeTabId}
                        onUpdateRemoteState={(isRemote, remoteHost) => updateTabRemoteState(tab.id, pane.id, isRemote, remoteHost)}
                        onClose={() => closePane(tab.id, pane.id)}
                        onCommandRunning={(isRunning, startTime) => handleCommandRunning(pane.id, isRunning, startTime)}
                      />
                    </div>
                    {index === 0 && tab.panes.length > 1 && (
                      <div
                        className={`split-divider split-divider-${tab.splitLayout}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          const container = e.currentTarget.parentElement;
                          if (!container) return;

                          const handleMouseMove = (e: MouseEvent) => {
                            const containerRect = container.getBoundingClientRect();
                            const containerStart = tab.splitLayout === 'vertical' ? containerRect.left : containerRect.top;
                            const containerSize = tab.splitLayout === 'vertical' ? containerRect.width : containerRect.height;
                            const currentPos = tab.splitLayout === 'vertical' ? e.clientX : e.clientY;
                            const newRatio = ((currentPos - containerStart) / containerSize) * 100;
                            updateSplitRatio(tab.id, newRatio);
                          };

                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                          };

                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                        }}
                      />
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function App() {
    return (
        <SettingsProvider>
            <AIProvider>
                <SSHProfilesProvider>
                    <AppContent />
                </SSHProfilesProvider>
            </AIProvider>
        </SettingsProvider>
    );
}

export default App;
