/**
 * SSH Connection Management Hook
 * Handles SSH connections, connection monitoring, and PTY-to-profile mapping
 */

import { useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import { createLogger } from '../utils/logger';
import { connectSSHProfileNewTab, getProfileDisplayName } from '../utils/sshConnect';
import type { SSHProfile } from '../types/ssh';

const log = createLogger('SSHConnection');

interface Tab {
  id: number;
  title: string;
  customName?: string;
  panes: Array<{ id: number }>;
}

interface UseSSHConnectionOptions {
  tabs: Tab[];
  ptyToProfileMap: Map<number, string>;
  setPtyToProfileMap: (update: (prev: Map<number, string>) => Map<number, string>) => void;
  addSSHTab: (ptyId: number, displayName: string, profileId: string) => void;
  updateProfile: (profileId: string, updates: Partial<SSHProfile>) => Promise<void>;
  updateConnection: (ptyId: string, updates: any) => void;
}

export function useSSHConnection(options: UseSSHConnectionOptions) {
  const { tabs, ptyToProfileMap, setPtyToProfileMap, addSSHTab, updateProfile, updateConnection } = options;

  /**
   * Connect to an SSH profile and create a new tab
   */
  const connectSSHProfile = useCallback(async (profile: SSHProfile) => {
    try {
      const ptyId = await connectSSHProfileNewTab(profile);
      const displayName = getProfileDisplayName(profile);
      
      // Use hook to add SSH tab
      addSSHTab(ptyId, displayName, profile.id);
      
      // Link PTY to Profile for health tracking
      setPtyToProfileMap(prev => new Map(prev).set(ptyId, profile.id));
      
      // Update connection state (keyed by ptyId)
      updateConnection(String(ptyId), {
        profileId: profile.id,
        tabId: String(ptyId),
        tabName: displayName,
        status: 'connecting',
        connectedAt: new Date(),
        lastActivity: new Date(),
      });
      
      // Broadcast to SSH window
      emitTo("ssh-panel", "connection-status-update", {
        ptyId: String(ptyId),
        profileId: profile.id,
        tabName: displayName,
        status: 'connecting',
        tabId: String(ptyId),
      }).catch((err) => {
        log.debug('Failed to emit connection status to SSH panel', err);
      });
      
      // Update profile connection stats
      await updateProfile(profile.id, {
        lastConnectedAt: new Date().toISOString(),
        connectionCount: (profile.connectionCount || 0) + 1,
      });
    } catch (error) {
      log.error("Failed to connect SSH profile", error);
    }
  }, [addSSHTab, updateConnection, updateProfile]);

  /**
   * Monitor connection health for SSH sessions
   */
  useEffect(() => {
    if (ptyToProfileMap.size === 0) return;

    const monitorConnections = async () => {
      for (const [ptyId, profileId] of ptyToProfileMap.entries()) {
        try {
          // Get PTY info
          const ptyInfo = await invoke<any>('get_pty_info', { id: ptyId });
          
          // Get latency
          const latency = await invoke<number>('measure_pty_latency', { id: ptyId });
          
          // Get tab name
          const tab = tabs.find(t => t.panes.some(p => p.id === ptyId));
          const tabName = tab?.customName || tab?.title || 'Unknown';
          
          // Determine status
          let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
          if (ptyInfo && ptyInfo.pty_type === 'ssh') {
            status = 'connected';
          }
          
          // Update connection health (keyed by ptyId)
          updateConnection(String(ptyId), {
            profileId,
            tabId: String(ptyId),
            tabName,
            status,
            latency: latency > 0 ? latency : undefined,
            lastActivity: new Date(),
          });
          
          // Broadcast to SSH window
          emitTo("ssh-panel", "connection-status-update", {
            ptyId: String(ptyId),
            profileId,
            tabName,
            status,
            latency: latency > 0 ? latency : undefined,
            tabId: String(ptyId),
          }).catch((err) => {
            log.debug('Failed to emit connection status to SSH panel', err);
          });
        } catch (error) {
          // PTY might be closed
          updateConnection(String(ptyId), {
            profileId,
            tabId: String(ptyId),
            status: 'disconnected',
          });
          
          // Broadcast to SSH window
          emitTo("ssh-panel", "connection-status-update", {
            ptyId: String(ptyId),
            profileId,
            status: 'disconnected',
            tabId: String(ptyId),
          }).catch((err) => {
            log.debug('Failed to emit disconnection status to SSH panel', err);
          });
        }
      }
    };

    // Monitor immediately
    monitorConnections();

    // Then monitor every 5 seconds
    const intervalId = setInterval(monitorConnections, 5000);

    return () => clearInterval(intervalId);
  }, [ptyToProfileMap, tabs, updateConnection]);

  /**
   * Clean up connection tracking when tabs close
   */
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

  return {
    connectSSHProfile,
  };
}
