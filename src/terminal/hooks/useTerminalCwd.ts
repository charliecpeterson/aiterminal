/**
 * Terminal CWD and Git Info Hook
 *
 * Handles:
 * - Current working directory polling
 * - HOME directory fetching
 * - Git branch info (for local terminals only)
 * - Smart path truncation and display
 * - Instant CWD updates via OSC 7 events
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getPtyCwd } from '../core/ptyCwdCache';
import { truncatePathSmart } from '../../utils/pathUtils';
import { createLogger } from '../../utils/logger';

const log = createLogger('TerminalCwd');

interface GitBranchInfo {
  branch: string | null;
  is_git_repo: boolean;
  has_changes: boolean;
  ahead: number;
  behind: number;
}

export interface CwdState {
  cwd: string;
  displayCwd: string;
  fullCwd: string;
  isPathTruncated: boolean;
  gitInfo: GitBranchInfo | null;
}

interface UseTerminalCwdOptions {
  /** Whether CWD polling is enabled (default: true) */
  enabled?: boolean;
  /** Whether this terminal is remote (git info disabled for remote) */
  isRemote?: boolean;
  /** Max age for cached CWD in ms */
  maxCacheAgeMs?: number;
}

/**
 * Hook for terminal CWD and git info tracking
 */
export function useTerminalCwd(
  ptyId: number | null,
  options: UseTerminalCwdOptions = {}
): CwdState {
  const {
    enabled = true,
    isRemote = false,
    maxCacheAgeMs = 5000,
  } = options;

  const [cwd, setCwd] = useState<string>('');
  const [homeDir, setHomeDir] = useState<string>('');
  const [gitInfo, setGitInfo] = useState<GitBranchInfo | null>(null);

  const mountedRef = useRef(true);

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

  // Fetch CWD
  const fetchCwd = useCallback(async () => {
    if (!enabled || ptyId === null) return;

    try {
      const newCwd = await getPtyCwd(ptyId, { maxAgeMs: maxCacheAgeMs });
      if (mountedRef.current) {
        setCwd(newCwd);
      }
    } catch (err) {
      log.debug('Failed to fetch CWD', err);
    }
  }, [ptyId, enabled, maxCacheAgeMs]);

  // Fetch git info (only for local terminals with valid CWD)
  const fetchGitInfo = useCallback(async () => {
    if (!enabled || ptyId === null || isRemote || !cwd) {
      setGitInfo(null);
      return;
    }

    try {
      const info = await invoke<GitBranchInfo>('get_git_branch_tool', {
        workingDirectory: cwd,
      });
      if (mountedRef.current) setGitInfo(info);
    } catch {
      if (mountedRef.current) setGitInfo(null);
    }
  }, [ptyId, enabled, isRemote, cwd]);

  // Poll CWD and update git info when it changes
  useEffect(() => {
    if (!enabled || ptyId === null) return;

    // Initial fetch
    fetchCwd().then(() => fetchGitInfo());

    // Set up polling with recursive setTimeout
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(async () => {
        await fetchCwd();
        await fetchGitInfo();
        if (mountedRef.current) {
          scheduleNext();
        }
      }, maxCacheAgeMs);
    };
    scheduleNext();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [fetchCwd, fetchGitInfo, enabled, ptyId, maxCacheAgeMs]);

  // Listen for instant CWD change events (from OSC 7)
  useEffect(() => {
    if (!enabled || ptyId === null) return;

    const handleCwdChange = (e: Event) => {
      const event = e as CustomEvent<{ id: number; cwd: string }>;
      if (event.detail?.id === ptyId) {
        setCwd(event.detail.cwd);
        // Git info will be refreshed by the fetchGitInfo effect
      }
    };

    window.addEventListener('aiterm:pty-cwd', handleCwdChange);
    return () => window.removeEventListener('aiterm:pty-cwd', handleCwdChange);
  }, [ptyId, enabled]);

  // Cleanup
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

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
  };
}
