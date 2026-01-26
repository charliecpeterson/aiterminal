/**
 * Session persistence types for restoring terminal state across app restarts
 */

/**
 * Complete session state saved to disk
 */
export interface SessionState {
  /** Schema version for migration support */
  version: string;
  
  /** Timestamp when session was saved */
  timestamp: string;
  
  /** All open tabs */
  tabs: SessionTab[];
  
  /** Currently active tab ID (PTY ID) */
  activeTabId: number | null;
  
  /** Window state (future use) */
  windowState?: {
    width: number;
    height: number;
  };
}

/**
 * Saved state for a single tab
 */
export interface SessionTab {
  /** PTY ID (serves as tab ID) */
  id: number;
  
  /** Display title */
  title: string;
  
  /** User-customized name */
  customName?: string;
  
  /** Split layout configuration */
  splitLayout: 'single' | 'vertical' | 'horizontal';
  
  /** Split ratio (10-90) */
  splitRatio: number;
  
  /** All panes in this tab */
  panes: SessionPane[];
  
  /** Which pane has focus */
  focusedPaneId: number | null;
}

/**
 * Saved state for a single terminal pane
 */
export interface SessionPane {
  /** PTY ID */
  id: number;
  
  /** Whether this is a remote SSH connection */
  isRemote: boolean;
  
  /** Remote hostname (if SSH) */
  remoteHost?: string;
  
  /** SSH profile ID for reconnection */
  sshProfileId?: string;
  
  /** Working directory at time of save */
  workingDirectory?: string;
  
  /** How to restore this pane */
  restoreType: 'local' | 'ssh' | 'skip';
}

/**
 * Session restoration result
 */
export interface SessionRestoreResult {
  success: boolean;
  restoredTabs: number;
  failedTabs: number;
  errors?: string[];
}

/**
 * Session restoration options
 */
export interface SessionRestoreOptions {
  /** Skip restore dialog and auto-restore */
  skipDialog?: boolean;
  
  /** Only restore local terminals (skip SSH) */
  localOnly?: boolean;
  
  /** Maximum tabs to restore (prevent overload) */
  maxTabs?: number;
}
