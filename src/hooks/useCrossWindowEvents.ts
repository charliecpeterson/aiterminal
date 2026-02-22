/**
 * Hook for managing cross-window event communication
 * Handles syncing state between main window and auxiliary windows (AI Panel, SSH Panel, Quick Actions)
 */

import { useEffect, useRef } from 'react';
import { listen, emitTo } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../utils/logger';
import { SSHProfile } from '../types/ssh';

const log = createLogger('CrossWindowEvents');

interface Tab {
  id: number;
  focusedPaneId: number | null;
  panes: Array<{ id: number }>;
  customName?: string;
  title: string;
}

interface UseCrossWindowEventsOptions {
  isAiWindow: boolean;
  isSSHWindow: boolean;
  isOutputViewer: boolean;
  isQuickActionsWindow: boolean;
  tabs: Tab[];
  activeTabId: number | null;
  ptyToProfileMap: Map<number, string>;
  onMainActiveTabIdChange?: (id: number | null) => void;
  onGoToTab?: (tabId: string) => void;
  onConnectSSHProfile?: (profile: SSHProfile) => Promise<void>;
}

/**
 * Sets up cross-window event listeners and emitters
 */
export function useCrossWindowEvents(options: UseCrossWindowEventsOptions) {
  const {
    isAiWindow,
    isSSHWindow,
    isOutputViewer,
    isQuickActionsWindow,
    tabs,
    activeTabId,
    ptyToProfileMap,
    onMainActiveTabIdChange,
    onGoToTab,
    onConnectSSHProfile,
  } = options;
  
  // Use refs to avoid stale closures
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  
  // Update refs when props change
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  // Listen for active terminal updates in AI window
  useEffect(() => {
    if (!isAiWindow) return;

    log.info('[AI Panel] Setting up terminal ID listener');

    const unlistenPromise = listen<{ id: number | null }>("ai-panel:active-terminal", (event) => {
      const terminalId = event.payload?.id ?? null;
      log.info('[AI Panel] Received terminal ID event:', { terminalId, payload: event.payload });

      // Terminal ID 0 is valid (it's the first terminal)
      // Only reject null/undefined
      if (terminalId !== null && terminalId !== undefined) {
        log.info('[AI Panel] Updating terminal ID to:', terminalId);
        onMainActiveTabIdChange?.(terminalId);

        // Update Rust backend's active terminal so AI tools can query it
        invoke('focus_terminal', { id: terminalId })
          .then(() => {
            log.info('[AI Panel] Successfully set active terminal in Rust backend:', terminalId);
          })
          .catch((err) => {
            log.error('[AI Panel] Failed to set active terminal in Rust backend:', err);
          });
      } else {
        log.warn('[AI Panel] Ignoring invalid terminal ID:', terminalId);
      }
    });

    // Request initial state from main window
    log.info('[AI Panel] Requesting initial terminal ID from main window');
    emitTo("main", "ai-panel:request-active-terminal", {})
      .then(() => {
        log.info('[AI Panel] Successfully sent terminal ID request to main window');
      })
      .catch((err) => {
        log.error('[AI Panel] Failed to request initial terminal ID:', err);
      });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow, onMainActiveTabIdChange]);

  // Listen for active terminal updates in Quick Actions window
  useEffect(() => {
    if (!isQuickActionsWindow) return;

    const unlistenPromise = listen<{ id: number | null }>("quick-actions:active-terminal", (event) => {
      const terminalId = event.payload?.id ?? null;
      onMainActiveTabIdChange?.(terminalId);

      // Update Rust backend's active terminal so AI tools can query it
      if (terminalId !== null && terminalId !== undefined) {
        invoke('focus_terminal', { id: terminalId }).catch((err) => {
          log.warn('Quick Actions failed to set active terminal in Rust backend:', err);
        });
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isQuickActionsWindow, onMainActiveTabIdChange]);

  // Broadcast active terminal changes from main window
  useEffect(() => {
    if (isAiWindow || isQuickActionsWindow) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || activeTabId;

    log.info('[Main Window] Broadcasting terminal ID:', {
      activeTabId,
      focusedPaneId,
      activeTab: activeTab ? { id: activeTab.id, focusedPaneId: activeTab.focusedPaneId, panes: activeTab.panes } : null
    });

    emitTo("ai-panel", "ai-panel:active-terminal", { id: focusedPaneId })
      .then(() => {
        log.info('[Main Window] Successfully sent terminal ID to AI panel:', focusedPaneId);
      })
      .catch((err) => {
        log.warn('[Main Window] Failed to notify AI panel of active terminal:', err);
      });

    emitTo("quick-actions", "quick-actions:active-terminal", { id: focusedPaneId }).catch((err) => {
      log.debug('Failed to notify quick actions of active terminal', err);
    });
  }, [activeTabId, tabs, isAiWindow, isQuickActionsWindow]);
  
  // Listen for requests for current active terminal (when AI panel opens)
  useEffect(() => {
    if (isAiWindow || isQuickActionsWindow) return;

    const unlistenPromise = listen<object>("ai-panel:request-active-terminal", () => {
      // Read current values from refs to avoid stale closures
      const currentActiveTabId = activeTabIdRef.current;
      const currentTabs = tabsRef.current;

      const activeTab = currentTabs.find(t => t.id === currentActiveTabId);
      const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || currentActiveTabId;

      log.info('[Main Window] AI Panel requested current terminal, responding with:', {
        currentActiveTabId,
        focusedPaneId,
        activeTab: activeTab ? { id: activeTab.id, focusedPaneId: activeTab.focusedPaneId, panes: activeTab.panes } : null
      });

      emitTo("ai-panel", "ai-panel:active-terminal", { id: focusedPaneId })
        .then(() => {
          log.info('[Main Window] Successfully sent requested terminal ID to AI panel:', focusedPaneId);
        })
        .catch((err) => {
          log.error('[Main Window] Failed to send requested terminal ID:', err);
        });
    });
    
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow, isQuickActionsWindow]); // Only depend on window type

  // Listen for SSH connection events from SSH window (main window only)
  useEffect(() => {
    if (isAiWindow || isSSHWindow || isOutputViewer || isQuickActionsWindow) return;

    const unlistenConnect = listen<{ profile: SSHProfile }>("ssh:connect", async (event) => {
      try {
        await onConnectSSHProfile?.(event.payload.profile);
      } catch (err) {
        log.error('SSH connection failed', err);
      }
    });

    const unlistenNewTab = listen<{ profile: SSHProfile }>("ssh:connect-new-tab", async (event) => {
      try {
        await onConnectSSHProfile?.(event.payload.profile);
      } catch (err) {
        log.error('SSH new tab connection failed', err);
      }
    });

    const unlistenGoToTab = listen<{ ptyId: string }>("ssh:goto-tab", (event) => {
      onGoToTab?.(event.payload.ptyId);
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
          }).catch((err) => {
            log.debug('Failed to emit connection status to SSH panel', err);
          });
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
  }, [isAiWindow, isSSHWindow, isOutputViewer, isQuickActionsWindow, ptyToProfileMap, onGoToTab, onConnectSSHProfile]);
}
