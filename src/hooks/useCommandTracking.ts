import { useState, useEffect, useRef, useCallback } from "react";
import type { Tab } from "./useTabManagement";

interface UseCommandTrackingReturn {
  runningCommands: Map<number, { startTime: number; elapsed: number }>;
  handleCommandRunning: (ptyId: number, isRunning: boolean, startTime?: number) => void;
  handleGoToTab: (tabId: string) => void;
}

/**
 * Hook to track running commands and their elapsed time
 */
export function useCommandTracking(
  tabs: Tab[],
  setActiveTabId: (id: number) => void
): UseCommandTrackingReturn {
  // Track running commands per tab: Map<ptyId, { startTime: number, elapsed: number }>
  const [runningCommands, setRunningCommands] = useState<Map<number, { startTime: number; elapsed: number }>>(new Map());
  const elapsedTimerRef = useRef<number | null>(null);
  const tabsRef = useRef(tabs);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const handleGoToTab = useCallback((tabId: string) => {
    const ptyId = parseInt(tabId);
    const tab = tabsRef.current.find(t => t.panes.some(p => p.id === ptyId));
    if (tab) {
      setActiveTabId(tab.id);
    }
  }, [setActiveTabId]);

  // Handle command running state for tabs
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

  return {
    runningCommands,
    handleCommandRunning,
    handleGoToTab,
  };
}
