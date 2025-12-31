import React, { useState, useEffect, useCallback, useRef } from "react";
import Terminal from "./components/Terminal";
import AIPanel from "./components/AIPanel";
import SSHSessionWindow from "./components/SSHSessionWindow";
import OutputViewer from "./components/OutputViewer";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./context/SettingsContext";
import { AIProvider } from "./context/AIContext";
import { SSHProfilesProvider, useSSHProfiles } from "./context/SSHProfilesContext";
import { SSHProfile } from "./types/ssh";
import { connectSSHProfileNewTab, getProfileDisplayName } from "./utils/sshConnect";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo, listen } from "@tauri-apps/api/event";
import "./App.css";
import "./components/AIPanel.css";
import "./components/SSHSessionWindow.css";

interface Pane {
  id: number; // PTY ID
  isRemote?: boolean;
  remoteHost?: string;
}

interface Tab {
  id: number;
  title: string;
  customName?: string;
  panes: Pane[]; // Array of terminal panes in this tab
  focusedPaneId: number | null; // Which pane has focus
  splitLayout: 'single' | 'vertical' | 'horizontal'; // How panes are arranged
  splitRatio: number; // Split ratio (0-100, percentage for first pane)
}

function AppContent() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
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
  
  // Track running commands per tab: Map<ptyId, { startTime: number, elapsed: number }>
  const [runningCommands, setRunningCommands] = useState<Map<number, { startTime: number; elapsed: number }>>(new Map());
  const elapsedTimerRef = useRef<number | null>(null);
  
  let isAiWindow = false;
  let isSSHWindow = false;
  let isOutputViewer = false;
  try {
    isAiWindow = window.location.hash.startsWith("#/ai-panel");
    isSSHWindow = window.location.hash.startsWith("#/ssh-panel");
    isOutputViewer = window.location.hash.startsWith("#/output-viewer");
  } catch {
    isAiWindow = false;
    isSSHWindow = false;
    isOutputViewer = false;
  }

  const createTab = async () => {
    try {
      const id = await invoke<number>("spawn_pty");
      const newTab: Tab = {
        id,
        title: `Tab ${tabs.length + 1}`,
        panes: [{ id }],
        focusedPaneId: id,
        splitLayout: 'single',
        splitRatio: 50
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(id);
    } catch (error) {
      console.error("Failed to spawn PTY:", error);
    }
  };

  const connectSSHProfile = async (profile: SSHProfile) => {
    try {
      const ptyId = await connectSSHProfileNewTab(profile);
      const displayName = getProfileDisplayName(profile);
      
      const newTab: Tab = {
        id: ptyId,
        title: displayName,
        customName: profile.name,
        panes: [{ id: ptyId, isRemote: true, remoteHost: profile.sshConfigHost || profile.manualConfig?.hostname }],
        focusedPaneId: ptyId,
        splitLayout: 'single',
        splitRatio: 50
      };
      
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(ptyId);
      
      // Link PTY to Profile for health tracking
      setPtyToProfileMap(prev => new Map(prev).set(ptyId, profile.id));
      
      // Update connection state (keyed by ptyId)
      updateConnection(String(ptyId), {
        profileId: profile.id,
        tabId: String(ptyId),
        tabName: newTab.title,
        status: 'connecting',
        connectedAt: new Date(),
        lastActivity: new Date(),
      });
      
      // Broadcast to SSH window
      emitTo("ssh-panel", "connection-status-update", {
        ptyId: String(ptyId),
        profileId: profile.id,
        tabName: newTab.title,
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

  const handleGoToTab = useCallback((tabId: string) => {
    console.log('[Main Window] handleGoToTab called with tabId:', tabId);
    const ptyId = parseInt(tabId);
    console.log('[Main Window] Parsed ptyId:', ptyId);
    const tab = tabs.find(t => t.panes.some(p => p.id === ptyId));
    console.log('[Main Window] Found tab:', tab?.id, 'with panes:', tab?.panes.map(p => p.id));
    if (tab) {
      console.log('[Main Window] Switching to tab:', tab.id);
      setActiveTabId(tab.id);
    } else {
      console.log('[Main Window] No tab found for ptyId:', ptyId);
    }
  }, [tabs]);

  const renameTab = (id: number, newName: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, customName: newName || undefined } : tab
      )
    );
  };

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

  const updateTabRemoteState = (tabId: number, paneId: number, isRemote: boolean, remoteHost?: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? {
          ...tab,
          panes: tab.panes.map(pane =>
            pane.id === paneId ? { ...pane, isRemote, remoteHost } : pane
          )
        } : tab
      )
    );
  };

  const splitPane = async (tabId: number, direction: 'vertical' | 'horizontal') => {
    try {
      const newPtyId = await invoke<number>("spawn_pty");
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.id !== tabId) return tab;
          return {
            ...tab,
            panes: [...tab.panes, { id: newPtyId }],
            focusedPaneId: newPtyId,
            splitLayout: direction,
            splitRatio: 50
          };
        })
      );
    } catch (error) {
      console.error("Failed to spawn PTY for split:", error);
    }
  };

  const closePane = (tabId: number, paneId: number) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // If only one pane, close the whole tab
    if (tab.panes.length === 1) {
      closeTab(tabId);
      return;
    }

    // Update connection status for this pane
    const profileId = ptyToProfileMap.get(paneId);
    if (profileId) {
      updateConnection(String(paneId), {
        profileId,
        tabId: String(paneId),
        status: 'disconnected',
      });
      
      // Broadcast to SSH window
      emitTo("ssh-panel", "connection-status-update", {
        ptyId: String(paneId),
        profileId,
        status: 'disconnected',
        tabId: String(paneId),
      }).catch(() => {});
    }

    // Close PTY
    invoke("close_pty", { id: paneId }).catch((error) => {
      console.error("Failed to close PTY:", error);
    });

    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        const newPanes = t.panes.filter(p => p.id !== paneId);
        const newFocusedId = t.focusedPaneId === paneId
          ? newPanes[newPanes.length - 1]?.id
          : t.focusedPaneId;
        
        return {
          ...t,
          panes: newPanes,
          focusedPaneId: newFocusedId,
          splitLayout: newPanes.length === 1 ? 'single' as const : t.splitLayout
        };
      })
    );
  };

  const setFocusedPane = (tabId: number, paneId: number) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, focusedPaneId: paneId } : tab
      )
    );
  };

  const updateSplitRatio = (tabId: number, ratio: number) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, splitRatio: Math.max(10, Math.min(90, ratio)) } : tab
      )
    );
  };

  const reorderTabs = (fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const newTabs = [...prev];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      return newTabs;
    });
  };

  const closeTab = (tabId: number) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Update connection status to disconnected for all panes
    tab.panes.forEach(pane => {
      const profileId = ptyToProfileMap.get(pane.id);
      if (profileId) {
        updateConnection(String(pane.id), {
          profileId,
          tabId: String(pane.id),
          status: 'disconnected',
        });
        
        // Broadcast to SSH window
        emitTo("ssh-panel", "connection-status-update", {
          ptyId: String(pane.id),
          profileId,
          status: 'disconnected',
          tabId: String(pane.id),
        }).catch(() => {});
      }
    });

    // Close all PTYs in all panes
    tab.panes.forEach(pane => {
      invoke("close_pty", { id: pane.id }).catch((error) => {
        console.error("Failed to close PTY:", error);
      });
    });

    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== tabId);

      setActiveTabId((prevActive) => {
        if (newTabs.length === 0) {
          return null;
        }
        // If we're closing the active tab, switch to the last tab
        if (prevActive === tabId) {
          return newTabs[newTabs.length - 1].id;
        }
        return prevActive;
      });

      if (isInitialized && newTabs.length === 0) {
        const currentWindow = getCurrentWindow();
        currentWindow.close().catch((err) => {
          console.error("Failed to close window", err);
        });
      }

      return newTabs;
    });
  };

  useEffect(() => {
    createTab().then(() => setIsInitialized(true));
  }, []);

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
    if (isAiWindow || isSSHWindow || isOutputViewer) return; // Only run in main window

    // Listen for SSH connection events from SSH window
    const unlistenConnect = listen<{ profile: SSHProfile }>("ssh:connect", async (event) => {
      await connectSSHProfile(event.payload.profile);
    });

    const unlistenNewTab = listen<{ profile: SSHProfile }>("ssh:connect-new-tab", async (event) => {
      await connectSSHProfile(event.payload.profile);
    });

    const unlistenGoToTab = listen<{ ptyId: string }>("ssh:goto-tab", (event) => {
      console.log('[Main Window] Received ssh:goto-tab event:', event.payload);
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
    if (isAiWindow) return;
    // Best-effort: keep detached AI panel aware of the current active terminal pane.
    const activeTab = tabs.find(t => t.id === activeTabId);
    const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;
    emitTo("ai-panel", "ai-panel:active-terminal", { id: focusedPaneId }).catch(() => {});
  }, [activeTabId, tabs, isAiWindow]);

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

  if (isOutputViewer) {
    return <OutputViewer />;
  }

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
        <div
          className="ssh-panel-button"
          onClick={openSSHPanelWindow}
          title="SSH Sessions (Cmd/Ctrl+Shift+O)"
        >
          📡 SSH
        </div>
        <div
          className="ai-panel-button"
          onClick={openAIPanelWindow}
          title="Open AI Panel (Cmd/Ctrl+B)"
        >
          AI Panel
        </div>
        <div 
            className="settings-button" 
            onClick={() => setIsSettingsOpen(true)}
            title="Settings (Cmd+,)"
        >
            Settings
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
