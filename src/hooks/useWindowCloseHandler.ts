import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { closeAuxiliaryWindows } from "../utils/windowManagement";
import { createLogger } from "../utils/logger";

const log = createLogger('useWindowCloseHandler');

interface UseWindowCloseHandlerProps {
  isAiWindow: boolean;
  saveSession: () => Promise<void>;
}

/**
 * Hook to handle window close events and cleanup
 */
export function useWindowCloseHandler(props: UseWindowCloseHandlerProps): void {
  const { isAiWindow, saveSession } = props;

  useEffect(() => {
    if (isAiWindow) return; // Only run in main window
    
    // Close AI Panel and SSH Panel windows when main window closes
    const currentWindow = getCurrentWindow();
    const unlistenPromise = currentWindow.onCloseRequested(async () => {
      // Save session before closing
      try {
        await saveSession();
        log.info('Session saved on window close');
      } catch (error) {
        log.error('Failed to save session on window close:', error);
      }
      
      await closeAuxiliaryWindows();
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [isAiWindow, saveSession]);
}
