import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SessionState, SessionTab, SessionPane } from '../types/session';
import { Tab } from './useTabManagement';
import { createLogger } from '../utils/logger';

const log = createLogger('SessionPersistence');

const SESSION_VERSION = '1.0.0';
const AUTO_SAVE_INTERVAL_MS = 5000; // Auto-save every 5 seconds

interface UseSessionPersistenceProps {
  tabs: Tab[];
  activeTabId: number | null;
  ptyToProfileMap: Map<number, string>;
  enabled?: boolean;
}

interface UseSessionPersistenceReturn {
  saveSession: () => Promise<void>;
  loadSession: () => Promise<SessionState | null>;
  clearSession: () => Promise<void>;
  hasSavedSession: () => Promise<boolean>;
}

/**
 * Hook for managing terminal session persistence across app restarts
 */
export function useSessionPersistence({
  tabs,
  activeTabId,
  ptyToProfileMap,
  enabled = true,
}: UseSessionPersistenceProps): UseSessionPersistenceReturn {
  const autoSaveTimerRef = useRef<number | null>(null);

  /**
   * Save the current session state to disk
   */
  const saveSession = useCallback(async () => {
    if (!enabled || tabs.length === 0) {
      log.debug('Session save skipped (disabled or no tabs)');
      return;
    }

    try {
      // Collect working directories for all panes
      const sessionTabs: SessionTab[] = await Promise.all(
        tabs.map(async (tab) => {
          const sessionPanes: SessionPane[] = await Promise.all(
            tab.panes.map(async (pane) => {
              let workingDirectory: string | undefined;
              let restoreType: 'local' | 'ssh' | 'skip' = 'local';

              try {
                // Try to get current working directory
                workingDirectory = await invoke<string>('get_pty_cwd', { id: pane.id });
              } catch (error) {
                log.warn(`Failed to get CWD for pane ${pane.id}:`, error);
              }

              // Determine restore type
              if (pane.isRemote) {
                restoreType = 'ssh';
              } else if (!workingDirectory) {
                // If we can't get CWD, skip restoration (PTY may be dead)
                restoreType = 'skip';
              }

              const sshProfileId = ptyToProfileMap.get(pane.id);

              return {
                id: pane.id,
                isRemote: pane.isRemote || false,
                remoteHost: pane.remoteHost,
                sshProfileId,
                workingDirectory,
                restoreType,
              };
            })
          );

          return {
            id: tab.id,
            title: tab.title,
            customName: tab.customName,
            splitLayout: tab.splitLayout,
            splitRatio: tab.splitRatio,
            panes: sessionPanes,
            focusedPaneId: tab.focusedPaneId,
          };
        })
      );

      const sessionState: SessionState = {
        version: SESSION_VERSION,
        timestamp: new Date().toISOString(),
        tabs: sessionTabs,
        activeTabId,
      };

      await invoke('save_session_state', { state: sessionState });
      log.info(`Session saved with ${sessionTabs.length} tabs`);
    } catch (error) {
      log.error('Failed to save session:', error);
    }
  }, [enabled, tabs, activeTabId, ptyToProfileMap]);

  /**
   * Load the saved session state from disk
   */
  const loadSession = useCallback(async (): Promise<SessionState | null> => {
    try {
      const sessionState = await invoke<SessionState | null>('load_session_state');
      if (sessionState) {
        log.info(`Session loaded with ${sessionState.tabs.length} tabs`);
      } else {
        log.debug('No saved session found');
      }
      return sessionState;
    } catch (error) {
      log.error('Failed to load session:', error);
      return null;
    }
  }, []);

  /**
   * Clear the saved session state
   */
  const clearSession = useCallback(async () => {
    try {
      await invoke('clear_session_state');
      log.info('Session cleared');
    } catch (error) {
      log.error('Failed to clear session:', error);
    }
  }, []);

  /**
   * Check if a saved session exists
   */
  const hasSavedSession = useCallback(async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('has_saved_session');
    } catch (error) {
      log.error('Failed to check for saved session:', error);
      return false;
    }
  }, []);

  /**
   * Auto-save session periodically
   */
  useEffect(() => {
    if (!enabled) return;

    // Clear existing timer
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current);
    }

    // Set up auto-save
    autoSaveTimerRef.current = setInterval(() => {
      saveSession();
    }, AUTO_SAVE_INTERVAL_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [enabled, saveSession]);

  // Note: Session saving on app close is handled by useWindowCloseHandler in App.tsx
  // which properly awaits the async saveSession() call via Tauri's onCloseRequested

  return {
    saveSession,
    loadSession,
    clearSession,
    hasSavedSession,
  };
}
