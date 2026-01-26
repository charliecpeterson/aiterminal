/**
 * Window management utilities for opening/closing auxiliary windows
 */

import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo } from "@tauri-apps/api/event";
import { createLogger } from "./logger";

const log = createLogger('WindowManagement');

export interface WindowOpenOptions {
  activeTabId: number | null;
  tabs: Array<{
    id: number;
    focusedPaneId: number | null;
    panes: Array<{ id: number }>;
  }>;
}

/**
 * Opens the AI Panel window or focuses it if already open
 */
export async function openAIPanelWindow(options?: WindowOpenOptions) {
  const existing = await WebviewWindow.getByLabel("ai-panel");
  if (existing) {
    await existing.setFocus();
    return;
  }

  const panelWindow = new WebviewWindow("ai-panel", {
    title: "AI Panel",
    width: 380,
    height: 620,
    resizable: true,
    url: "/#/ai-panel",
  });
  
  panelWindow.once("tauri://created", () => {
    panelWindow.setFocus().catch((err) => {
      log.debug('Failed to focus AI panel window', err);
    });
    
    if (options) {
      const activeTab = options.tabs.find(t => t.id === options.activeTabId);
      const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || options.activeTabId;
      emitTo("ai-panel", "ai-panel:active-terminal", { id: focusedPaneId }).catch((err) => {
        log.debug('Failed to notify AI panel of active terminal', err);
      });
    }
  });
  
  panelWindow.once("tauri://error", (event) => {
    log.error("AI panel window error", event);
  });
}

/**
 * Opens the Quick Actions window or focuses it if already open
 */
export async function openQuickActionsWindow(options?: WindowOpenOptions) {
  const existing = await WebviewWindow.getByLabel("quick-actions");
  if (existing) {
    await existing.setFocus();
    return;
  }

  const qaWindow = new WebviewWindow("quick-actions", {
    title: "Quick Actions",
    width: 600,
    height: 600,
    resizable: true,
    url: "/#/quick-actions",
  });
  
  qaWindow.once("tauri://created", async () => {
    await qaWindow.setFocus().catch((err) => {
      log.debug('Failed to focus quick actions window', err);
    });
    
    // Wait a moment for the window to fully initialize and set up listeners
    await new Promise(resolve => setTimeout(resolve, 200));
    
    if (options) {
      const activeTab = options.tabs.find(t => t.id === options.activeTabId);
      const focusedPaneId = activeTab?.focusedPaneId || activeTab?.panes[0]?.id || options.activeTabId;
      await emitTo("quick-actions", "quick-actions:active-terminal", { id: focusedPaneId }).catch((err) => {
        log.error('Failed to emit active terminal event', err);
      });
    }
  });
  
  qaWindow.once("tauri://error", (event) => {
    log.error("Quick Actions window error", event);
  });
}

/**
 * Opens the SSH Sessions panel window or toggles it closed if already open
 */
export async function openSSHPanelWindow() {
  const existing = await WebviewWindow.getByLabel("ssh-panel");
  if (existing) {
    // If window exists, close it (toggle behavior)
    await existing.close().catch((err) => {
      log.debug('Failed to close SSH panel window', err);
    });
    return;
  }

  const sshWindow = new WebviewWindow("ssh-panel", {
    title: "SSH Sessions",
    width: 350,
    height: 600,
    resizable: true,
    url: "/#/ssh-panel",
  });
  
  sshWindow.once("tauri://created", () => {
    sshWindow.setFocus().catch((err) => {
      log.debug('Failed to focus SSH panel window', err);
    });
  });
  
  sshWindow.once("tauri://error", (event) => {
    log.error("SSH panel window error", event);
  });
}

/**
 * Closes auxiliary windows when main window closes
 */
export async function closeAuxiliaryWindows() {
  const aiPanel = await WebviewWindow.getByLabel("ai-panel").catch(() => null);
  if (aiPanel) {
    await aiPanel.close().catch((err) => {
      log.debug('Failed to close AI panel window', err);
    });
  }
  
  const sshPanel = await WebviewWindow.getByLabel("ssh-panel").catch(() => null);
  if (sshPanel) {
    await sshPanel.close().catch((err) => {
      log.debug('Failed to close SSH panel window', err);
    });
  }
}
