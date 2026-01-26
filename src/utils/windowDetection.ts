/**
 * Window type detection utilities
 * Determines which type of window is currently running based on URL
 */

export function isAIWindow(): boolean {
  try {
    return window.location.hash.startsWith("#/ai-panel");
  } catch {
    return false;
  }
}

export function isSSHWindow(): boolean {
  try {
    return window.location.hash.startsWith("#/ssh-panel");
  } catch {
    return false;
  }
}

export function isOutputViewerWindow(): boolean {
  try {
    return window.location.hash.startsWith("#/output-viewer");
  } catch {
    return false;
  }
}

export function isQuickActionsWindow(): boolean {
  try {
    return window.location.hash.startsWith("#/quick-actions");
  } catch {
    return false;
  }
}

export function isPreviewWindow(): boolean {
  try {
    return window.location.search.includes("preview=");
  } catch {
    return false;
  }
}

export function isMainWindow(): boolean {
  return !isAIWindow() && !isSSHWindow() && !isOutputViewerWindow() && !isQuickActionsWindow() && !isPreviewWindow();
}

export interface WindowType {
  isAiWindow: boolean;
  isSSHWindow: boolean;
  isOutputViewer: boolean;
  isQuickActionsWindow: boolean;
  isPreviewWindow: boolean;
  isMainWindow: boolean;
}

export function detectWindowType(): WindowType {
  const isAi = isAIWindow();
  const isSSH = isSSHWindow();
  const isOutput = isOutputViewerWindow();
  const isQuickActions = isQuickActionsWindow();
  const isPreview = isPreviewWindow();
  
  return {
    isAiWindow: isAi,
    isSSHWindow: isSSH,
    isOutputViewer: isOutput,
    isQuickActionsWindow: isQuickActions,
    isPreviewWindow: isPreview,
    isMainWindow: !isAi && !isSSH && !isOutput && !isQuickActions && !isPreview,
  };
}
