import { useState, useEffect } from "react";
import Terminal from "./components/Terminal";
import SettingsModal from "./components/SettingsModal";
import { SettingsProvider } from "./context/SettingsContext";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

interface Tab {
  id: number;
  title: string;
}

function AppContent() {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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
    invoke("close_pty", { id });
    setTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== id);
      // If we closed the active tab, switch to the last one
      if (activeTabId === id && newTabs.length > 0) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
      return newTabs;
    });
  };

  useEffect(() => {
    createTab().then(() => setIsInitialized(true));
  }, []);

  useEffect(() => {
    if (isInitialized && tabs.length === 0) {
        getCurrentWindow().close();
    }
  }, [tabs, isInitialized]);

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
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId]);

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
            className="settings-button" 
            onClick={() => setIsSettingsOpen(true)}
            title="Settings (Cmd+,)"
        >
            ⚙️
        </div>
      </div>
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
