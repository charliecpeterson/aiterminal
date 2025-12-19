import { useState, useEffect } from "react";
import Terminal from "./components/Terminal";
import AIPanel from "./components/AIPanel";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./context/SettingsContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import "./components/AIPanel.css";

interface Tab {
  id: number;
  title: string;
}

function AppContent() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(true);
  const [aiWidth, setAiWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);

  const createTab = async () => {
    try {
      const id = await invoke<number>("spawn_pty");
      setTabs((prev) => [...prev, { id, title: `Tab ${prev.length + 1}` }]);
      setActiveTabId(id);
    } catch (e) {
      console.error("Failed to spawn PTY", e);
    }
  };

  const closeTab = (id: number) => {
    invoke("close_pty", { id }).catch((e) => {
      console.error("Failed to close PTY", e);
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

  return (
    <div className="app-container">
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <div className="tabs-header">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? "active" : ""}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.title}
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
            ⚙️
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
        {isAiOpen && (
          <>
            <div
              className="ai-resizer"
              onMouseDown={(event) => {
                event.preventDefault();
                setIsResizing(true);
              }}
            />
            <div className="ai-pane" style={{ width: aiWidth }}>
              <AIPanel onClose={() => setIsAiOpen(false)} />
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
            <AppContent />
        </SettingsProvider>
    );
}

export default App;
