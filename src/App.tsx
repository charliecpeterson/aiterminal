import { useState, useEffect } from "react";
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

interface Tab {
  id: number;
  title: string;
  customName?: string; // User-defined name
  isRemote?: boolean; // Track if terminal is SSH'd
  remoteHost?: string; // Remote host info
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
      setTabs((prev) => [...prev, { id, title: `Tab ${prev.length + 1}` }]);
      setActiveTabId(id);
    } catch (error) {
      console.error("Failed to spawn PTY:", error);
      // Show user-visible error in a future error toast/notification system
    }
  };

  const renameTab = (id: number, newName: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, customName: newName || undefined } : tab
      )
    );
  };

  const updateTabRemoteState = (id: number, isRemote: boolean, remoteHost?: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, isRemote, remoteHost } : tab
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

  const closeTab = (id: number) => {
    invoke("close_pty", { id }).catch((error) => {
      console.error("Failed to close PTY:", error);
    });
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== id);

      setActiveTabId((prevActive) => {
        if (newTabs.length === 0) {
          return null;
        }
        if (prevActive === id) {
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
          if (activeTabId !== null) {
              closeTab(activeTabId);
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
  }, [activeTabId]);

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
    // Best-effort: keep detached AI panel aware of the current active terminal.
    emitTo("ai-panel", "ai-panel:active-terminal", { id: activeTabId }).catch(() => {});
  }, [activeTabId, isAiWindow]);

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
      emitTo("ai-panel", "ai-panel:active-terminal", { id: activeTabId }).catch(() => {});
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
          <div className="terminal-container">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`terminal-wrapper ${tab.id === activeTabId ? "active" : ""}`}
              >
                <Terminal 
                    id={tab.id} 
                    visible={tab.id === activeTabId}
                    onUpdateRemoteState={(isRemote, remoteHost) => updateTabRemoteState(tab.id, isRemote, remoteHost)}
                    onClose={() => closeTab(tab.id)} 
                />
              </div>
            ))}
          </div>
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
