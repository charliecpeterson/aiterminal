import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerAction,
  registerActions,
  unregisterAction,
  getActions,
  getAvailableActions,
  getActionsByCategory,
  getAction,
  executeAction,
  clearActions,
  formatShortcut,
  searchActions,
  groupActionsByCategory,
  sortCategories,
  CATEGORY_ORDER,
  type Action,
} from './actionRegistry';

describe('actionRegistry', () => {
  beforeEach(() => {
    clearActions();
  });

  const createTestAction = (overrides: Partial<Action> = {}): Action => ({
    id: 'test.action',
    label: 'Test Action',
    category: 'Terminal',
    execute: vi.fn(),
    ...overrides,
  });

  describe('registerAction', () => {
    it('should register an action', () => {
      const action = createTestAction();
      registerAction(action);
      
      expect(getAction('test.action')).toBe(action);
    });

    it('should overwrite existing action with same id', () => {
      const action1 = createTestAction({ label: 'First' });
      const action2 = createTestAction({ label: 'Second' });
      
      registerAction(action1);
      registerAction(action2);
      
      expect(getAction('test.action')?.label).toBe('Second');
    });
  });

  describe('registerActions', () => {
    it('should register multiple actions at once', () => {
      const actions = [
        createTestAction({ id: 'action1' }),
        createTestAction({ id: 'action2' }),
        createTestAction({ id: 'action3' }),
      ];
      
      registerActions(actions);
      
      expect(getActions()).toHaveLength(3);
    });
  });

  describe('unregisterAction', () => {
    it('should remove an action', () => {
      registerAction(createTestAction());
      
      const result = unregisterAction('test.action');
      
      expect(result).toBe(true);
      expect(getAction('test.action')).toBeUndefined();
    });

    it('should return false for non-existent action', () => {
      const result = unregisterAction('non.existent');
      
      expect(result).toBe(false);
    });
  });

  describe('getActions', () => {
    it('should return all registered actions', () => {
      registerActions([
        createTestAction({ id: 'a1' }),
        createTestAction({ id: 'a2' }),
      ]);
      
      const actions = getActions();
      
      expect(actions).toHaveLength(2);
    });

    it('should return empty array when no actions registered', () => {
      expect(getActions()).toEqual([]);
    });
  });

  describe('getAvailableActions', () => {
    it('should return actions without when condition', () => {
      registerAction(createTestAction());
      
      expect(getAvailableActions()).toHaveLength(1);
    });

    it('should return actions where when() returns true', () => {
      registerAction(createTestAction({ when: () => true }));
      
      expect(getAvailableActions()).toHaveLength(1);
    });

    it('should filter out actions where when() returns false', () => {
      registerAction(createTestAction({ when: () => false }));
      
      expect(getAvailableActions()).toHaveLength(0);
    });

    it('should mix available and unavailable actions', () => {
      registerActions([
        createTestAction({ id: 'available', when: () => true }),
        createTestAction({ id: 'unavailable', when: () => false }),
        createTestAction({ id: 'noCondition' }),
      ]);
      
      expect(getAvailableActions()).toHaveLength(2);
    });
  });

  describe('getActionsByCategory', () => {
    it('should filter actions by category', () => {
      registerActions([
        createTestAction({ id: 'a1', category: 'Terminal' }),
        createTestAction({ id: 'a2', category: 'AI' }),
        createTestAction({ id: 'a3', category: 'Terminal' }),
      ]);
      
      const terminalActions = getActionsByCategory('Terminal');
      
      expect(terminalActions).toHaveLength(2);
      expect(terminalActions.every(a => a.category === 'Terminal')).toBe(true);
    });

    it('should return empty array for category with no actions', () => {
      registerAction(createTestAction({ category: 'Terminal' }));
      
      expect(getActionsByCategory('AI')).toEqual([]);
    });
  });

  describe('executeAction', () => {
    it('should execute action by id', () => {
      const execute = vi.fn();
      registerAction(createTestAction({ execute }));
      
      executeAction('test.action');
      
      expect(execute).toHaveBeenCalledOnce();
    });

    it('should not execute non-existent action', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      executeAction('non.existent');
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should not execute unavailable action', () => {
      const execute = vi.fn();
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      registerAction(createTestAction({ execute, when: () => false }));
      
      executeAction('test.action');
      
      expect(execute).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('clearActions', () => {
    it('should remove all actions', () => {
      registerActions([
        createTestAction({ id: 'a1' }),
        createTestAction({ id: 'a2' }),
      ]);
      
      clearActions();
      
      expect(getActions()).toEqual([]);
    });
  });

  describe('formatShortcut', () => {
    it('should replace CmdOrCtrl with platform modifier', () => {
      const result = formatShortcut('CmdOrCtrl+T');
      // Result will be either 'Cmd+T' or 'Ctrl+T' depending on platform
      expect(result).toMatch(/^(Cmd|Ctrl)\+T$/);
    });

    it('should not modify shortcuts without CmdOrCtrl', () => {
      expect(formatShortcut('Shift+Enter')).toBe('Shift+Enter');
      expect(formatShortcut('Alt+F4')).toBe('Alt+F4');
    });
  });

  describe('searchActions', () => {
    beforeEach(() => {
      registerActions([
        createTestAction({ id: 'tab.new', label: 'New Tab', category: 'Tabs', keywords: ['create', 'open'] }),
        createTestAction({ id: 'tab.close', label: 'Close Tab', category: 'Tabs' }),
        createTestAction({ id: 'terminal.clear', label: 'Clear Terminal', category: 'Terminal' }),
        createTestAction({ id: 'ai.chat', label: 'Open AI Chat', category: 'AI', keywords: ['assistant'] }),
      ]);
    });

    it('should return all available actions for empty query', () => {
      const results = searchActions('');
      expect(results).toHaveLength(4);
    });

    it('should return all available actions for whitespace query', () => {
      const results = searchActions('   ');
      expect(results).toHaveLength(4);
    });

    it('should find actions by exact label match', () => {
      const results = searchActions('New Tab');
      expect(results[0].id).toBe('tab.new');
    });

    it('should find actions by partial label match', () => {
      const results = searchActions('Tab');
      expect(results.some(a => a.id === 'tab.new')).toBe(true);
      expect(results.some(a => a.id === 'tab.close')).toBe(true);
    });

    it('should find actions by keyword', () => {
      const results = searchActions('create');
      expect(results[0].id).toBe('tab.new');
    });

    it('should find actions by category', () => {
      const results = searchActions('terminal');
      expect(results.some(a => a.category === 'Terminal')).toBe(true);
    });

    it('should find actions by id', () => {
      const results = searchActions('ai.chat');
      expect(results[0].id).toBe('ai.chat');
    });

    it('should return empty array for no matches', () => {
      const results = searchActions('xyznonexistent');
      expect(results).toEqual([]);
    });

    it('should sort by relevance (exact match first)', () => {
      const results = searchActions('New Tab');
      // Exact label match should be first
      expect(results[0].label).toBe('New Tab');
    });
  });

  describe('groupActionsByCategory', () => {
    it('should group actions by category', () => {
      const actions = [
        createTestAction({ id: 'a1', category: 'Tabs' }),
        createTestAction({ id: 'a2', category: 'AI' }),
        createTestAction({ id: 'a3', category: 'Tabs' }),
      ];
      
      const groups = groupActionsByCategory(actions);
      
      expect(groups.get('Tabs')).toHaveLength(2);
      expect(groups.get('AI')).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const groups = groupActionsByCategory([]);
      expect(groups.size).toBe(0);
    });
  });

  describe('sortCategories', () => {
    it('should sort categories by CATEGORY_ORDER', () => {
      const categories = ['AI', 'Tabs', 'Settings', 'Terminal'] as const;
      const sorted = sortCategories([...categories]);
      
      expect(sorted).toEqual(['Tabs', 'Terminal', 'AI', 'Settings']);
    });

    it('should handle empty array', () => {
      expect(sortCategories([])).toEqual([]);
    });

    it('should handle single category', () => {
      expect(sortCategories(['AI'])).toEqual(['AI']);
    });
  });

  describe('CATEGORY_ORDER', () => {
    it('should contain all expected categories', () => {
      expect(CATEGORY_ORDER).toContain('Tabs');
      expect(CATEGORY_ORDER).toContain('Panes');
      expect(CATEGORY_ORDER).toContain('Terminal');
      expect(CATEGORY_ORDER).toContain('AI');
      expect(CATEGORY_ORDER).toContain('SSH');
      expect(CATEGORY_ORDER).toContain('Settings');
      expect(CATEGORY_ORDER).toContain('Navigation');
      expect(CATEGORY_ORDER).toContain('Quick Actions');
    });
  });
});
