/**
 * Hook for executing Quick Actions in terminals
 */

import { useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../utils/logger';
import { QuickAction } from '../components/QuickActionsWindow';

const log = createLogger('QuickActionsExecutor');

interface Tab {
  id: number;
  focusedPaneId: number | null;
  panes: Array<{ id: number }>;
}

interface UseQuickActionsExecutorOptions {
  isQuickActionsWindow: boolean;
  mainActiveTabId: number | null;
  tabs: Tab[];
  activeTabId: number | null;
  runningCommands: Map<number, { startTime: number; elapsed: number }>;
}

export function useQuickActionsExecutor(options: UseQuickActionsExecutorOptions) {
  const { isQuickActionsWindow, mainActiveTabId, tabs, activeTabId, runningCommands } = options;
  
  const runningCommandsRef = useRef(runningCommands);
  runningCommandsRef.current = runningCommands;

  const waitForCommandComplete = useCallback((ptyId: number, signal?: AbortSignal): Promise<void> => {
    return new Promise((resolve) => {
      // Check if already aborted
      if (signal?.aborted) {
        resolve();
        return;
      }
      
      const checkInterval = setInterval(() => {
        // Check if command is still running
        if (!runningCommandsRef.current.has(ptyId)) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // Handle abort signal for cleanup on component unmount
      const abortHandler = () => {
        clearInterval(checkInterval);
        resolve();
      };
      signal?.addEventListener('abort', abortHandler);
      
      // Safety timeout (10 minutes max per command)
      const safetyTimeout = setTimeout(() => {
        clearInterval(checkInterval);
        signal?.removeEventListener('abort', abortHandler);
        resolve();
      }, 10 * 60 * 1000);
      
      // Cleanup on abort
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(safetyTimeout);
        }, { once: true });
      }
    });
  }, []);

  const executeQuickAction = useCallback(async (action: QuickAction) => {
    // Get the active terminal's PTY ID
    let activePty: number | null = null;
    
    if (isQuickActionsWindow) {
      // In popup window: use mainActiveTabId from events, default to null if not set yet
      // We'll wait a moment for the event to arrive if it's null
      activePty = mainActiveTabId;
      
      if (activePty === null || activePty === undefined) {
        // Try waiting briefly for the event to arrive
        await new Promise(resolve => setTimeout(resolve, 100));
        activePty = mainActiveTabId;
      }
    } else {
      // In main window: use the focused pane
      activePty = tabs.find(t => t.id === activeTabId)?.focusedPaneId || activeTabId;
    }
    
    if (activePty === null || activePty === undefined) {
      log.error("No active terminal", { mainActiveTabId, activeTabId });
      alert("No active terminal found. Please make sure a terminal is active in the main window and try again.");
      return;
    }
    
    // Execute commands sequentially
    for (let i = 0; i < action.commands.length; i++) {
      const command = action.commands[i];
      
      try {
        // Send command to PTY (with newline to execute)
        await invoke("write_to_pty", { 
          id: activePty, 
          data: command + "\r" 
        });
        
        // Wait for command to complete
        await waitForCommandComplete(activePty);
        
      } catch (error) {
        log.error(`Quick action '${action.name}' failed to execute command: ${command}`, error);
      }
    }
  }, [isQuickActionsWindow, mainActiveTabId, tabs, activeTabId, waitForCommandComplete]);

  return { executeQuickAction };
}
