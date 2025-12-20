import { useState, useEffect } from "react";
import Terminal from "./components/Terminal";
import AIPanel from "./components/AIPanel";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./context/SettingsContext";
import { AIProvider } from "./context/AIContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, emitTo, listen } from "@tauri-apps/api/event";
import "./App.css";
import "./components/AIPanel.css";

interface Tab {
  id: number;
  title: string;
  customName?: string; // User-defined name
}

function AppContent() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [mainActiveTabId, setMainActiveTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(true);
  const [isAiDetached, setIsAiDetached] = useState(false);
  const [isAiAttaching, setIsAiAttaching] = useState(false);
  const [aiWidth, setAiWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
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

  const reorderTabs = (fromIndex: number, toIndex: number) => {
    console.log('Reordering tabs from', fromIndex, 'to', toIndex);
    setTabs((prev) => {
      const newTabs = [...prev];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      console.log('New tab order:', newTabs.map(t => t.title));
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
          setIsAiOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId]);

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (event: MouseEvent) => {
      const nextWidth = Math.min(
        720,
        Math.max(280, window.innerWidth - event.clientX)
      );
      setAiWidth(nextWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) return;
    const id = requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => cancelAnimationFrame(id);
  }, [aiWidth, isAiOpen, isResizing]);

  useEffect(() => {
    document.body.classList.toggle("ai-resizing", isResizing);
    return () => document.body.classList.remove("ai-resizing");
  }, [isResizing]);

  useEffect(() => {
    if (isAiDetached && isAiOpen) {
      setIsAiOpen(false);
    }
  }, [isAiDetached, isAiOpen]);

  useEffect(() => {
    if (isAiWindow) return;
    const unlistenPromise = listen("ai-panel:attach-request", async () => {
      setIsAiDetached(false);
      setIsAiOpen(true);
      emitTo("ai-panel", "ai-panel:attach-ack", null).catch((err) => {
        console.error("Failed to emit attach ack:", err);
      });
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
        <AIPanel
          mode="detached"
          activeTerminalId={mainActiveTabId}
          onAttach={async () => {
            if (isAiAttaching) {
              return;
            }
            setIsAiAttaching(true);
            let unlisten: (() => void) | null = null;
            let resolveAck: (() => void) | null = null;
            const ackPromise = new Promise<void>((resolve) => {
              resolveAck = resolve;
            });
            const handler = () => {
              if (unlisten) {
                unlisten();
              }
              if (resolveAck) {
                resolveAck();
              }
            };
            try {
              unlisten = await listen("ai-panel:attach-ack", handler);
            } catch (err) {
              console.error("[ai-panel] failed to listen for attach ack:", err);
            }
            if (!unlisten) {
              setIsAiAttaching(false);
              return;
            }
            await emit("ai-panel:attach-request", null);
            try {
              await ackPromise;
              try {
                const currentWindow = getCurrentWindow();
                await currentWindow.destroy();
              } catch (err) {
                console.error("[ai-panel] failed to destroy detached window:", err);
              }
            } catch (err) {
              console.error("[ai-panel] attach-ack failed:", err);
            } finally {
              setIsAiAttaching(false);
            }
          }}
        />
      </div>
    );
  }

  const detachPanel = async () => {
    const existing = await WebviewWindow.getByLabel("ai-panel");
    if (existing) {
      await existing.setFocus();
      setIsAiDetached(true);
      setIsAiOpen(false);
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
      setIsAiDetached(false);
      setIsAiOpen(true);
    });
    panelWindow.once("tauri://close-requested", () => {
      setIsAiDetached(false);
      setIsAiOpen(true);
    });
    panelWindow.once("tauri://destroyed", () => {
      setIsAiDetached(false);
      setIsAiOpen(true);
    });
    setIsAiDetached(true);
    setIsAiOpen(false);
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
          onClick={() => setIsAiOpen((prev) => !prev)}
          title="Toggle AI Panel (Cmd/Ctrl+B)"
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
                    onClose={() => closeTab(tab.id)} 
                />
              </div>
            ))}
          </div>
        </div>
        {isAiOpen && !isAiDetached && (
          <>
            <div
              className="ai-resizer"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizing(true);
              }}
            />
            <div className="ai-pane" style={{ width: aiWidth }}>
              <AIPanel
                onClose={() => setIsAiOpen(false)}
                onDetach={detachPanel}
                activeTerminalId={activeTabId}
              />
            </div>
          </>
        )}
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
