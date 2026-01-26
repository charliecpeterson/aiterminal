import type { SSHProfile } from '../types/ssh';
import { emitTo, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '../utils/logger';

const log = createLogger('SSHIntegration');

export interface ConnectionStatus {
  profileId: string;
  tabId: string;
  tabName?: string;
  status: 'connected' | 'disconnected' | 'error';
  latency?: number;
  lastActivity?: Date;
}

export function setupSshMainWindowListeners(params: {
  connectSSHProfile: (profile: SSHProfile) => Promise<void>;
  handleGoToTab: (tabId: string) => void;
  getPtyToProfileEntries: () => Array<[number, string]>;
}): () => void {
  const { connectSSHProfile, handleGoToTab, getPtyToProfileEntries } = params;

  const unlistenConnect = listen<{ profile: SSHProfile }>('ssh:connect', async (event) => {
    await connectSSHProfile(event.payload.profile);
  });

  const unlistenNewTab = listen<{ profile: SSHProfile }>('ssh:connect-new-tab', async (event) => {
    await connectSSHProfile(event.payload.profile);
  });

  const unlistenGoToTab = listen<{ ptyId: string }>('ssh:goto-tab', (event) => {
    handleGoToTab(event.payload.ptyId);
  });

  const unlistenStatusRequest = listen('ssh:request-status', async () => {
    for (const [ptyId, profileId] of getPtyToProfileEntries()) {
      try {
        const ptyInfo = await invoke<any>('get_pty_info', { id: ptyId });
        const latency = await invoke<number>('measure_pty_latency', { id: ptyId });

        let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
        if (ptyInfo && ptyInfo.pty_type === 'ssh') {
          status = 'connected';
        }

        await emitTo('ssh-panel', 'connection-status-update', {
          ptyId: String(ptyId),
          profileId,
          status,
          latency: latency > 0 ? latency : undefined,
          tabId: String(ptyId),
        }).catch((err) => {
          log.debug('Failed to emit connection status to SSH panel', err);
        });
      } catch {
        // PTY closed or info unavailable
      }
    }
  });

  return () => {
    void unlistenConnect.then((u) => u());
    void unlistenNewTab.then((u) => u());
    void unlistenGoToTab.then((u) => u());
    void unlistenStatusRequest.then((u) => u());
  };
}

export function setupSshHealthMonitor(params: {
  getPtyToProfileEntries: () => Array<[number, string]>;
  getTabs: () => Array<{ id: number; title: string; customName?: string; panes: Array<{ id: number }> }>;
  updateConnection: (ptyId: string, data: ConnectionStatus) => void;
  intervalMs?: number;
}): () => void {
  const { getPtyToProfileEntries, getTabs, updateConnection, intervalMs = 5000 } = params;

  let intervalId: number | null = null;
  let cancelled = false;

  const monitorConnections = async () => {
    for (const [ptyId, profileId] of getPtyToProfileEntries()) {
      try {
        const ptyInfo = await invoke<any>('get_pty_info', { id: ptyId });
        const latency = await invoke<number>('measure_pty_latency', { id: ptyId });

        const tab = getTabs().find((t) => t.panes.some((p) => p.id === ptyId));
        const tabName = tab?.customName || tab?.title || 'Unknown';

        let status: 'connected' | 'disconnected' | 'error' = 'disconnected';
        if (ptyInfo && ptyInfo.pty_type === 'ssh') {
          status = 'connected';
        }

        updateConnection(String(ptyId), {
          profileId,
          tabId: String(ptyId),
          tabName,
          status,
          latency: latency > 0 ? latency : undefined,
          lastActivity: new Date(),
        });

        await emitTo('ssh-panel', 'connection-status-update', {
          ptyId: String(ptyId),
          profileId,
          tabName,
          status,
          latency: latency > 0 ? latency : undefined,
          tabId: String(ptyId),
        }).catch((err) => {
          log.debug('Failed to emit connection status to SSH panel', err);
        });
      } catch {
        updateConnection(String(ptyId), {
          profileId,
          tabId: String(ptyId),
          status: 'disconnected',
        });

        await emitTo('ssh-panel', 'connection-status-update', {
          ptyId: String(ptyId),
          profileId,
          status: 'disconnected',
          tabId: String(ptyId),
        }).catch((err) => {
          log.debug('Failed to emit disconnection status to SSH panel', err);
        });
      }

      if (cancelled) return;
    }
  };

  // Run immediately then on interval.
  void monitorConnections();
  intervalId = window.setInterval(() => {
    void monitorConnections();
  }, intervalMs);

  return () => {
    cancelled = true;
    if (intervalId != null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
  };
}
