/**
 * Action Registry - Central registry for all app actions
 * 
 * This provides a single source of truth for:
 * - Command palette actions
 * - Keyboard shortcuts
 * - Toolbar/menu actions
 * 
 * Benefits:
 * - Discoverability: Users can search all actions
 * - Consistency: Single place to define shortcuts
 * - Extensibility: Easy to add new actions
 */

export type ActionCategory = 
  | 'Tabs'
  | 'Panes'
  | 'AI'
  | 'SSH'
  | 'Terminal'
  | 'Settings'
  | 'Navigation'
  | 'Quick Actions';

export interface Action {
  /** Unique identifier: 'tab.create', 'pane.split.vertical' */
  id: string;
  /** Display name: 'New Tab' */
  label: string;
  /** Keyboard shortcut for display: 'Cmd+T' or 'Ctrl+T' */
  shortcut?: string;
  /** Keywords for fuzzy search: ['new', 'tab', 'create'] */
  keywords?: string[];
  /** Category for grouping in command palette */
  category: ActionCategory;
  /** Icon (emoji or icon class) */
  icon?: string;
  /** Conditional availability - return false to hide/disable */
  when?: () => boolean;
  /** Execute the action */
  execute: () => void | Promise<void>;
}

// Registry map
const actionRegistry = new Map<string, Action>();

/**
 * Register a new action
 */
export function registerAction(action: Action): void {
  if (actionRegistry.has(action.id)) {
    console.warn(`Action ${action.id} is already registered, overwriting`);
  }
  actionRegistry.set(action.id, action);
}

/**
 * Register multiple actions at once
 */
export function registerActions(actions: Action[]): void {
  actions.forEach(registerAction);
}

/**
 * Unregister an action
 */
export function unregisterAction(id: string): boolean {
  return actionRegistry.delete(id);
}

/**
 * Get all registered actions
 */
export function getActions(): Action[] {
  return Array.from(actionRegistry.values());
}

/**
 * Get all available actions (respects `when` conditions)
 */
export function getAvailableActions(): Action[] {
  return getActions().filter(action => !action.when || action.when());
}

/**
 * Get actions by category
 */
export function getActionsByCategory(category: ActionCategory): Action[] {
  return getActions().filter(action => action.category === category);
}

/**
 * Get a specific action by ID
 */
export function getAction(id: string): Action | undefined {
  return actionRegistry.get(id);
}

/**
 * Execute an action by ID
 */
export function executeAction(id: string): void {
  const action = actionRegistry.get(id);
  if (!action) {
    console.error(`Action ${id} not found`);
    return;
  }
  if (action.when && !action.when()) {
    console.warn(`Action ${id} is not available`);
    return;
  }
  action.execute();
}

/**
 * Clear all actions (useful for testing or hot reload)
 */
export function clearActions(): void {
  actionRegistry.clear();
}

/**
 * Get the correct modifier key for the current platform
 */
export function getModifierKey(): 'Cmd' | 'Ctrl' {
  return navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl';
}

/**
 * Format a shortcut for display based on current platform
 * Input: 'CmdOrCtrl+T' -> Output: 'Cmd+T' or 'Ctrl+T'
 */
export function formatShortcut(shortcut: string): string {
  const modifier = getModifierKey();
  return shortcut.replace('CmdOrCtrl', modifier);
}

/**
 * Simple fuzzy search for actions
 * Returns actions sorted by relevance score
 */
export function searchActions(query: string): Action[] {
  if (!query.trim()) {
    return getAvailableActions();
  }

  const lowerQuery = query.toLowerCase().trim();
  const words = lowerQuery.split(/\s+/);

  const scored = getAvailableActions().map(action => {
    let score = 0;
    const lowerLabel = action.label.toLowerCase();
    const lowerKeywords = (action.keywords || []).map(k => k.toLowerCase());

    // Exact label match (highest priority)
    if (lowerLabel === lowerQuery) {
      score += 100;
    }
    // Label starts with query
    else if (lowerLabel.startsWith(lowerQuery)) {
      score += 80;
    }
    // Label contains query
    else if (lowerLabel.includes(lowerQuery)) {
      score += 60;
    }

    // Check each word
    for (const word of words) {
      // Word in label
      if (lowerLabel.includes(word)) {
        score += 30;
      }
      // Word in keywords
      if (lowerKeywords.some(k => k.includes(word))) {
        score += 20;
      }
      // Word matches category
      if (action.category.toLowerCase().includes(word)) {
        score += 15;
      }
      // Word in ID
      if (action.id.toLowerCase().includes(word)) {
        score += 10;
      }
    }

    return { action, score };
  });

  // Filter out zero scores and sort by score descending
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(s => s.action);
}

/**
 * Group actions by category
 */
export function groupActionsByCategory(actions: Action[]): Map<ActionCategory, Action[]> {
  const groups = new Map<ActionCategory, Action[]>();
  
  for (const action of actions) {
    const existing = groups.get(action.category) || [];
    existing.push(action);
    groups.set(action.category, existing);
  }
  
  return groups;
}

// Category display order for command palette
export const CATEGORY_ORDER: ActionCategory[] = [
  'Tabs',
  'Panes',
  'Terminal',
  'AI',
  'SSH',
  'Quick Actions',
  'Settings',
  'Navigation',
];

/**
 * Sort categories by display order
 */
export function sortCategories(categories: ActionCategory[]): ActionCategory[] {
  return categories.sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a);
    const indexB = CATEGORY_ORDER.indexOf(b);
    return indexA - indexB;
  });
}
