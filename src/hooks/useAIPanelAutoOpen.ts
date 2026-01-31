import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ContextItem } from '../context/AIContext';
import { openAIPanelWindow } from '../utils/windowManagement';
import { createLogger } from '../utils/logger';

const log = createLogger('AIPanelAutoOpen');

interface UseAIPanelAutoOpenProps {
  enabled: boolean; // Only enable in main window
  activeTabId: number | null;
  tabs: Array<{
    id: number;
    focusedPaneId: number | null;
    panes: Array<{ id: number }>;
  }>;
}

/**
 * Hook to automatically open AI Panel when context is added from terminal
 */
export function useAIPanelAutoOpen({ enabled, activeTabId, tabs }: UseAIPanelAutoOpenProps) {
  useEffect(() => {
    if (!enabled) return;

    const unlistenPromise = listen<ContextItem>('ai-context:sync-add', async (event) => {
      // Check if context was added from terminal (has source metadata)
      const item = event.payload;
      const isFromTerminal = item.metadata?.source === 'local' || item.metadata?.source === 'remote';
      
      if (isFromTerminal) {
        log.debug('Context added from terminal, auto-opening AI Panel');
        
        try {
          await openAIPanelWindow({ activeTabId, tabs });
        } catch (err) {
          log.error('Failed to auto-open AI Panel', err);
        }
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [enabled, activeTabId, tabs]);
}
