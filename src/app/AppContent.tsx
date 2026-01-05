import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import Terminal from "../components/Terminal";
import type { QuickAction } from "../components/QuickActionsWindow";
import { useSSHProfiles } from "../context/SSHProfilesContext";
import type { SSHProfile } from "../types/ssh";
import { useTabManagement } from "../hooks/useTabManagement";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo, listen } from "@tauri-apps/api/event";

const LazyAIPanel = React.lazy(() => import('../components/AIPanel'));
const LazySettingsModal = React.lazy(() => import('../components/SettingsModal'));
const LazySSHSessionWindow = React.lazy(() => import("../components/SSHSessionWindow"));
const LazyQuickActionsWindow = React.lazy(() => import("../components/QuickActionsWindow"));
const LazyPreviewWindow = React.lazy(() => import("../components/PreviewWindow"));
const LazyOutputViewer = React.lazy(() => import("../components/OutputViewer"));

export default function AppContent() {
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
  const [runningCommands, setRunningCommands] = useState<
    Map<number, { startTime: number; elapsed: number }>
  >(new Map());
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

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const handleGoToTab = useCallback(
    (tabId: string) => {
      const ptyId = parseInt(tabId);
      const tab = tabsRef.current.find(t => t.panes.some(p => p.id === ptyId));
      if (tab) {
        setActiveTabId(tab.id);
      }
    },
    [setActiveTabId]
  );

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

  const connectSSHProfile = useCallback(async (profile: SSHProfile) => {
    try {
      const { connectSSHProfileNewTab, getProfileDisplayName } = await import('../utils/sshConnect');
      const ptyId = await connectSSHProfileNewTab(profile);
      const displayName = getProfileDisplayName(profile);

      addSSHTab(ptyId, displayName, profile.id);
      setPtyToProfileMap(prev => new Map(prev).set(ptyId, profile.id));

      updateConnection(String(ptyId), {
        profileId: profile.id,
        tabId: String(ptyId),
        tabName: displayName,
        status: 'connecting',
        connectedAt: new Date(),
        lastActivity: new Date(),
      });

      emitTo('ssh-panel', 'connection-status-update', {
        ptyId: String(ptyId),
        profileId: profile.id,
        tabName: displayName,
        status: 'connecting',
        tabId: String(ptyId),
      }).catch(() => {});

      await updateProfile(profile.id, {
        lastConnectedAt: new Date().toISOString(),
        connectionCount: (profile.connectionCount || 0) + 1,
      });
    } catch (error) {
      console.error('Failed to connect SSH profile:', error);
    }
  }, [addSSHTab, updateConnection, updateProfile]);

  // Monitor connection health for SSH sessions (loaded on-demand).
  useEffect(() => {
    if (ptyToProfileMap.size === 0) return;

    let cleanup: null | (() => void) = null;
    import('../app/sshIntegration')
      .then(({ setupSshHealthMonitor }) => {
        cleanup = setupSshHealthMonitor({
          getPtyToProfileEntries: () => Array.from(ptyToProfileMap.entries()),
          getTabs: () => tabs,
          updateConnection,
        });
      })
      .catch((err) => {
        console.warn('Failed to load SSH health monitor:', err);
      });

    return () => {
      cleanup?.();
    };
  }, [ptyToProfileMap, tabs, updateConnection]);

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
        if (e.key === 't') {
          e.preventDefault();
          createTab();
        } else if (e.key === 'w') {
          e.preventDefault();
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && activeTab.focusedPaneId) {
            closePane(activeTabId!, activeTab.focusedPaneId);
          } else if (activeTabId !== null) {
            closeTab(activeTabId);
          }
        } else if (e.key === 'd') {
          e.preventDefault();
          if (activeTabId !== null) {
            const direction = e.shiftKey ? 'horizontal' : 'vertical';
            splitPane(activeTabId, direction);
          }
        } else if (e.key === '[') {
          e.preventDefault();
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && activeTab.panes.length > 1) {
            const currentIndex = activeTab.panes.findIndex(p => p.id === activeTab.focusedPaneId);
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : activeTab.panes.length - 1;
            setFocusedPane(activeTabId!, activeTab.panes[prevIndex].id);
          }
        } else if (e.key === ']') {
          e.preventDefault();
          const activeTab = tabs.find(t => t.id === activeTabId);
          if (activeTab && activeTab.panes.length > 1) {
            const currentIndex = activeTab.panes.findIndex(p => p.id === activeTab.focusedPaneId);
            const nextIndex = (currentIndex + 1) % activeTab.panes.length;
            setFocusedPane(activeTabId!, activeTab.panes[nextIndex].id);
          }
        } else if (e.key === ',') {
          e.preventDefault();
          setIsSettingsOpen(true);
        } else if (e.key === 'b') {
          e.preventDefault();
          openAIPanelWindow();
        } else if (e.key === 'o' && e.shiftKey) {
          e.preventDefault();
          openSSHPanelWindow();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (isAiWindow) return;

    const currentWindow = getCurrentWindow();
    const unlistenPromise = currentWindow.onCloseRequested(async () => {
      const aiPanel = await WebviewWindow.getByLabel('ai-panel').catch(() => null);
      if (aiPanel) {
        await aiPanel.close().catch(() => {});
      }
      const sshPanel = await WebviewWindow.getByLabel('ssh-panel').catch(() => null);
      if (sshPanel) {
        await sshPanel.close().catch(() => {});
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow]);

  useEffect(() => {
    if (isAiWindow || isSSHWindow || isOutputViewer || isQuickActionsWindow) return;

    let cleanup: null | (() => void) = null;
    import('../app/sshIntegration')
      .then(({ setupSshMainWindowListeners }) => {
        cleanup = setupSshMainWindowListeners({
          connectSSHProfile,
          handleGoToTab,
          getPtyToProfileEntries: () => Array.from(ptyToProfileMap.entries()),
        });
      })
      .catch((err) => {
        console.warn('Failed to load SSH main window listeners:', err);
      });

    return () => {
      cleanup?.();
    };
  }, [isAiWindow, isSSHWindow, isOutputViewer, isQuickActionsWindow, connectSSHProfile, handleGoToTab, ptyToProfileMap]);

  useEffect(() => {
    if (!isAiWindow) return;
    const unlistenPromise = listen<{ id: number | null }>('ai-panel:active-terminal', (event) => {
      setMainActiveTabId(event.payload?.id ?? null);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow]);

  useEffect(() => {
    if (!isQuickActionsWindow) return;
    const unlistenPromise = listen<{ id: number | null }>('quick-actions:active-terminal', (event) => {
      setMainActiveTabId(event.payload?.id ?? null);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isQuickActionsWindow]);

  useEffect(() => {
    if (isAiWindow || isQuickActionsWindow) return;
    const activeTab = tabs.find(t => t.id === activeTabId);
    const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;
    emitTo('ai-panel', 'ai-panel:active-terminal', { id: focusedPaneId }).catch(() => {});
    emitTo('quick-actions', 'quick-actions:active-terminal', { id: focusedPaneId }).catch(() => {});
  }, [activeTabId, tabs, isAiWindow, isQuickActionsWindow]);

  const waitForCommandComplete = (ptyId: number): Promise<void> => {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!runningCommands.has(ptyId)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 10 * 60 * 1000);
    });
  };

  const executeQuickAction = async (action: QuickAction) => {
    let activePty: number | null = null;

    if (isQuickActionsWindow) {
      activePty = mainActiveTabId;
      if (activePty === null || activePty === undefined) {
        await new Promise(resolve => setTimeout(resolve, 100));
        activePty = mainActiveTabId;
      }
    } else {
      activePty = tabs.find(t => t.id === activeTabId)?.focusedPaneId || activeTabId;
    }

    if (activePty === null || activePty === undefined) {
      console.error('No active terminal - mainActiveTabId:', mainActiveTabId, 'activeTabId:', activeTabId);
      alert('No active terminal found. Please make sure a terminal is active in the main window and try again.');
      return;
    }

    for (let i = 0; i < action.commands.length; i++) {
      const command = action.commands[i];

      try {
        await invoke('write_to_pty', {
          id: activePty,
          data: command + '\r'
        });

        await waitForCommandComplete(activePty);
      } catch (error) {
        console.error(`[Quick Action: ${action.name}] Failed to execute command: ${command}`, error);
      }
    }
  };

  const openAIPanelWindow = async () => {
    const existing = await WebviewWindow.getByLabel('ai-panel');
    if (existing) {
      await existing.close().catch(() => {});
      return;
    }

    const aiWindow = new WebviewWindow('ai-panel', {
      title: 'AI Panel',
      width: 400,
      height: 600,
      resizable: true,
      url: '/#/ai-panel',
    });

    aiWindow.once('tauri://created', async () => {
      aiWindow.setFocus().catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 200));

      const activeTab = tabs.find(t => t.id === activeTabId);
      const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;

      await emitTo('ai-panel', 'ai-panel:active-terminal', { id: focusedPaneId }).catch(() => {});
    });

    aiWindow.once('tauri://error', (event) => {
      console.error('AI panel window error:', event);
    });
  };

  const openQuickActionsWindow = async () => {
    const existing = await WebviewWindow.getByLabel('quick-actions');
    if (existing) {
      await existing.close().catch(() => {});
      return;
    }

    const qaWindow = new WebviewWindow('quick-actions', {
      title: 'Quick Actions',
      width: 400,
      height: 600,
      resizable: true,
      url: '/#/quick-actions',
    });

    qaWindow.once('tauri://created', async () => {
      qaWindow.setFocus().catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 200));

      const activeTab = tabs.find(t => t.id === activeTabId);
      const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;

      await emitTo('quick-actions', 'quick-actions:active-terminal', { id: focusedPaneId }).catch(() => {});
    });

    qaWindow.once('tauri://error', (event) => {
      console.error('Quick Actions window error:', event);
    });
  };

  const openSSHPanelWindow = async () => {
    const existing = await WebviewWindow.getByLabel('ssh-panel');
    if (existing) {
      await existing.close().catch(() => {});
      return;
    }

    const sshWindow = new WebviewWindow('ssh-panel', {
      title: 'SSH Sessions',
      width: 350,
      height: 600,
      resizable: true,
      url: '/#/ssh-panel',
    });

    sshWindow.once('tauri://created', () => {
      sshWindow.setFocus().catch(() => {});
    });

    sshWindow.once('tauri://error', (event) => {
      console.error('SSH panel window error:', event);
    });
  };

  if (isAiWindow) {
    return (
      <div className="ai-window">
        <Suspense fallback={null}>
          <LazyAIPanel activeTerminalId={mainActiveTabId} />
        </Suspense>
      </div>
    );
  }

  if (isSSHWindow) {
    return (
      <div className="ssh-window">
        <Suspense fallback={null}>
          <LazySSHSessionWindow />
        </Suspense>
      </div>
    );
  }

  if (isQuickActionsWindow) {
    return (
      <div className="quick-actions-window-wrapper">
        <Suspense fallback={null}>
          <LazyQuickActionsWindow
            onClose={async () => {
              const window = await WebviewWindow.getByLabel('quick-actions');
              await window?.close();
            }}
            onExecute={executeQuickAction}
          />
        </Suspense>
      </div>
    );
  }

  if (isPreviewWindow) {
    return (
      <Suspense fallback={null}>
        <LazyPreviewWindow />
      </Suspense>
    );
  }

  if (isOutputViewer) {
    return (
      <Suspense fallback={null}>
        <LazyOutputViewer />
      </Suspense>
    );
  }

  return (
    <div className="app-container">
      <Suspense fallback={null}>
        {isSettingsOpen && (
          <LazySettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        )}
      </Suspense>
      <div className="tabs-header">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''} ${isDragging && draggedTabIndex === index ? 'dragging' : ''}`}
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
                  if (e.key === 'Enter') {
                    renameTab(tab.id, e.currentTarget.value);
                    setEditingTabId(null);
                  } else if (e.key === 'Escape') {
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
            <button
              className="close-tab"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button className="new-tab-button" onClick={() => createTab()}>
          +
        </button>
      </div>

      <div className="main-content">
        <div className="toolbar">
          <button className="settings-button" onClick={() => setIsSettingsOpen(true)}>
            Settings
          </button>
          <button className="ai-panel-button" onClick={openAIPanelWindow}>
            AI Panel
          </button>
          <button className="quick-actions-button" onClick={openQuickActionsWindow}>
            Quick Actions
          </button>
          <button className="ssh-panel-button" onClick={openSSHPanelWindow}>
            SSH
          </button>
        </div>

        <div className="tabs-content">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab-content ${tab.id === activeTabId ? 'active' : ''}`}
              style={{ display: tab.id === activeTabId ? 'flex' : 'none' }}
            >
              <div
                className={`split-container split-${tab.splitLayout}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    tab.splitLayout === 'vertical'
                      ? `${tab.splitRatio}% 4px ${100 - tab.splitRatio}%`
                      : '1fr',
                  gridTemplateRows:
                    tab.splitLayout === 'horizontal'
                      ? `${tab.splitRatio}% 4px ${100 - tab.splitRatio}%`
                      : '1fr',
                  width: '100%',
                  height: '100%'
                }}
              >
                {tab.panes.map((pane, index) => (
                  <React.Fragment key={pane.id}>
                    <div
                      className={`terminal-wrapper ${pane.id === tab.focusedPaneId ? 'focused' : ''}`}
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
                        onUpdateRemoteState={(isRemote, remoteHost) =>
                          updateTabRemoteState(tab.id, pane.id, isRemote, remoteHost)
                        }
                        onClose={() => closePane(tab.id, pane.id)}
                        onCommandRunning={(isRunning, startTime) =>
                          handleCommandRunning(pane.id, isRunning, startTime)
                        }
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
                            const containerStart =
                              tab.splitLayout === 'vertical' ? containerRect.left : containerRect.top;
                            const containerSize =
                              tab.splitLayout === 'vertical' ? containerRect.width : containerRect.height;
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
