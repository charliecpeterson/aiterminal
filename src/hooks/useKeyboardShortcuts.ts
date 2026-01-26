import { useEffect } from "react";
import type { Tab } from "./useTabManagement";

interface UseKeyboardShortcutsProps {
  activeTabId: number | null;
  tabs: Tab[];
  createTab: () => Promise<void>;
  closeTab: (id: number) => void;
  closePane: (tabId: number, paneId: number) => void;
  splitPane: (tabId: number, direction: 'horizontal' | 'vertical') => void;
  setFocusedPane: (tabId: number, paneId: number) => void;
  setIsSettingsOpen: (value: boolean) => void;
  openAIPanelWindow: (data: { activeTabId: number | null; tabs: Tab[] }) => void;
  openSSHPanelWindow: () => void;
}

/**
 * Hook to handle keyboard shortcuts for the application
 */
export function useKeyboardShortcuts(props: UseKeyboardShortcutsProps): void {
  const {
    activeTabId,
    tabs,
    createTab,
    closeTab,
    closePane,
    splitPane,
    setFocusedPane,
    setIsSettingsOpen,
    openAIPanelWindow,
    openSSHPanelWindow,
  } = props;

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
  }, [activeTabId, tabs, createTab, closeTab, closePane, splitPane, setFocusedPane, setIsSettingsOpen, openAIPanelWindow, openSSHPanelWindow]);
}
