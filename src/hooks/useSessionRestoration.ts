import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "../utils/logger";
import type { SSHProfile } from "../types/ssh";
import type { SessionState } from "../types/session";

const log = createLogger('useSessionRestoration');

interface UseSessionRestorationProps {
  profiles: SSHProfile[];
  connectSSHProfile: (profile: SSHProfile) => Promise<void>;
  addSSHTab: (ptyId: number, name: string, profileId: string) => void;
  setActiveTabId: (id: number) => void;
  setIsInitialized: (value: boolean) => void;
  createTab: () => Promise<void>;
  loadSession: () => Promise<SessionState | null>;
}

/**
 * Hook to restore a saved session or create a new tab on mount
 */
export function useSessionRestoration(props: UseSessionRestorationProps): void {
  const {
    profiles,
    connectSSHProfile,
    addSSHTab,
    setActiveTabId,
    setIsInitialized,
    createTab,
    loadSession,
  } = props;

  useEffect(() => {
    const restoreOrCreateSession = async () => {
      try {
        const sessionState = await loadSession();
        
        if (!sessionState || sessionState.tabs.length === 0) {
          // No saved session, create a new tab
          log.info('No saved session, creating new tab');
          await createTab();
          setIsInitialized(true);
          return;
        }

        log.info(`Restoring session with ${sessionState.tabs.length} tabs`);

        // Restore each tab
        for (const sessionTab of sessionState.tabs) {
          for (const sessionPane of sessionTab.panes) {
            if (sessionPane.restoreType === 'skip') {
              log.debug(`Skipping pane ${sessionPane.id} (marked as skip)`);
              continue;
            }

            if (sessionPane.restoreType === 'ssh' && sessionPane.sshProfileId) {
              // Restore SSH connection
              const profile = profiles.find(p => p.id === sessionPane.sshProfileId);
              if (profile) {
                log.info(`Restoring SSH connection to ${profile.name}`);
                try {
                  await connectSSHProfile(profile);
                } catch (error) {
                  log.error(`Failed to restore SSH connection for ${profile.name}:`, error);
                }
              } else {
                log.warn(`SSH profile ${sessionPane.sshProfileId} not found, skipping`);
              }
            } else if (sessionPane.restoreType === 'local') {
              // Restore local terminal
              log.info(`Restoring local terminal (cwd: ${sessionPane.workingDirectory || 'default'})`);
              try {
                const ptyId = await invoke<number>("spawn_pty");
                
                // Create tab with restored title
                addSSHTab(ptyId, sessionTab.customName || sessionTab.title, '');
                
                // Change to working directory if available
                if (sessionPane.workingDirectory) {
                  await invoke('write_to_pty', {
                    id: ptyId,
                    data: `cd "${sessionPane.workingDirectory}"\n`,
                  });
                }
              } catch (error) {
                log.error('Failed to restore local terminal:', error);
              }
            }
          }
        }

        // Restore active tab
        if (sessionState.activeTabId !== null) {
          setActiveTabId(sessionState.activeTabId);
        }

        setIsInitialized(true);
        log.info('Session restoration complete');
      } catch (error) {
        log.error('Session restoration failed:', error);
        // Fallback to creating a new tab
        await createTab();
        setIsInitialized(true);
      }
    };

    restoreOrCreateSession();
  }, []); // Empty deps - only run once on mount
}
