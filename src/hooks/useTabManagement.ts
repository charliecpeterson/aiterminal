import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emitTo } from '@tauri-apps/api/event';

export interface Pane {
  id: number; // PTY ID
  isRemote?: boolean;
  remoteHost?: string;
}

export interface Tab {
  id: number;
  title: string;
  customName?: string;
  panes: Pane[];
  focusedPaneId: number | null;
  splitLayout: 'single' | 'vertical' | 'horizontal';
  splitRatio: number;
}

interface UseTabManagementReturn {
  tabs: Tab[];
  activeTabId: number | null;
  setActiveTabId: (id: number | null) => void;
  createTab: () => Promise<void>;
  closeTab: (tabId: number) => void;
  renameTab: (id: number, newName: string) => void;
  reorderTabs: (fromIndex: number, toIndex: number) => void;
  splitPane: (tabId: number, direction: 'vertical' | 'horizontal') => Promise<void>;
  closePane: (tabId: number, paneId: number) => void;
  setFocusedPane: (tabId: number, paneId: number) => void;
  updateSplitRatio: (tabId: number, ratio: number) => void;
  updateTabRemoteState: (tabId: number, paneId: number, isRemote: boolean, remoteHost?: string) => void;
  addSSHTab: (ptyId: number, displayName: string, profileId: string) => void;
}

export function useTabManagement(
  isInitialized: boolean,
  ptyToProfileMap: Map<number, string>,
  updateConnection: (ptyId: string, data: any) => void
): UseTabManagementReturn {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  const createTab = useCallback(async () => {
    try {
      const id = await invoke<number>("spawn_pty");
      setTabs((prev) => {
        const newTab: Tab = {
          id,
          title: `Tab ${prev.length + 1}`,
          panes: [{ id }],
          focusedPaneId: id,
          splitLayout: 'single',
          splitRatio: 50
        };
        return [...prev, newTab];
      });
      setActiveTabId(id);
    } catch (error) {
      console.error("Failed to spawn PTY:", error);
    }
  }, []);

  const addSSHTab = useCallback((ptyId: number, displayName: string, _profileId: string) => {
    setTabs((prev) => {
      const newTab: Tab = {
        id: ptyId,
        title: displayName,
        panes: [{ id: ptyId, isRemote: true, remoteHost: displayName }],
        focusedPaneId: ptyId,
        splitLayout: 'single',
        splitRatio: 50
      };
      return [...prev, newTab];
    });
    setActiveTabId(ptyId);
  }, []);

  const closeTab = useCallback((tabId: number) => {
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
  }, [tabs, ptyToProfileMap, updateConnection, isInitialized]);

  const renameTab = useCallback((id: number, newName: string) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, customName: newName, title: newName } : tab
      )
    );
  }, []);

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs((prev) => {
      const newTabs = [...prev];
      const [movedTab] = newTabs.splice(fromIndex, 1);
      newTabs.splice(toIndex, 0, movedTab);
      return newTabs;
    });
  }, []);

  const splitPane = useCallback(async (tabId: number, direction: 'vertical' | 'horizontal') => {
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
  }, []);

  const closePane = useCallback((tabId: number, paneId: number) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    if (tab.panes.length === 1) {
      closeTab(tabId);
      return;
    }

    const profileId = ptyToProfileMap.get(paneId);
    if (profileId) {
      updateConnection(String(paneId), {
        profileId,
        tabId: String(paneId),
        status: 'disconnected',
      });
      
      emitTo("ssh-panel", "connection-status-update", {
        ptyId: String(paneId),
        profileId,
        status: 'disconnected',
        tabId: String(paneId),
      }).catch(() => {});
    }

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
  }, [tabs, ptyToProfileMap, updateConnection, closeTab]);

  const setFocusedPane = useCallback((tabId: number, paneId: number) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, focusedPaneId: paneId } : tab
      )
    );
  }, []);

  const updateSplitRatio = useCallback((tabId: number, ratio: number) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, splitRatio: Math.max(10, Math.min(90, ratio)) } : tab
      )
    );
  }, []);

  const updateTabRemoteState = useCallback((tabId: number, paneId: number, isRemote: boolean, remoteHost?: string) => {
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
  }, []);

  return {
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
  };
}
