/**
 * Consolidated Terminal Polling Hook
 * 
 * Combines all terminal polling into a single interval to reduce resource usage.
 * Previously, each terminal had 6+ separate intervals polling different data.
 * This consolidates: CWD, Git info, PTY info, latency, and health into one poll cycle.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getPtyCwd } from '../core/ptyCwdCache';
import { truncatePathSmart } from '../../utils/pathUtils';
import { createLogger } from '../../utils/logger';

const log = createLogger('TerminalPolling');

// Default polling interval (5 seconds is a good balance)
const DEFAULT_POLL_INTERVAL_MS = 5000;

interface GitBranchInfo {
  branch: string | null;
  is_git_repo: boolean;
  has_changes: boolean;
  ahead: number;
  behind: number;
}

interface PtyInfo {
  pty_type: 'local' | 'ssh';
  remote_host?: string;
  remote_user?: string;
}

export interface TerminalHealth {
  processAlive: boolean;
  writable: boolean;
  msSinceLastOutput: number | null;
  status: 'healthy' | 'idle' | 'unresponsive' | 'dead';
}

interface RustTerminalHealth {
  process_alive: boolean;
  writable: boolean;
  ms_since_last_output: number | null;
  status: string;
}

export interface TerminalPollingState {
  // CWD info
  cwd: string;
  displayCwd: string;
  fullCwd: string;
  isPathTruncated: boolean;
  
  // Git info
  gitInfo: GitBranchInfo | null;
  
  // PTY info
  isRemote: boolean;
  hostLabel: string;
  
  // Latency
  latencyMs: number | null;
  
  // Health
  health: TerminalHealth | null;
}

interface UseTerminalPollingOptions {
  /** Polling interval in milliseconds (default: 5000) */
  intervalMs?: number;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
  /** Callback when remote state changes */
  onRemoteStateChange?: (isRemote: boolean) => void;
}

/**
 * Consolidated polling hook for terminal status information.
 * 
 * Replaces: useTerminalStatus, useLatencyProbe, useTerminalHealth, and
 * the PTY info polling in Terminal.tsx.
 */
export function useTerminalPolling(
  ptyId: number | null,
  options: UseTerminalPollingOptions = {}
): TerminalPollingState {
  const {
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    enabled = true,
    onRemoteStateChange,
  } = options;

  // State
  const [cwd, setCwd] = useState<string>('');
  const [homeDir, setHomeDir] = useState<string>('');
  const [gitInfo, setGitInfo] = useState<GitBranchInfo | null>(null);
  const [isRemote, setIsRemote] = useState(false);
  const [hostLabel, setHostLabel] = useState('Local');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [health, setHealth] = useState<TerminalHealth | null>(null);
  
  // Refs for cleanup and tracking
  const mountedRef = useRef(true);
  const prevIsRemoteRef = useRef(false);
  const onRemoteStateChangeRef = useRef(onRemoteStateChange);
  
  // Keep callback ref updated
  useEffect(() => {
    onRemoteStateChangeRef.current = onRemoteStateChange;
  });

  // Get home directory on mount
  useEffect(() => {
    if (!enabled) return;
    
    invoke<string>('get_env_var_tool', { name: 'HOME' })
      .then(home => {
        if (mountedRef.current) setHomeDir(home || '');
      })
      .catch(() => {
        if (mountedRef.current) setHomeDir('');
      });
  }, [enabled]);

  // Main polling function - fetches all data in one cycle
  const poll = useCallback(async () => {
    if (!enabled || ptyId === null) return;

    try {
      // Fetch all data in parallel for efficiency
      const [cwdResult, ptyInfoResult, latencyResult, healthResult] = await Promise.allSettled([
        getPtyCwd(ptyId, { maxAgeMs: intervalMs }),
        invoke<PtyInfo>('get_pty_info', { id: ptyId }),
        invoke<number>('measure_pty_latency', { id: ptyId }),
        invoke<RustTerminalHealth>('check_pty_health', { id: ptyId }),
      ]);

      if (!mountedRef.current) return;

      // Process CWD
      if (cwdResult.status === 'fulfilled') {
        setCwd(cwdResult.value);
      }

      // Process PTY info (remote state)
      if (ptyInfoResult.status === 'fulfilled') {
        const info = ptyInfoResult.value;
        const newIsRemote = info?.pty_type === 'ssh';
        setIsRemote(newIsRemote);
        
        if (newIsRemote && info.remote_host) {
          const userPart = info.remote_user ? `${info.remote_user}@` : '';
          setHostLabel(`🔒 ${userPart}${info.remote_host}`);
        } else {
          setHostLabel('Local');
        }
        
        // Notify if remote state changed
        if (newIsRemote !== prevIsRemoteRef.current) {
          prevIsRemoteRef.current = newIsRemote;
          onRemoteStateChangeRef.current?.(newIsRemote);
        }
      }

      // Process latency
      if (latencyResult.status === 'fulfilled') {
        setLatencyMs(latencyResult.value);
      } else {
        setLatencyMs(null);
      }

      // Process health
      if (healthResult.status === 'fulfilled') {
        const result = healthResult.value;
        setHealth({
          processAlive: result.process_alive,
          writable: result.writable,
          msSinceLastOutput: result.ms_since_last_output,
          status: result.status as TerminalHealth['status'],
        });
      } else {
        setHealth({
          processAlive: false,
          writable: false,
          msSinceLastOutput: null,
          status: 'dead',
        });
      }

      // Fetch git info (only for local terminals, after we know CWD)
      const currentCwd = cwdResult.status === 'fulfilled' ? cwdResult.value : cwd;
      const currentIsRemote = ptyInfoResult.status === 'fulfilled' 
        ? ptyInfoResult.value?.pty_type === 'ssh' 
        : isRemote;
        
      if (!currentIsRemote && currentCwd) {
        try {
          const info = await invoke<GitBranchInfo>('get_git_branch_tool', {
            workingDirectory: currentCwd,
          });
          if (mountedRef.current) setGitInfo(info);
        } catch {
          if (mountedRef.current) setGitInfo(null);
        }
      } else {
        setGitInfo(null);
      }
    } catch (err) {
      log.debug('Polling cycle failed', err);
    }
  }, [ptyId, enabled, intervalMs, cwd, isRemote]);

  // Set up polling interval
  useEffect(() => {
    mountedRef.current = true;
    
    if (!enabled || ptyId === null) {
      return () => { mountedRef.current = false; };
    }

    // Initial poll
    poll();

    // Use recursive setTimeout instead of setInterval to prevent overlapping polls
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        await poll();
        if (mountedRef.current) {
          scheduleNext();
        }
      }, intervalMs);
    };
    scheduleNext();

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [poll, enabled, intervalMs, ptyId]);

  // Listen for CWD change events (from OSC 7) - this provides instant updates
  useEffect(() => {
    if (!enabled || ptyId === null) return;
    
    const handleCwdChange = (e: Event) => {
      const event = e as CustomEvent<{ id: number; cwd: string }>;
      if (event.detail?.id === ptyId) {
        setCwd(event.detail.cwd);
        // Trigger a poll to refresh git info
        setTimeout(poll, 100);
      }
    };

    window.addEventListener('aiterm:pty-cwd', handleCwdChange);
    return () => window.removeEventListener('aiterm:pty-cwd', handleCwdChange);
  }, [ptyId, poll, enabled]);

  // Compute display paths
  const fullCwd = cwd.startsWith(homeDir) && homeDir 
    ? '~' + cwd.slice(homeDir.length) 
    : cwd;
  const displayCwd = truncatePathSmart(cwd, 35, homeDir);
  const isPathTruncated = displayCwd !== fullCwd;

  return {
    cwd,
    displayCwd: displayCwd || '~',
    fullCwd: fullCwd || '~',
    isPathTruncated,
    gitInfo,
    isRemote,
    hostLabel,
    latencyMs,
    health,
  };
}

/**
 * Get a human-readable description of the health status
 */
export function getHealthDescription(health: TerminalHealth | null): string {
  if (!health) return 'Unknown';
  
  switch (health.status) {
    case 'healthy':
      return 'Terminal is responsive';
    case 'idle':
      const idleMins = health.msSinceLastOutput 
        ? Math.floor(health.msSinceLastOutput / 60000) 
        : 0;
      return `No output for ${idleMins} minute${idleMins !== 1 ? 's' : ''}`;
    case 'unresponsive':
      return 'Terminal may be hung (cannot write)';
    case 'dead':
      return 'Terminal process has exited';
    default:
      return 'Unknown status';
  }
}

/**
 * Get status indicator emoji/icon for health
 */
export function getHealthIndicator(health: TerminalHealth | null): string {
  if (!health) return '';
  
  switch (health.status) {
    case 'healthy':
      return '';
    case 'idle':
      return '💤';
    case 'unresponsive':
      return '⚠️';
    case 'dead':
      return '🔴';
    default:
      return '';
  }
}
