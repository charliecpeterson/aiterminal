/**
 * Action Definitions - All app actions for command palette and shortcuts
 * 
 * Actions are registered with dependencies from the App component.
 * This allows the action registry to execute callbacks that are
 * scoped to the current React component tree.
 */

import { registerActions, clearActions, formatShortcut, type Action } from './actionRegistry';
import { openAIPanelWindow, openSSHPanelWindow, openQuickActionsWindow } from '../utils/windowManagement';
import type { Tab } from '../hooks/useTabManagement';

/**
 * Dependencies injected from App component
 */
export interface ActionDependencies {
  // Tab management
  tabs: Tab[];
  activeTabId: number | null;
  createTab: () => Promise<void>;
  closeTab: (id: number) => void;
  renameTab: (id: number, name: string) => void;
  setActiveTabId: (id: number) => void;
  
  // Pane management
  splitPane: (tabId: number, direction: 'horizontal' | 'vertical') => void;
  closePane: (tabId: number, paneId: number) => void;
  setFocusedPane: (tabId: number, paneId: number) => void;
  
  // Settings
  setIsSettingsOpen: (open: boolean) => void;
  
  // Command palette
  setIsCommandPaletteOpen: (open: boolean) => void;
}

/**
 * Build all actions with the given dependencies
 */
function buildActions(deps: ActionDependencies): Action[] {
  const { 
    tabs, 
    activeTabId, 
    createTab, 
    closeTab,
    setActiveTabId,
    splitPane, 
    closePane,
    setFocusedPane,
    setIsSettingsOpen,
    setIsCommandPaletteOpen,
  } = deps;

  const getActiveTab = () => tabs.find(t => t.id === activeTabId);

  return [
    // ============ TABS ============
    {
      id: 'tab.create',
      label: 'New Tab',
      shortcut: formatShortcut('CmdOrCtrl+T'),
      keywords: ['new', 'tab', 'create', 'terminal', 'open'],
      category: 'Tabs',
      icon: '+',
      execute: () => createTab(),
    },
    {
      id: 'tab.close',
      label: 'Close Tab',
      shortcut: formatShortcut('CmdOrCtrl+W'),
      keywords: ['close', 'tab', 'remove', 'delete'],
      category: 'Tabs',
      icon: '×',
      when: () => activeTabId !== null,
      execute: () => {
        const activeTab = getActiveTab();
        if (activeTab?.focusedPaneId) {
          closePane(activeTabId!, activeTab.focusedPaneId);
        } else if (activeTabId !== null) {
          closeTab(activeTabId);
        }
      },
    },
    {
      id: 'tab.closeOthers',
      label: 'Close Other Tabs',
      keywords: ['close', 'other', 'tabs', 'remove'],
      category: 'Tabs',
      when: () => tabs.length > 1,
      execute: () => {
        tabs.filter(t => t.id !== activeTabId).forEach(t => closeTab(t.id));
      },
    },
    {
      id: 'tab.closeRight',
      label: 'Close Tabs to the Right',
      keywords: ['close', 'right', 'tabs'],
      category: 'Tabs',
      when: () => {
        const idx = tabs.findIndex(t => t.id === activeTabId);
        return idx >= 0 && idx < tabs.length - 1;
      },
      execute: () => {
        const idx = tabs.findIndex(t => t.id === activeTabId);
        tabs.slice(idx + 1).forEach(t => closeTab(t.id));
      },
    },
    {
      id: 'tab.next',
      label: 'Next Tab',
      shortcut: formatShortcut('CmdOrCtrl+Shift+]'),
      keywords: ['next', 'tab', 'switch', 'right'],
      category: 'Navigation',
      icon: '→',
      when: () => tabs.length > 1,
      execute: () => {
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const nextIdx = (idx + 1) % tabs.length;
        setActiveTabId(tabs[nextIdx].id);
      },
    },
    {
      id: 'tab.previous',
      label: 'Previous Tab',
      shortcut: formatShortcut('CmdOrCtrl+Shift+['),
      keywords: ['previous', 'prev', 'tab', 'switch', 'left'],
      category: 'Navigation',
      icon: '←',
      when: () => tabs.length > 1,
      execute: () => {
        const idx = tabs.findIndex(t => t.id === activeTabId);
        const prevIdx = idx > 0 ? idx - 1 : tabs.length - 1;
        setActiveTabId(tabs[prevIdx].id);
      },
    },
    // Go to Tab 1-9
    ...Array.from({ length: 9 }, (_, i) => ({
      id: `tab.goto.${i + 1}`,
      label: `Go to Tab ${i + 1}`,
      shortcut: formatShortcut(`CmdOrCtrl+${i + 1}`),
      keywords: ['go', 'tab', `${i + 1}`, 'switch'],
      category: 'Navigation' as const,
      when: () => tabs.length > i,
      execute: () => {
        if (tabs[i]) {
          setActiveTabId(tabs[i].id);
        }
      },
    })),

    // ============ PANES ============
    {
      id: 'pane.split.vertical',
      label: 'Split Pane Vertically',
      shortcut: formatShortcut('CmdOrCtrl+D'),
      keywords: ['split', 'vertical', 'pane', 'divide', 'side'],
      category: 'Panes',
      icon: '⬚',
      when: () => activeTabId !== null,
      execute: () => {
        if (activeTabId !== null) {
          splitPane(activeTabId, 'vertical');
        }
      },
    },
    {
      id: 'pane.split.horizontal',
      label: 'Split Pane Horizontally',
      shortcut: formatShortcut('CmdOrCtrl+Shift+D'),
      keywords: ['split', 'horizontal', 'pane', 'divide', 'stack'],
      category: 'Panes',
      icon: '⬚',
      when: () => activeTabId !== null,
      execute: () => {
        if (activeTabId !== null) {
          splitPane(activeTabId, 'horizontal');
        }
      },
    },
    {
      id: 'pane.close',
      label: 'Close Current Pane',
      keywords: ['close', 'pane', 'remove'],
      category: 'Panes',
      when: () => {
        const activeTab = getActiveTab();
        return activeTab !== undefined && activeTab.panes.length > 1;
      },
      execute: () => {
        const activeTab = getActiveTab();
        if (activeTab?.focusedPaneId) {
          closePane(activeTabId!, activeTab.focusedPaneId);
        }
      },
    },
    {
      id: 'pane.next',
      label: 'Focus Next Pane',
      shortcut: formatShortcut('CmdOrCtrl+]'),
      keywords: ['next', 'pane', 'focus', 'switch'],
      category: 'Panes',
      when: () => {
        const activeTab = getActiveTab();
        return activeTab !== undefined && activeTab.panes.length > 1;
      },
      execute: () => {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.panes.length > 1) {
          const currentIndex = activeTab.panes.findIndex(p => p.id === activeTab.focusedPaneId);
          const nextIndex = (currentIndex + 1) % activeTab.panes.length;
          setFocusedPane(activeTabId!, activeTab.panes[nextIndex].id);
        }
      },
    },
    {
      id: 'pane.previous',
      label: 'Focus Previous Pane',
      shortcut: formatShortcut('CmdOrCtrl+['),
      keywords: ['previous', 'prev', 'pane', 'focus', 'switch'],
      category: 'Panes',
      when: () => {
        const activeTab = getActiveTab();
        return activeTab !== undefined && activeTab.panes.length > 1;
      },
      execute: () => {
        const activeTab = getActiveTab();
        if (activeTab && activeTab.panes.length > 1) {
          const currentIndex = activeTab.panes.findIndex(p => p.id === activeTab.focusedPaneId);
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : activeTab.panes.length - 1;
          setFocusedPane(activeTabId!, activeTab.panes[prevIndex].id);
        }
      },
    },

    // ============ AI ============
    {
      id: 'ai.panel.open',
      label: 'Open AI Panel',
      shortcut: formatShortcut('CmdOrCtrl+B'),
      keywords: ['ai', 'assistant', 'chat', 'panel', 'open', 'copilot'],
      category: 'AI',
      icon: '🤖',
      execute: () => openAIPanelWindow({ activeTabId, tabs }),
    },
    {
      id: 'ai.context.clear',
      label: 'Clear AI Context',
      keywords: ['ai', 'context', 'clear', 'reset'],
      category: 'AI',
      execute: () => {
        // Dispatch event to AI panel
        window.dispatchEvent(new CustomEvent('ai:clear-context'));
      },
    },

    // ============ SSH ============
    {
      id: 'ssh.panel.open',
      label: 'Open SSH Panel',
      shortcut: formatShortcut('CmdOrCtrl+Shift+O'),
      keywords: ['ssh', 'panel', 'connect', 'remote', 'server'],
      category: 'SSH',
      icon: '🔐',
      execute: () => openSSHPanelWindow(),
    },

    // ============ QUICK ACTIONS ============
    {
      id: 'quickActions.open',
      label: 'Open Quick Actions',
      keywords: ['quick', 'actions', 'commands', 'scripts', 'macros'],
      category: 'Quick Actions',
      icon: '⚡',
      execute: () => openQuickActionsWindow({ activeTabId, tabs }),
    },

    // ============ TERMINAL ============
    {
      id: 'terminal.history',
      label: 'Command History',
      shortcut: formatShortcut('CmdOrCtrl+R'),
      keywords: ['history', 'command', 'previous', 'recent'],
      category: 'Terminal',
      icon: '📜',
      execute: () => {
        window.dispatchEvent(new CustomEvent('toggle-command-history'));
      },
    },
    {
      id: 'terminal.search',
      label: 'Find in Terminal',
      shortcut: formatShortcut('CmdOrCtrl+F'),
      keywords: ['find', 'search', 'terminal', 'text'],
      category: 'Terminal',
      icon: '🔍',
      execute: () => {
        window.dispatchEvent(new CustomEvent('terminal:find'));
      },
    },
    {
      id: 'terminal.clear',
      label: 'Clear Terminal',
      shortcut: formatShortcut('CmdOrCtrl+K'),
      keywords: ['clear', 'terminal', 'reset', 'clean'],
      category: 'Terminal',
      icon: '🧹',
      execute: () => {
        window.dispatchEvent(new CustomEvent('terminal:clear'));
      },
    },

    // ============ SETTINGS ============
    {
      id: 'settings.open',
      label: 'Open Settings',
      shortcut: formatShortcut('CmdOrCtrl+,'),
      keywords: ['settings', 'preferences', 'options', 'config'],
      category: 'Settings',
      icon: '⚙️',
      execute: () => setIsSettingsOpen(true),
    },
    {
      id: 'settings.theme.toggle',
      label: 'Toggle Theme',
      keywords: ['theme', 'dark', 'light', 'toggle', 'appearance'],
      category: 'Settings',
      icon: '🎨',
      execute: () => {
        window.dispatchEvent(new CustomEvent('settings:toggle-theme'));
      },
    },

    // ============ ZOOM ============
    {
      id: 'zoom.in',
      label: 'Zoom In',
      shortcut: formatShortcut('CmdOrCtrl++'),
      keywords: ['zoom', 'in', 'bigger', 'increase', 'font'],
      category: 'Settings',
      icon: '🔍+',
      execute: () => {
        window.dispatchEvent(new CustomEvent('terminal:zoom-in'));
      },
    },
    {
      id: 'zoom.out',
      label: 'Zoom Out',
      shortcut: formatShortcut('CmdOrCtrl+-'),
      keywords: ['zoom', 'out', 'smaller', 'decrease', 'font'],
      category: 'Settings',
      icon: '🔍-',
      execute: () => {
        window.dispatchEvent(new CustomEvent('terminal:zoom-out'));
      },
    },
    {
      id: 'zoom.reset',
      label: 'Reset Zoom',
      shortcut: formatShortcut('CmdOrCtrl+0'),
      keywords: ['zoom', 'reset', 'default', 'font'],
      category: 'Settings',
      icon: '🔍',
      execute: () => {
        window.dispatchEvent(new CustomEvent('terminal:zoom-reset'));
      },
    },

    // ============ COMMAND PALETTE ============
    {
      id: 'palette.close',
      label: 'Close Command Palette',
      shortcut: 'Escape',
      keywords: ['close', 'palette', 'dismiss'],
      category: 'Navigation',
      execute: () => setIsCommandPaletteOpen(false),
    },
  ];
}

/**
 * Initialize actions with dependencies from the app
 * Call this in App.tsx when dependencies change
 */
export function initializeActions(deps: ActionDependencies): void {
  clearActions();
  const actions = buildActions(deps);
  registerActions(actions);
}

/**
 * Get a fresh set of actions (useful for dynamic updates)
 */
export function getActionsForDeps(deps: ActionDependencies): Action[] {
  return buildActions(deps);
}
