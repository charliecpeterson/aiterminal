import React, { useState, useEffect } from "react";
import Terminal from "./components/Terminal";
import AIPanel from "./components/AIPanel";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./context/SettingsContext";
import { AIProvider } from "./context/AIContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo, listen } from "@tauri-apps/api/event";
import "./App.css";
import "./components/AIPanel.css";

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
  
  let isAiWindow = false;
  try {
    isAiWindow = window.location.hash.startsWith("#/ai-panel");
  } catch {
    isAiWindow = false;
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

  const renameTab = (id: number, newName: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, customName: newName || undefined } : tab
      )
    );
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
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, tabs]);

  // No resizing or attach/detach logic needed for separate window mode

  useEffect(() => {
    if (isAiWindow) return; // Only run in main window
    
    // Close AI Panel window when main window closes
    const currentWindow = getCurrentWindow();
    const unlistenPromise = currentWindow.onCloseRequested(async () => {
      const aiPanel = await WebviewWindow.getByLabel("ai-panel").catch(() => null);
      if (aiPanel) {
        await aiPanel.close().catch(() => {});
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow]);

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
        <SettingsProvider>
          <AIProvider>
            <AIPanel
              activeTerminalId={mainActiveTabId}
            />
          </AIProvider>
        </SettingsProvider>
      </div>
    );
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
              tab.customName || tab.title
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
      <div className="workbench">
        <div className="terminal-pane">
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
                <AppContent />
            </AIProvider>
        </SettingsProvider>
    );
}

export default App;
