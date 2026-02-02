/**
 * SSH Health Service
 * 
 * Centralized service for SSH connection health monitoring and status broadcasting.
 * Consolidates duplicated health check logic from multiple hooks.
 */

import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import { 
  SSHHealthStatus, 
  TerminalHealth,
  updateHealthWithLatency,
  createInitialHealth,
} from '../types/terminalHealth';
import { createLogger } from '../utils/logger';

const log = createLogger('SSHHealth');

// ============================================================================
// TYPES
// ============================================================================

/** PTY info returned from the backend */
export interface PtyInfo {
  pty_type: string;
  remote_host: string | null;
  remote_user: string | null;
  ssh_client: string | null;
  connection_time: number | null;
}

/** Result of a health check */
export interface HealthCheckResult {
  isConnected: boolean;
  isSSH: boolean;
  latencyMs: number | null;
  ptyInfo: PtyInfo | null;
}

// ============================================================================
// HEALTH CHECK FUNCTIONS
// ============================================================================

/**
 * Check the health of a PTY connection.
 * Consolidates the duplicated pattern from multiple files.
 * 
 * @param ptyId - PTY ID to check
 * @returns Health check result with connection info
 */
export async function checkPtyHealth(ptyId: number): Promise<HealthCheckResult> {
  try {
    const [ptyInfoResult, latencyResult] = await Promise.allSettled([
      invoke<PtyInfo>('get_pty_info', { id: ptyId }),
      invoke<number>('measure_pty_latency', { id: ptyId }),
    ]);

    const ptyInfo = ptyInfoResult.status === 'fulfilled' ? ptyInfoResult.value : null;
    const latency = latencyResult.status === 'fulfilled' ? latencyResult.value : null;
    const isSSH = ptyInfo?.pty_type === 'ssh';

    return {
      isConnected: isSSH && latency !== null && latency >= 0,
      isSSH,
      latencyMs: latency !== null && latency >= 0 ? latency : null,
      ptyInfo,
    };
  } catch (error) {
    log.debug('Health check failed for PTY', { ptyId, error });
    return {
      isConnected: false,
      isSSH: false,
      latencyMs: null,
      ptyInfo: null,
    };
  }
}

/**
 * Check health and return updated TerminalHealth state.
 * 
 * @param ptyId - PTY ID to check
 * @param currentHealth - Current health state
 * @returns Updated health state
 */
export async function checkAndUpdateHealth(
  ptyId: number,
  currentHealth: TerminalHealth = createInitialHealth()
): Promise<TerminalHealth> {
  const result = await checkPtyHealth(ptyId);
  return updateHealthWithLatency(currentHealth, result.latencyMs);
}

// ============================================================================
// STATUS BROADCASTING
// ============================================================================

/** SSH Panel window label for event targeting */
const SSH_PANEL_LABEL = 'ssh-panel';

/**
 * Broadcast connection status to the SSH panel.
 * Consolidates the duplicated emit pattern from multiple files.
 * 
 * @param status - Connection status to broadcast
 */
export async function broadcastConnectionStatus(
  status: SSHHealthStatus
): Promise<void> {
  try {
    await emitTo(SSH_PANEL_LABEL, 'connection-status-update', {
      ptyId: String(status.ptyId),
      profileId: status.profileId,
      status: status.status,
      latency: status.latencyMs,
      tabId: status.tabId ?? String(status.ptyId),
      tabName: status.tabName,
    });
  } catch (error) {
    // SSH panel may not be open - this is expected
    log.debug('Failed to emit connection status to SSH panel', error);
  }
}

/**
 * Broadcast a disconnection event.
 * 
 * @param ptyId - PTY ID that disconnected
 * @param profileId - Profile ID (empty string if unknown)
 * @param tabName - Tab name (optional)
 */
export async function broadcastDisconnection(
  ptyId: number,
  profileId: string = '',
  tabName?: string
): Promise<void> {
  await broadcastConnectionStatus({
    ptyId,
    profileId,
    status: 'disconnected',
    tabName,
  });
}

/**
 * Broadcast a successful connection.
 * 
 * @param ptyId - PTY ID that connected
 * @param profileId - Profile ID
 * @param latencyMs - Connection latency (optional)
 * @param tabName - Tab name (optional)
 */
export async function broadcastConnection(
  ptyId: number,
  profileId: string,
  latencyMs?: number,
  tabName?: string
): Promise<void> {
  await broadcastConnectionStatus({
    ptyId,
    profileId,
    status: 'connected',
    latencyMs,
    tabName,
  });
}

// ============================================================================
// HEALTH MONITOR
// ============================================================================

/**
 * Create a health monitor that periodically checks connection status.
 * Returns a cleanup function to stop monitoring.
 * 
 * @param ptyId - PTY ID to monitor
 * @param profileId - Profile ID for broadcasting
 * @param intervalMs - Check interval in milliseconds (default: 5000)
 * @param onStatusChange - Callback when status changes
 * @returns Cleanup function to stop the monitor
 */
export function createHealthMonitor(
  ptyId: number,
  profileId: string,
  intervalMs: number = 5000,
  onStatusChange?: (result: HealthCheckResult) => void
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let isRunning = true;
  let lastStatus: 'connected' | 'disconnected' | null = null;

  const runCheck = async () => {
    if (!isRunning) return;

    const result = await checkPtyHealth(ptyId);
    const currentStatus = result.isConnected ? 'connected' : 'disconnected';

    // Broadcast on status change
    if (currentStatus !== lastStatus) {
      lastStatus = currentStatus;
      await broadcastConnectionStatus({
        ptyId,
        profileId,
        status: currentStatus,
        latencyMs: result.latencyMs ?? undefined,
      });
    }

    // Notify callback
    if (onStatusChange) {
      onStatusChange(result);
    }

    // Schedule next check using setTimeout to prevent overlap
    if (isRunning) {
      timeoutId = setTimeout(runCheck, intervalMs);
    }
  };

  // Start monitoring
  runCheck();

  // Return cleanup function
  return () => {
    isRunning = false;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
}

/**
 * Derive SSH connection status from health check result.
 * 
 * @param result - Health check result
 * @returns Connection status string
 */
export function deriveConnectionStatus(
  result: HealthCheckResult
): 'connected' | 'disconnected' | 'error' {
  if (!result.isSSH) return 'disconnected';
  if (result.isConnected) return 'connected';
  if (result.latencyMs === null) return 'error';
  return 'disconnected';
}
